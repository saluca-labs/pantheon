# Part IV: Threat Detection & Response

> **Tiresias Administration Guide -- v3.0**
> Chapters 11--14

---

## Chapter 11: SoulWatch -- Detection Engine

SoulWatch is the runtime security monitoring service of the Tiresias platform. It ingests audit events produced by SoulAuth, evaluates them against behavioral baselines and Sigma-compatible detection rules, and triggers automated response actions when threats are identified. This chapter covers the detection engine architecture, deployment modes, and the event processing pipeline.

### 11.1 Detection Engine Architecture

The SoulWatch detection engine processes every audit event through a six-stage pipeline before the event leaves the system. The stages execute in strict order within a single `process_event` call, ensuring that detection, response, and forwarding are atomic per event.

**Pipeline stages:**

| Stage | Component | Description |
|-------|-----------|-------------|
| 0 | Geo Enrichment | Adds geographic threat intelligence to the event (consent-gated) |
| 1 | Anomaly Detection | Compares the event against the agent's behavioral baseline using sliding-window analysis |
| 2 | Sigma Rule Evaluation | Matches the event against all enabled Sigma detection rules |
| 3 | Playbook Execution | Runs automated response playbooks for any rule matches |
| 4 | Quarantine Evaluation | Checks whether detected anomalies exceed quarantine thresholds and executes enforcement actions |
| 5 | SIEM Forwarding | Forwards detection events to configured SIEM destinations (Splunk, Elastic, Syslog, Azure Sentinel, webhook) |
| 6 | WebSocket Broadcast | Pushes anomalies and detections to connected Portal dashboards in real time |

Each stage is isolated: a failure in one stage (e.g., SIEM forwarding timeout) does not prevent subsequent stages from executing. All exceptions are caught, logged with structured context, and the pipeline continues.

**Data flow summary:**

```
Audit Event (SoulAuth)
    |
    v
[Geo Enrichment] -- adds threat intel metadata
    |
    v
[Anomaly Detector] -- sliding-window + baseline comparison
    |                  writes to _soulwatch_anomalies table
    v
[Sigma Engine] -- pattern + aggregation matching
    |              writes to _soulwatch_detections table
    v
[Playbook Engine] -- executes response actions (quarantine, notify, rate_limit)
    |
    v
[Quarantine Engine] -- evaluates severity thresholds, calls SoulAuth admin API
    |
    v
[SIEM Forwarder] -- CEF-formatted events to external systems
    |
    v
[WebSocket Manager] -- real-time push to Portal
```

**Metrics instrumentation:** Every event processed increments the `soulwatch_events_processed_total` Prometheus counter. Detection matches increment `soulwatch_detections_total` (labeled by `rule_id` and `level`). Pipeline duration is tracked in the `soulwatch_pipeline_duration_seconds` histogram.

### 11.2 Deployment Modes: Sidecar vs. Standalone

SoulWatch supports two deployment modes, configured via the `SOULWATCH_MODE` environment variable.

#### Sidecar Mode (Default)

In sidecar mode, SoulWatch shares a database with SoulAuth and polls the `_soulauth_audit` table for new events. This is the recommended deployment for production.

```
SOULWATCH_MODE=sidecar
```

**How it works:**

1. The `AuditTablePoller` starts a background async task on application startup.
2. It queries for events with `(timestamp, id) > (last_processed_ts, last_processed_id)`, ordered ascending, in batches.
3. Each batch is processed through the full pipeline.
4. If a full batch is returned (batch_size events), the poller immediately queries again without waiting. Otherwise, it sleeps for the configured poll interval.
5. The checkpoint (`last_processed_id`, `last_processed_ts`) is maintained in memory. On restart, it queries the most recent audit event and starts from there.

**Configuration parameters:**

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `SOULWATCH_POLL_INTERVAL_SECONDS` | `5` | Seconds between poll cycles when no full batch is returned |
| `SOULWATCH_PIPELINE_BATCH_SIZE` | `100` | Maximum events per poll query |

**Advantages:**
- Zero network overhead (shared database)
- No event delivery failures (events are read directly from the audit table)
- Guaranteed ordering (events processed in timestamp order)

#### Standalone Mode

In standalone mode, SoulWatch receives events via its HTTP API. This mode is used when SoulWatch runs on a separate host or when events are produced by services other than SoulAuth (e.g., LLM call auditing via the Aletheia subsystem).

```
SOULWATCH_MODE=standalone
```

**Event ingestion endpoint:**

```
POST /watch/v1/events
Headers:
  X-Internal-Key: <SOULWATCH_INTERNAL_API_KEY>
  Content-Type: application/json

Body: {
  "event_type": "auth_grant",
  "soulkey_id": "550e8400-e29b-41d4-a716-446655440000",
  "tenant_id": "a1b2c3d4-...",
  "resource": "models/gpt-4",
  "action": "read",
  "scope": "models:read",
  "decision": "allow",
  "timestamp": "2026-04-02T14:30:00Z",
  "context": {
    "source_ip": "10.0.1.50",
    "node": "worker-3"
  }
}
```

The `X-Internal-Key` header must match the `SOULWATCH_INTERNAL_API_KEY` environment variable. Requests with a missing or incorrect key receive a `401 Unauthorized` response.

**Advantages:**
- SoulWatch can run on a separate host or cluster
- Can ingest events from multiple sources (SoulAuth, Aletheia, custom agents)
- Works in air-gapped environments where SoulWatch cannot access the SoulAuth database

### 11.3 Built-In Anomaly Types

The anomaly detection engine includes 18 built-in detectors organized into two tiers: core detectors (available since v1.0) and advanced threat detectors (added in Phase 7).

#### Core Detectors

| Anomaly Type | Default Severity | Threshold Multiplier | Description |
|-------------|-----------------|---------------------|-------------|
| `rate_spike` | High | 3.0x baseline | Request rate exceeds 3x the agent's typical hourly rate |
| `off_hours` | Medium | n/a | Activity outside the agent's established operating hours |
| `new_resource` | Medium (Low if no baseline) | n/a | Agent accesses a resource not seen in its baseline |
| `scope_escalation` | High | n/a | Agent requests a scope never used before |
| `denial_spike` | High | 2.0x baseline | Denial rate exceeds 2x the agent's typical denial rate (minimum 3 denials) |
| `burst` | High | 2.0x baseline | More than 2x the typical burst count in a 60-second window |
| `impossible_travel` | Critical | <2 seconds | Requests from two different nodes within 2 seconds |
| `credential_stuffing` | Critical | 5 failures | 5+ failed authentication attempts from one source in 5 minutes |

#### Advanced Threat Detectors (Phase 7)

| Anomaly Type | Default Severity | Description |
|-------------|-----------------|-------------|
| `session_hijack` | Critical | Session used from an unexpected node, indicating stolen session tokens |
| `model_abuse` | High | Agent requests a model outside its typical set |
| `token_harvesting` | High | Output/input token ratio below 0.1 with >1000 input tokens (exfiltration signal) |
| `data_poisoning` | Medium | Systematic injection of adversarial data into training pipelines |
| `lateral_movement` | Critical | Cross-tenant resource access (source tenant differs from target tenant) |
| `persistence` | High | Unauthorized creation of persistent access mechanisms |
| `evasion` | High | Attempts to disable or circumvent detection controls |
| `supply_chain` | High | Compromise of upstream dependencies or tool chains |
| `resource_abuse` | High | Request cost exceeds 5x the agent's typical per-request cost |
| `credential_rotation` | High | 3+ credential lifecycle events (issue/revoke/suspend) in the detection window |

All anomalies are persisted to the `_soulwatch_anomalies` database table with full evidence, baseline values, observed values, and a link to the source event. Anomalies begin in `open` status and can transition to `acknowledged`, `resolved`, or `false_positive`.

### 11.4 Configure Detection Sensitivity

Anomaly thresholds are configured per anomaly type when constructing the `AnomalyDetector`. The defaults are defined in `AnomalyDetector.DEFAULT_THRESHOLDS`.

**To override thresholds at startup**, modify the detector initialization in `main.py`:

```python
detector = AnomalyDetector(
    baseline_engine=baseline_engine,
    thresholds={
        AnomalyType.RATE_SPIKE: 5.0,       # More permissive (5x instead of 3x)
        AnomalyType.BURST: 3.0,             # More permissive
        AnomalyType.CREDENTIAL_STUFFING: 10, # Require 10 failures instead of 5
    },
    window_size=600,  # 10-minute sliding window (default: 300s / 5min)
)
```

The `window_size` parameter controls the sliding window duration in seconds for rate and burst calculations. Increasing this value smooths out short spikes but increases detection latency.

**Threshold interpretation:**
- For rate-based anomalies (`rate_spike`, `burst`, `denial_spike`), the threshold is a **multiplier** applied to the baseline value.
- For count-based anomalies (`credential_stuffing`, `credential_rotation`), the threshold is an **absolute count**.
- For binary anomalies (`off_hours`, `new_resource`, `scope_escalation`), the threshold is `1` (any occurrence triggers detection).

### 11.5 Manage Alert Severity Levels

SoulWatch uses a five-level severity scale:

| Level | Numeric Weight | Usage |
|-------|---------------|-------|
| `informational` | 0 | Baseline deviations within expected variance |
| `low` | 1 | Minor behavioral anomalies requiring investigation |
| `medium` | 2 | Confirmed behavioral deviations (off-hours, new resource) |
| `high` | 3 | Active threat indicators (rate spikes, scope escalation, privilege abuse) |
| `critical` | 4 | Immediate response required (credential stuffing, impossible travel, session hijack, lateral movement) |

Severity is used by:
- **Playbook engine** -- playbooks fire only when severity meets or exceeds `severity_threshold`
- **Quarantine engine** -- quarantine policies match on severity thresholds
- **Notification routing** -- the `SOULWATCH_NOTIFICATION_SEVERITY_THRESHOLD` environment variable filters which anomalies generate notifications (default: `medium`)
- **SIEM forwarding** -- CEF severity mapping for external correlation

### 11.6 Configure Alert Escalation Paths

Alert routing is handled by the `AlertRouter`, which dispatches anomalies to one or more sinks based on severity.

**Built-in alert sinks:**

| Sink | Configuration | Notes |
|------|--------------|-------|
| Prometheus | Always active | Exposes anomaly counts as Prometheus metrics |
| Telegram | `SOULWATCH_TELEGRAM_BOT_TOKEN` + `SOULWATCH_TELEGRAM_CHAT_ID` | Auto-configured at startup; defaults to `critical` severity only |
| PagerDuty | `SOULWATCH_PAGERDUTY_ROUTING_KEY` | Configured via notification settings |
| Slack | `SOULWATCH_SLACK_WEBHOOK_URL` | Configured via notification settings |
| Email | `SOULWATCH_EMAIL_SMTP_HOST` + related variables | SMTP-based email alerts |
| Webhook | Configured per playbook | SSRF-protected (HTTPS only, no private/internal IPs) |

**API endpoints for alert management:**

```
GET  /watch/v1/anomalies                  -- List anomalies with filters
GET  /watch/v1/anomalies/stats            -- Aggregated stats (by type, severity, status)
GET  /watch/v1/anomalies/{anomaly_id}     -- Get anomaly detail
PATCH /watch/v1/anomalies/{anomaly_id}    -- Update status (open/acknowledged/resolved/false_positive)
```

---

## Chapter 12: Sigma Detection Rules

SoulWatch implements a Sigma-compatible detection rule engine that evaluates every audit event against a library of YAML-based rules. This chapter covers the rule format, the built-in rule library, custom rule authoring, aggregation, testing, and lifecycle management.

### 12.1 Sigma Rule Format for Tiresias

Tiresias Sigma rules follow the standard Sigma specification with extensions for agent security. Each rule is a YAML document with the following top-level fields:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique rule identifier (auto-generated UUID if omitted) |
| `title` | Yes | Human-readable rule name |
| `description` | No | Detailed description of what the rule detects and why |
| `status` | No | Rule maturity: `experimental`, `test`, `stable` (default: `experimental`) |
| `level` | No | Severity: `informational`, `low`, `medium`, `high`, `critical` (default: `medium`) |
| `logsource` | No | Event source filter. Default: `{product: soulauth, service: audit}` |
| `detection` | Yes | Detection logic: selection blocks, conditions, timeframes |
| `tags` | No | MITRE ATT&CK tags and Tiresias-specific tags |
| `response_playbook` | No | ID of the playbook to execute on match |
| `enabled` | No | Whether the rule is active (default: `true`) |

**Logsource values:**

| Product | Service | Description |
|---------|---------|-------------|
| `soulauth` | `audit` | SoulAuth authentication and authorization events |
| `tiresias` | `aletheia` | Tool invocation and execution events from the Aletheia subsystem |

#### Supported Detection Syntax

The Sigma engine supports the following detection constructs:

**Field matching:**
- Exact match: `event_type: auth_deny`
- List (OR within field): `event_type: [auth_grant, capability_used]`
- Wildcards: `resource: "admin*"` (glob-style, case-insensitive)

**Field modifiers (pipe syntax):**
- `|contains` -- substring match: `reason|contains: "suspended"`
- `|startswith` -- prefix match: `resource|startswith: "admin"`
- `|endswith` -- suffix match: `resource|endswith: ".secret"`
- `|gt`, `|lt`, `|gte`, `|lte` -- numeric comparisons: `exit_code|gt: 0`

**Nested fields (dot notation):**
- `context.source_ip: "10.0.1.*"`
- `context.off_hours: "true"`

**Condition operators:**
- `selection` -- match a single named selection block
- `selection_a AND selection_b` -- all selections must match
- `selection_a OR selection_b` -- any selection may match
- `NOT selection_a` -- negate a selection
- `selection | count() > N` -- aggregation with threshold

**Aggregation:**
- `condition: selection | count() > 5` with `timeframe: 2m`
- Events are grouped by `soulkey_id`, `persona_id`, or `context.source_ip`
- Supported operators: `>`, `>=`, `<`, `<=`, `==`, `!=`
- Supported timeframe units: `s` (seconds), `m` (minutes), `h` (hours), `d` (days)

### 12.2 Built-In Detection Rules

SoulWatch ships with 13 built-in Sigma rules covering authentication attacks, privilege escalation, data exfiltration, platform integrity, and tool abuse.

#### Authentication and Credential Rules

**sa-rule-001-credential-stuffing** -- Credential Stuffing

Detects brute-force attacks against SoulAuth by counting failed authentication attempts.

```yaml
title: Credential Stuffing - Multiple Failed Auth Attempts
id: sa-rule-001-credential-stuffing
status: stable
level: critical
description: >
  Detects multiple failed authentication attempts within a short time window,
  indicative of credential stuffing or brute-force attacks against SoulAuth.
logsource:
  product: soulauth
  service: audit
detection:
  selection:
    event_type: auth_deny
    decision: deny
  condition: selection | count() > 5
  timeframe: 2m
tags:
  - attack.credential_access
  - attack.t1110
  - soulauth.brute_force
response_playbook: pb-auto-quarantine
enabled: true
```

**sa-rule-006-key-abuse** -- Suspended/Revoked Key Use

Detects attempts to authenticate with credentials that have been deactivated.

```yaml
title: Key Abuse - Suspended/Revoked Key Repeated Use Attempts
id: sa-rule-006-key-abuse
status: stable
level: critical
description: >
  Detects repeated attempts to use a suspended or revoked SoulKey. Three or more
  attempts indicate either a misconfigured integration or an attacker attempting
  to use stolen credentials that have been deactivated.
logsource:
  product: soulauth
  service: audit
detection:
  selection:
    event_type: auth_deny
    reason|contains: "suspended"
  selection_revoked:
    event_type: auth_deny
    reason|contains: "revoked"
  condition: selection OR selection_revoked
tags:
  - attack.credential_access
  - attack.t1078.004
  - soulauth.key_abuse
response_playbook: pb-auto-quarantine
enabled: true
```

#### Privilege Escalation and Access Rules

**sa-rule-002-privilege-escalation** -- Unusual Scope Requests

```yaml
title: Privilege Escalation - Unusual Scope Request with High Denial Rate
id: sa-rule-002-privilege-escalation
status: stable
level: high
description: >
  Detects an agent requesting scopes or resources it has never used before,
  combined with a high denial rate -- a strong indicator of privilege escalation
  attempts or compromised agent credentials.
logsource:
  product: soulauth
  service: audit
detection:
  selection:
    event_type:
      - scope_violation
      - escalation_requested
      - auth_deny
    decision: deny
  condition: selection | count() > 3
  timeframe: 5m
tags:
  - attack.privilege_escalation
  - attack.t1078
  - soulauth.scope_violation
response_playbook: pb-rate-limit-alert
enabled: true
```

**sa-rule-005-prompt-injection** -- Prompt Injection Signal

```yaml
title: Prompt Injection Signal - Sudden Admin Resource Access
id: sa-rule-005-prompt-injection
status: stable
level: critical
description: >
  Detects when an agent that normally accesses only user-level resources suddenly
  begins requesting access to admin or system resources. This is a strong signal
  for prompt injection or agent compromise.
logsource:
  product: soulauth
  service: audit
detection:
  selection:
    event_type:
      - auth_grant
      - auth_deny
      - escalation_requested
    resource|startswith: "admin"
  filter_system:
    resource|startswith: "system"
  condition: selection OR filter_system
tags:
  - attack.initial_access
  - attack.t1190
  - soulauth.prompt_injection
  - soulauth.agent_compromise
response_playbook: pb-auto-quarantine
enabled: true
```

#### Data Exfiltration Rules

**sa-rule-004-data-exfiltration** -- Abnormal Read Volume

```yaml
title: Data Exfiltration - Abnormal Read Volume
id: sa-rule-004-data-exfiltration
status: stable
level: high
description: >
  Detects abnormally high read operations from a single agent within a short
  time window (>100 reads in 5 minutes). May indicate data exfiltration,
  scraping, or a compromised agent credential being used for bulk access.
logsource:
  product: soulauth
  service: audit
detection:
  selection:
    event_type:
      - auth_grant
      - capability_used
    action: read
  condition: selection | count() > 100
  timeframe: 5m
tags:
  - attack.exfiltration
  - attack.t1048
  - soulauth.abnormal_volume
response_playbook: pb-rate-limit-alert
enabled: true
```

#### Behavioral Rules

**sa-rule-003-off-hours-activity** -- Off-Hours Activity

```yaml
title: Off-Hours Agent Activity
id: sa-rule-003-off-hours-activity
status: stable
level: medium
description: >
  Detects agent activity outside configured business hours (00:00-06:00 UTC).
  Legitimate automated agents may operate 24/7, but human-directed agents
  operating off-hours warrant investigation.
logsource:
  product: soulauth
  service: audit
detection:
  selection:
    event_type:
      - auth_grant
      - capability_used
    context.off_hours: "true"
  condition: selection
tags:
  - attack.execution
  - soulauth.off_hours
response_playbook: pb-investigate
enabled: true
```

#### Platform Integrity Rules

**sa-rule-007-tier-tampering** -- License Tier Tampering

```yaml
title: License Tier Tampering - Direct DB Modification
id: sa-rule-007-tier-tampering
status: stable
level: critical
description: >
  Detects when a tenant's tier field is modified outside of the legitimate
  billing flow (Stripe webhook or admin upgrade endpoint). A direct DB update
  to _soul_tenants.tier bypassing the application layer indicates tampering.
logsource:
  product: soulauth
  service: audit
detection:
  selection:
    event_type: tier_changed
  filter_legitimate:
    context.source|contains:
      - "stripe_webhook"
      - "billing_upgrade"
      - "admin_license_issue"
      - "saas_provision"
  condition: selection and not filter_legitimate
  timeframe: 1m
tags:
  - attack.privilege_escalation
  - attack.t1548
  - tiresias.license_tampering
response_playbook: pb-auto-quarantine
enabled: true
```

**sa-rule-008-license-integrity** -- License Integrity Violation

```yaml
title: License Integrity Violation - Tier Mismatch
id: sa-rule-008-license-integrity
status: stable
level: high
description: >
  Detects when the running license tier does not match the tier stored in the
  database, or when TIRESIAS_LICENSE_KEY / TIRESIAS_TIER env vars have changed
  since startup. This indicates runtime tampering with license configuration.
logsource:
  product: soulauth
  service: audit
detection:
  selection:
    event_type: license_integrity_violation
  condition: selection
  timeframe: 5m
tags:
  - attack.defense_evasion
  - attack.t1562
  - tiresias.license_tampering
response_playbook: pb-auto-quarantine
enabled: true
```

**sa-rule-009-config-tampering** -- Configuration File Tampering

```yaml
title: Config File Tampering - Unauthorized Modification
id: sa-rule-009-config-tampering
status: stable
level: critical
description: >
  Detects unauthorized modifications to critical configuration files
  (.env, docker-compose.yml, policy YAML files, alembic.ini) after
  application startup. Changes outside of a deployment pipeline indicate tampering.
logsource:
  product: soulauth
  service: audit
detection:
  selection:
    event_type: config_integrity_violation
  condition: selection
  timeframe: 1m
tags:
  - attack.defense_evasion
  - attack.t1562.001
  - tiresias.config_tampering
response_playbook: pb-auto-quarantine
enabled: true
```

#### Tool Abuse Rules (Aletheia)

These rules monitor tool invocations processed through the Aletheia execution subsystem.

**aletheia-tool-001** -- Destructive Tool Command

```yaml
title: Destructive Tool Command Detected
id: aletheia-tool-001
status: stable
level: high
description: >
  Agent executed a potentially destructive CLI command such as rm -rf,
  drop table, or force push. Requires immediate investigation.
logsource:
  product: tiresias
  service: aletheia
detection:
  selection:
    event_type: tool_invocation
    full_command|contains:
      - "rm -rf"
      - "drop table"
      - "delete --force"
      - "push --force"
      - "mkfs"
      - "dd if="
  condition: selection
tags:
  - attack.impact
  - aletheia.destructive_tool
response_playbook: investigate
enabled: true
```

**aletheia-tool-003** -- Tool Policy Denial

```yaml
title: Tool Policy Denial
id: aletheia-tool-003
status: stable
level: high
description: >
  Agent attempted a tool invocation that was denied by the execution
  policy engine. May indicate sandbox escape attempts or unauthorized
  tooling access.
logsource:
  product: tiresias
  service: aletheia
detection:
  selection:
    event_type: tool_invocation
    policy_verdict: deny
  condition: selection
tags:
  - aletheia.policy_violation
response_playbook: investigate
enabled: true
```

**aletheia-tool-004** -- Sanitizer Block

```yaml
title: Sanitizer Blocked Tool Output
id: aletheia-tool-004
status: stable
level: high
description: >
  The output sanitizer blocked tool invocation output, indicating
  potential sensitive data exfiltration or injection in command output.
logsource:
  product: tiresias
  service: aletheia
detection:
  selection:
    event_type: tool_invocation
    sanitizer_verdict: block
  condition: selection
tags:
  - aletheia.sanitizer_block
  - attack.exfiltration
response_playbook: investigate
enabled: true
```

### 12.3 Write Custom Detection Rules

Custom rules extend the built-in library with organization-specific detections. They are submitted via the API and persisted in the database.

#### Step 1: Author the Rule in YAML

Create a YAML file following the Sigma format. Here is an example that detects agents accessing a sensitive internal API:

```yaml
title: Sensitive API Access - Internal Payroll Service
id: custom-001-payroll-access
status: experimental
level: high
description: >
  Detects any agent accessing the internal payroll service API.
  Only the payroll-agent should have access to this resource.
logsource:
  product: soulauth
  service: audit
detection:
  selection:
    event_type:
      - auth_grant
      - auth_deny
    resource|startswith: "services/payroll"
  filter_allowed:
    persona_id: "payroll-agent"
  condition: selection AND NOT filter_allowed
tags:
  - custom.payroll_access
  - attack.lateral_movement
response_playbook: pb-rate-limit-alert
enabled: true
```

#### Step 2: Submit via API

```bash
curl -X POST https://tiresias.example.com/watch/v1/rules \
  -H "Content-Type: text/yaml" \
  --data-binary @custom-001-payroll-access.yml
```

**Response (201 Created):**

```json
{
  "id": "custom-001-payroll-access",
  "title": "Sensitive API Access - Internal Payroll Service",
  "description": "Detects any agent accessing the internal payroll service API...",
  "status": "experimental",
  "level": "high",
  "logsource": {"product": "soulauth", "service": "audit"},
  "detection": { ... },
  "tags": ["custom.payroll_access", "attack.lateral_movement"],
  "response_playbook": "pb-rate-limit-alert",
  "enabled": true,
  "is_custom": true
}
```

Custom rules are marked with `is_custom: true` and persisted to the `_soulwatch_custom_rules` database table. They survive service restarts and are loaded alongside built-in rules during startup.

#### Step 3: Verify the Rule Loaded

```bash
curl https://tiresias.example.com/watch/v1/rules/custom-001-payroll-access
```

> **Security note:** Custom Sigma rules accept user-supplied patterns in their detection blocks. Malicious or poorly written regex can cause catastrophic backtracking (ReDoS), blocking the event loop. Review all custom rules before deploying to production.

### 12.4 Configure Time-Window Aggregations

Aggregation rules use the `count()` function with a `timeframe` to detect patterns that only become significant when repeated within a window.

**Aggregation syntax:**

```yaml
detection:
  selection:
    event_type: auth_deny
    decision: deny
  condition: selection | count() > 5
  timeframe: 2m
```

**How aggregation works internally:**

1. When an event matches the selection block, it is added to an in-memory `_AggregationState` buffer (max 10,000 events per group).
2. Events are grouped by `soulkey_id`, `persona_id`, or `context.source_ip` (first non-empty value).
3. The buffer is pruned: events older than the timeframe window are removed.
4. The current count within the window is compared against the threshold using the specified operator.
5. If triggered, the match includes an `_aggregation` key in `matched_fields` with count, threshold, operator, window duration, and group key.

**Supported timeframe values:**

| Format | Example | Duration |
|--------|---------|----------|
| `Ns` | `30s` | 30 seconds |
| `Nm` | `5m` | 5 minutes |
| `Nh` | `1h` | 1 hour |
| `Nd` | `1d` | 1 day |

If no `timeframe` is specified on an aggregation rule, the default window is 5 minutes.

**Example: Sliding-window correlation**

```yaml
title: Repeated Scope Violations - Sustained Attack
id: custom-002-sustained-scope-attack
status: experimental
level: critical
description: >
  Detects 10 or more scope violations from a single agent in 10 minutes,
  indicating a sustained privilege escalation attack.
detection:
  selection:
    event_type: scope_violation
    decision: deny
  condition: selection | count() >= 10
  timeframe: 10m
response_playbook: pb-auto-quarantine
```

### 12.5 Test Rules Against Historical Data

Before enabling a rule in production, test it against a sample event using the rule test endpoint.

**API endpoint:**

```
POST /watch/v1/rules/{rule_id}/test
Content-Type: application/json

{
  "event": {
    "event_type": "auth_deny",
    "decision": "deny",
    "soulkey_id": "550e8400-e29b-41d4-a716-446655440000",
    "resource": "admin/users",
    "action": "write",
    "scope": "admin:write",
    "reason": "scope not authorized",
    "timestamp": "2026-04-02T03:15:00Z",
    "context": {
      "source_ip": "10.0.1.50",
      "node": "worker-3"
    }
  }
}
```

**Response (rule matched):**

```json
{
  "matched": true,
  "matched_fields": {
    "event_type": {
      "expected": ["auth_grant", "auth_deny", "escalation_requested"],
      "actual": "auth_deny"
    },
    "resource": {
      "expected": "admin",
      "actual": "admin/users"
    }
  },
  "rule_id": "sa-rule-005-prompt-injection",
  "rule_title": "Prompt Injection Signal - Sudden Admin Resource Access"
}
```

**Response (no match):**

```json
{
  "matched": false,
  "matched_fields": {},
  "rule_id": "sa-rule-005-prompt-injection",
  "rule_title": "Prompt Injection Signal - Sudden Admin Resource Access"
}
```

The test endpoint temporarily enables the rule (if disabled) for the duration of the test, then restores the original state. Aggregation-based rules cannot be fully tested with a single event since they require multiple events within the timeframe.

### 12.6 Manage Rule Lifecycle

Rules progress through a defined lifecycle: `experimental` (new, unvalidated), `test` (validated in staging), and `stable` (production-ready).

#### List All Rules

```
GET /watch/v1/rules?status=stable&level=critical&enabled=true
```

Returns a list of `RuleSummary` objects with `id`, `title`, `status`, `level`, `enabled`, `tags`, `response_playbook`, and `is_custom`.

#### Update a Rule

```
PUT /watch/v1/rules/{rule_id}
Content-Type: application/json

{
  "status": "stable",
  "level": "critical",
  "enabled": true,
  "description": "Updated description after validation period."
}
```

All fields in the update request are optional. Only provided fields are modified; others retain their current values. Custom rules are updated in both the in-memory engine and the database.

#### Disable a Rule

```
PUT /watch/v1/rules/{rule_id}
Content-Type: application/json

{"enabled": false}
```

Disabled rules remain loaded but are skipped during evaluation. This is the recommended approach for temporarily silencing noisy rules.

#### Delete a Custom Rule

```
DELETE /watch/v1/rules/{rule_id}
```

Only custom rules (those with `is_custom: true`) can be deleted. Built-in rules cannot be deleted -- disable them instead. Returns `204 No Content` on success, `403 Forbidden` if the rule is built-in.

### 12.7 Troubleshoot Rules That Don't Fire

**Common causes and diagnostic steps:**

1. **Rule is disabled.** Check `enabled: true` in the rule definition. Query `GET /watch/v1/rules/{rule_id}` and verify.

2. **Field name mismatch.** Sigma field names are case-sensitive. The event must contain the exact field name specified in the rule. Use dot notation for nested fields (`context.source_ip`, not `source_ip`).

3. **Modifier applied incorrectly.** The pipe modifier applies to the entire field specifier: `reason|contains: "suspended"` checks whether the `reason` field contains the substring `suspended`. Ensure the modifier is on the left side of the colon.

4. **Aggregation threshold too high.** Aggregation rules require multiple events within the timeframe. If events arrive infrequently, the count may never exceed the threshold. Reduce the threshold or increase the timeframe to validate.

5. **Events not reaching the engine.** In sidecar mode, verify the poller is running: `GET /health?detail=true` returns poller status including `events_processed` and `last_processed_ts`. In standalone mode, verify events are being submitted to `POST /watch/v1/events` and receiving `200` responses.

6. **Condition logic error.** A condition of `selection_a AND selection_b` requires both selection blocks to match the *same event*. If you intend for either to match, use `OR`.

**Diagnostic API:**

```
GET /watch/v1/rules                  -- Verify the rule is loaded and enabled
POST /watch/v1/rules/{rule_id}/test  -- Test with a sample event
GET /watch/v1/detections?rule_id=X   -- Check for recent matches
GET /health?detail=true              -- Verify pipeline is processing events
```

---

## Chapter 13: Automated Response Playbooks

Response playbooks define automated actions that execute when Sigma rules match. They enable zero-latency incident response by suspending keys, throttling agents, sending notifications, and creating incidents without human intervention. This chapter covers playbook architecture, built-in playbooks, custom playbook authoring, cooldowns, approval workflows, and simulation.

### 13.1 Playbook Architecture

The playbook engine evaluates matches produced by the Sigma engine and executes a chain of response actions for each triggering rule.

**Execution flow:**

```
Sigma Match
    |
    v
[Find playbooks linked to rule_id]
    |
    v
[Check severity >= severity_threshold]  -- skip if below threshold
    |
    v
[Check cooldown]  -- skip if cooldown active for this agent + playbook
    |
    v
[Check requires_approval]  -- queue for approval if true
    |
    v
[Execute action chain in order]
    |
    v
[Set cooldown timer]
    |
    v
[Log result to execution log]
```

**Playbook YAML schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique playbook identifier |
| `name` | string | Yes | Human-readable name |
| `description` | string | No | Detailed description |
| `trigger_rules` | list[string] | Yes | Rule IDs that trigger this playbook |
| `severity_threshold` | string | No | Minimum severity to execute (default: `medium`) |
| `actions` | list[Action] | Yes | Ordered list of actions to execute |
| `cooldown_minutes` | integer | No | Minimum minutes between executions for the same agent (default: `15`) |
| `requires_approval` | boolean | No | If true, queue for human approval instead of auto-executing (default: `false`) |
| `enabled` | boolean | No | Whether the playbook is active (default: `true`) |

**Action schema:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Action type: `log`, `quarantine`, `notify`, `escalate`, `rate_limit`, `webhook`, `reset_context` |
| `params` | object | Action-specific parameters |

### 13.2 Built-In Response Actions

SoulWatch ships with seven action handlers that can be composed in any order within a playbook.

#### quarantine

Suspends the offending SoulKey and terminates active sessions by calling SoulAuth's admin API.

```yaml
- type: quarantine
  params:
    reason: "Auto-quarantine triggered by critical detection rule"
    suspend_key: true
    kill_sessions: true
```

The quarantine handler calls:
- `POST /v1/soulauth/admin/keys/{soulkey_id}/suspend` -- suspends the key
- `POST /v1/soulauth/admin/keys/{soulkey_id}/revoke-tokens` -- kills active sessions

#### rate_limit

Applies a restrictive rate limit to the offending agent via SoulGate.

```yaml
- type: rate_limit
  params:
    max_requests: 5
    window_seconds: 60
    reason: "Rate-limited by detection rule"
```

Calls `POST /gate/admin/rate-limit` on SoulGate with a 30-minute TTL.

#### notify

Sends notifications to one or more channels.

```yaml
- type: notify
  params:
    channels:
      - pagerduty
      - slack
    message: "CRITICAL DETECTION: Agent quarantined. Review immediately."
    priority: critical
```

Supported channels: `pagerduty`, `slack`, `email`, `telegram`, `webhook`, `log`.

#### escalate

Creates an incident and assigns it to a response team.

```yaml
- type: escalate
  params:
    target: soc_team
    priority: critical
    create_incident: true
```

#### log

Writes a structured log entry at the specified level.

```yaml
- type: log
  params:
    level: critical
    message: "CRITICAL: Agent quarantined by automated detection"
```

#### webhook

Dispatches a webhook to an external system. SSRF-protected: only HTTPS URLs are allowed, and the engine validates that the target does not resolve to a private, loopback, link-local, or reserved IP address.

```yaml
- type: webhook
  params:
    url: "https://hooks.example.com/soulwatch"
    method: POST
    headers:
      Content-Type: application/json
    body_template: >
      {"source": "soulauth", "type": "investigation",
       "rule": "{{rule_id}}", "level": "{{level}}",
       "agent": "{{event.persona_id}}", "timestamp": "{{timestamp}}"}
```

#### reset_context

Clears cached context and session state for the offending agent.

```yaml
- type: reset_context
  params: {}
```

Calls `POST /v1/soulauth/admin/keys/{soulkey_id}/reset-context`.

### 13.3 Built-In Playbooks

SoulWatch ships with three playbooks that cover the most common response scenarios.

#### pb-auto-quarantine -- Auto Quarantine

The most aggressive built-in playbook. Immediately suspends the agent, kills active sessions, sends critical notifications via PagerDuty and Slack, and escalates to the SOC team.

```yaml
id: pb-auto-quarantine
name: Auto Quarantine
description: >
  Critical-level response playbook. Immediately suspends the offending SoulKey,
  terminates active sessions, and notifies SOC via PagerDuty and Slack.
  Used for credential stuffing, prompt injection, and key abuse detections.
trigger_rules:
  - sa-rule-001-credential-stuffing
  - sa-rule-005-prompt-injection
  - sa-rule-006-key-abuse
severity_threshold: high
actions:
  - type: quarantine
    params:
      reason: "Auto-quarantine triggered by critical detection rule"
      suspend_key: true
      kill_sessions: true
  - type: log
    params:
      level: critical
      message: "CRITICAL: Agent quarantined by automated detection"
  - type: notify
    params:
      channels:
        - pagerduty
        - slack
      message: "CRITICAL DETECTION: Agent quarantined. Review immediately."
      priority: critical
  - type: escalate
    params:
      target: soc_team
      priority: critical
      create_incident: true
cooldown_minutes: 30
requires_approval: false
enabled: true
```

**Trigger rules:** credential stuffing, prompt injection, key abuse.
**Actions:** quarantine, log, notify (PagerDuty + Slack), escalate.
**Cooldown:** 30 minutes per agent.

#### pb-rate-limit-alert -- Rate Limit and Alert

A moderate-severity playbook that throttles the agent rather than suspending it outright. Appropriate for detections where the behavior may be legitimate but warrants investigation.

```yaml
id: pb-rate-limit-alert
name: Rate Limit and Alert
description: >
  Medium-level response playbook. Throttles the offending agent to prevent
  further abuse while alerting the SOC team via Slack for investigation.
  Used for privilege escalation and data exfiltration detections.
trigger_rules:
  - sa-rule-002-privilege-escalation
  - sa-rule-004-data-exfiltration
severity_threshold: medium
actions:
  - type: rate_limit
    params:
      max_requests: 5
      window_seconds: 60
      reason: "Rate-limited by detection rule"
  - type: log
    params:
      level: warning
      message: "Agent rate-limited due to suspicious activity"
  - type: notify
    params:
      channels:
        - slack
      message: "DETECTION: Agent rate-limited for suspicious activity. Investigation recommended."
      priority: high
cooldown_minutes: 15
requires_approval: false
enabled: true
```

**Trigger rules:** privilege escalation, data exfiltration.
**Actions:** rate_limit (5 req/60s), log, notify (Slack).
**Cooldown:** 15 minutes per agent.

#### pb-investigate -- Investigate

A low-severity playbook for informational signals. Logs enhanced detail and creates an investigation ticket via webhook.

```yaml
id: pb-investigate
name: Investigate
description: >
  Low-level response playbook for informational detections. Logs enhanced detail
  and creates an investigation ticket via webhook for SOC triage.
  Used for off-hours activity and other low-confidence signals.
trigger_rules:
  - sa-rule-003-off-hours-activity
severity_threshold: low
actions:
  - type: log
    params:
      level: info
      message: "Detection logged for investigation"
      enhanced_detail: true
  - type: webhook
    params:
      url: "${INVESTIGATION_WEBHOOK_URL}"
      method: POST
      headers:
        Content-Type: application/json
      body_template: >
        {"source": "soulauth", "type": "investigation",
         "rule": "{{rule_id}}", "level": "{{level}}",
         "agent": "{{event.persona_id}}", "timestamp": "{{timestamp}}"}
  - type: notify
    params:
      channels:
        - slack
      message: "LOW: Detection logged -- investigation ticket created."
      priority: low
cooldown_minutes: 60
requires_approval: false
enabled: true
```

**Trigger rules:** off-hours activity.
**Actions:** log, webhook (investigation ticket), notify (Slack).
**Cooldown:** 60 minutes per agent.

### 13.4 Write Custom Response Playbooks

Custom playbooks are submitted via the API in YAML format.

**Example: Approval-gated quarantine for high-value agents**

```yaml
id: pb-approval-quarantine
name: Approval-Gated Quarantine
description: >
  For high-value production agents, require SOC manager approval before
  executing quarantine. Immediate notification is sent, but the agent
  continues operating until a human approves the quarantine.
trigger_rules:
  - sa-rule-002-privilege-escalation
  - sa-rule-004-data-exfiltration
severity_threshold: high
actions:
  - type: quarantine
    params:
      reason: "Pending approval: suspicious activity detected"
      suspend_key: true
      kill_sessions: true
  - type: notify
    params:
      channels:
        - pagerduty
        - slack
      message: "APPROVAL REQUIRED: Quarantine pending for production agent."
      priority: critical
  - type: escalate
    params:
      target: soc_manager
      priority: critical
cooldown_minutes: 15
requires_approval: true
enabled: true
```

**Submit the playbook:**

```bash
curl -X POST https://tiresias.example.com/watch/v1/playbooks \
  -H "Content-Type: text/yaml" \
  --data-binary @pb-approval-quarantine.yml
```

**Response (201 Created):**

```json
{
  "id": "pb-approval-quarantine",
  "name": "Approval-Gated Quarantine",
  "description": "For high-value production agents...",
  "severity_threshold": "high",
  "cooldown_minutes": 15,
  "requires_approval": true,
  "enabled": true,
  "trigger_rules": ["sa-rule-002-privilege-escalation", "sa-rule-004-data-exfiltration"]
}
```

When `requires_approval: true`, the playbook engine does not execute the action chain. Instead, it creates a queued execution record with status `"Queued for human approval"`. An administrator must approve the quarantine via the enforcement API before actions execute.

### 13.5 Configure Response Cooldown Periods

Cooldowns prevent response storms -- situations where a single misbehaving agent triggers the same playbook repeatedly within a short period, flooding notification channels and creating duplicate quarantine records.

**How cooldowns work:**

1. When a playbook executes successfully, the engine records a cooldown timestamp keyed by `(playbook_id, agent_key)`.
2. The `agent_key` is derived from `soulkey_id` or `persona_id` in the triggering event.
3. On subsequent triggers, the engine checks whether `now - last_execution < cooldown_minutes`. If the cooldown is still active, the playbook is skipped with a `skipped_reason` of `"Cooldown active (Ns remaining)"`.
4. Cooldowns are per-agent: the same playbook can fire for different agents simultaneously.

**Recommended cooldown values:**

| Playbook Type | Recommended Cooldown | Rationale |
|--------------|---------------------|-----------|
| Auto-quarantine | 30 minutes | The agent is already suspended; additional triggers are redundant |
| Rate-limit | 15 minutes | Allow time for rate limit to take effect |
| Investigation | 60 minutes | Avoid flooding investigation queues |
| Notification-only | 5 minutes | Balance between visibility and noise |

### 13.6 Approval Workflows

Playbooks with `requires_approval: true` are queued for human review rather than executing immediately.

**Approval flow:**

1. Sigma rule matches and triggers the playbook.
2. Playbook engine evaluates severity and cooldown (same as auto-execution).
3. Instead of executing actions, a `PlaybookResult` is logged with `requires_approval: true` and `skipped_reason: "Queued for human approval"`.
4. A notification is sent to configured channels.
5. An administrator reviews the pending quarantine in the Portal or via API.
6. The administrator approves or dismisses the quarantine.

**Approve a pending quarantine:**

```
POST /watch/v1/quarantines/{quarantine_id}/approve
Content-Type: application/json

{
  "approved_by": "admin@example.com"
}
```

On approval, the quarantine transitions from `pending_approval` to `active`, and all queued enforcement actions execute (key suspension, session termination, etc.).

**Dismiss (release) a pending quarantine:**

```
POST /watch/v1/quarantines/{quarantine_id}/release
Content-Type: application/json

{
  "released_by": "admin@example.com"
}
```

### 13.7 Review Playbook Execution History

Every playbook execution (successful, skipped, or approval-queued) is recorded in the execution log.

**Query the execution log:**

```
GET /watch/v1/playbooks/executions?limit=100
```

**Response:**

```json
{
  "executions": [
    {
      "playbook_id": "pb-auto-quarantine",
      "playbook_name": "Auto Quarantine",
      "match_rule_id": "sa-rule-001-credential-stuffing",
      "match_level": "critical",
      "executed": true,
      "skipped_reason": null,
      "action_results": [
        {
          "action_type": "quarantine",
          "success": true,
          "message": "Quarantine requested for soulkey 550e8400-...",
          "details": {
            "soulkey_id": "550e8400-e29b-41d4-a716-446655440000",
            "reason": "Auto-quarantine triggered by critical detection rule"
          },
          "timestamp": "2026-04-02T14:30:01Z"
        },
        {
          "action_type": "notify",
          "success": true,
          "message": "Notification sent to pagerduty, slack",
          "details": {
            "channels": ["pagerduty", "slack"],
            "message": "CRITICAL DETECTION: Agent quarantined. Review immediately."
          },
          "timestamp": "2026-04-02T14:30:01Z"
        }
      ],
      "requires_approval": false,
      "timestamp": "2026-04-02T14:30:01Z"
    }
  ],
  "count": 1
}
```

Each entry includes:
- Which playbook ran and which rule triggered it
- Whether the playbook executed or was skipped (and why)
- Individual results for each action in the chain (success/failure, message, details)
- Whether approval was required
- Precise timestamps for all actions

---

## Chapter 14: Incident Investigation

When SoulWatch detects anomalies or Sigma rule matches, the investigation toolkit provides the data retrieval, correlation, evidence packaging, and lifecycle management capabilities needed to conduct a thorough security investigation. This chapter covers the incident dashboard, event triage workflow, cross-agent correlation, evidence export, and incident closure.

### 14.1 Navigate the Incident Dashboard

The SoulWatch dashboard provides a real-time operational view of the security posture across all monitored agents.

**Dashboard endpoint:**

```
GET /watch/v1/dashboard
```

**Response:**

```json
{
  "open_anomalies": 3,
  "anomalies_24h": 12,
  "active_quarantines": 1,
  "detections_24h": 7,
  "severity_distribution": {
    "critical": 2,
    "high": 5,
    "medium": 3,
    "low": 2
  },
  "tracked_baselines": 138,
  "timestamp": "2026-04-02T15:00:00Z"
}
```

**Key metrics:**

| Metric | Description |
|--------|-------------|
| `open_anomalies` | Anomalies in `open` status requiring triage |
| `anomalies_24h` | Total anomalies detected in the last 24 hours (all statuses) |
| `active_quarantines` | Agents currently quarantined (status `active`) |
| `detections_24h` | Sigma rule matches in the last 24 hours |
| `severity_distribution` | Anomalies by severity in the last 24 hours |
| `tracked_baselines` | Number of agents with established behavioral baselines |

**Anomaly timeline (for charting):**

```
GET /watch/v1/dashboard/timeline?period=24h
```

Returns anomalies bucketed by hour (for 24h) or by day (for 7d/30d), grouped by severity. This data feeds the Portal's detection trend charts.

**Agent risk scores:**

```
GET /watch/v1/dashboard/agents?lookback_days=30&limit=50
```

Returns agents sorted by computed risk score (descending). Risk is calculated from anomaly count, severity distribution, quarantine history, and detection frequency over the lookback period.

### 14.2 Investigate a Security Event

When an anomaly or detection appears on the dashboard, follow this triage workflow.

#### Step 1: Retrieve the Anomaly Detail

```
GET /watch/v1/anomalies/{anomaly_id}
```

**Response:**

```json
{
  "id": "a1b2c3d4-...",
  "soulkey_id": "550e8400-e29b-41d4-a716-446655440000",
  "tenant_id": "t1e2n3a4-...",
  "anomaly_type": "scope_escalation",
  "severity": "high",
  "description": "Requesting scope 'admin:write' not in baseline",
  "evidence": {
    "scope": "admin:write",
    "resource": "admin/config"
  },
  "baseline_value": "['models:read', 'data:read', 'data:write']",
  "observed_value": "admin:write",
  "status": "open",
  "acknowledged_by": null,
  "resolved_at": null,
  "source_event_id": "e5f6a7b8-...",
  "created_at": "2026-04-02T14:30:00Z"
}
```

The `evidence` field contains the specific data that triggered the anomaly. The `baseline_value` and `observed_value` show the deviation from normal behavior. The `source_event_id` links back to the original audit event.

#### Step 2: Acknowledge the Anomaly

Set the status to `acknowledged` to indicate that a human analyst is triaging the event.

```
PATCH /watch/v1/anomalies/{anomaly_id}
Content-Type: application/json

{
  "status": "acknowledged",
  "acknowledged_by": "analyst@example.com"
}
```

Valid status values: `open`, `acknowledged`, `resolved`, `false_positive`.

#### Step 3: Review Agent History

Query the agent's recent anomalies and detections to establish whether this is an isolated event or part of a pattern.

```bash
# Recent anomalies for this agent
GET /watch/v1/anomalies?soulkey_id=550e8400-...&since=2026-04-01T00:00:00Z

# Recent Sigma rule matches for this agent
GET /watch/v1/detections?soulkey_id=550e8400-...&since_hours=72

# Agent's behavioral baseline
GET /watch/v1/baselines/550e8400-...

# Active quarantines for this agent
GET /watch/v1/quarantines?soulkey_id=550e8400-...&status=active
```

#### Step 4: Review the Agent's Baseline

The baseline shows the agent's normal behavior profile, providing context for evaluating whether the detected activity is truly anomalous.

```json
{
  "id": "b1a2s3e4-...",
  "soulkey_id": "550e8400-e29b-41d4-a716-446655440000",
  "typical_request_rate": 120.5,
  "typical_resources": ["models/gpt-4", "data/reports", "data/metrics"],
  "typical_actions": ["read", "write"],
  "typical_scopes": ["models:read", "data:read", "data:write"],
  "typical_hours": [8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
  "typical_denial_rate": 0.02,
  "typical_burst_size": 15,
  "events_analyzed": 4521,
  "updated_at": "2026-04-02T06:00:00Z"
}
```

If the baseline is stale or does not reflect a legitimate change in agent behavior (e.g., after a deployment), rebuild it:

```
POST /watch/v1/baselines/550e8400-.../rebuild
```

#### Step 5: Check Quarantine Status

If the anomaly triggered a quarantine (via playbook or direct threshold), review and manage it.

```bash
# List quarantines for the agent
GET /watch/v1/quarantines?soulkey_id=550e8400-...

# Release if false positive
POST /watch/v1/quarantines/{quarantine_id}/release
{
  "released_by": "analyst@example.com"
}
```

### 14.3 Correlate Events Across Agents

Cross-agent correlation identifies coordinated attacks where multiple agents are involved.

**Query anomalies by type across all agents:**

```
GET /watch/v1/anomalies?type=credential_stuffing&since=2026-04-02T00:00:00Z
```

**Query detection matches by rule across all agents:**

```
GET /watch/v1/detections?rule_id=sa-rule-001-credential-stuffing&since_hours=24
```

**Aggregated statistics for pattern identification:**

```
GET /watch/v1/anomalies/stats?since_hours=24
```

**Response:**

```json
{
  "total": 47,
  "by_type": {
    "credential_stuffing": 12,
    "scope_escalation": 8,
    "rate_spike": 15,
    "off_hours": 7,
    "lateral_movement": 5
  },
  "by_severity": {
    "critical": 17,
    "high": 18,
    "medium": 7,
    "low": 5
  },
  "by_status": {
    "open": 30,
    "acknowledged": 10,
    "resolved": 5,
    "false_positive": 2
  },
  "open_count": 30
}
```

**Correlation indicators to look for:**

- Multiple agents experiencing `credential_stuffing` from the same source IP within a narrow time window suggests a brute-force campaign.
- A sequence of `scope_escalation` followed by `lateral_movement` on different agents indicates an attacker pivoting after initial compromise.
- Simultaneous `off_hours` anomalies across agents that normally operate independently may indicate a coordinated after-hours operation.

### 14.4 Export Investigation Data

Investigation data can be exported for handoff to IR teams, legal, or law enforcement.

**Export anomalies as JSON:**

```bash
# Fetch all anomalies for a specific agent in a time range
curl -s "https://tiresias.example.com/watch/v1/anomalies?\
soulkey_id=550e8400-...&\
since=2026-04-01T00:00:00Z&\
until=2026-04-02T23:59:59Z&\
page_size=500" | jq . > investigation-anomalies.json
```

**Export detections (Sigma matches) as JSON:**

```bash
curl -s "https://tiresias.example.com/watch/v1/detections?\
soulkey_id=550e8400-...&\
since_hours=72&\
page_size=500" | jq . > investigation-detections.json
```

**Export quarantine history:**

```bash
curl -s "https://tiresias.example.com/watch/v1/quarantines?\
soulkey_id=550e8400-..." | jq . > investigation-quarantines.json
```

**Export playbook execution log:**

```bash
curl -s "https://tiresias.example.com/watch/v1/playbooks/executions?\
limit=500" | jq . > investigation-playbook-executions.json
```

**Export agent baseline (for establishing normal behavior context):**

```bash
curl -s "https://tiresias.example.com/watch/v1/baselines/550e8400-..." \
  | jq . > investigation-baseline.json
```

**Complete evidence package script:**

```bash
#!/bin/bash
# Collect investigation evidence for a specific agent
AGENT_ID="550e8400-e29b-41d4-a716-446655440000"
BASE_URL="https://tiresias.example.com"
OUTDIR="investigation-${AGENT_ID:0:8}-$(date +%Y%m%d)"

mkdir -p "$OUTDIR"

curl -s "$BASE_URL/watch/v1/anomalies?soulkey_id=$AGENT_ID&page_size=500" \
  | jq . > "$OUTDIR/anomalies.json"

curl -s "$BASE_URL/watch/v1/detections?soulkey_id=$AGENT_ID&since_hours=720&page_size=500" \
  | jq . > "$OUTDIR/detections.json"

curl -s "$BASE_URL/watch/v1/quarantines?soulkey_id=$AGENT_ID" \
  | jq . > "$OUTDIR/quarantines.json"

curl -s "$BASE_URL/watch/v1/baselines/$AGENT_ID" \
  | jq . > "$OUTDIR/baseline.json"

curl -s "$BASE_URL/watch/v1/playbooks/executions?limit=500" \
  | jq . > "$OUTDIR/playbook-executions.json"

# Generate SHA-256 manifest for integrity verification
sha256sum "$OUTDIR"/*.json > "$OUTDIR/manifest.sha256"

echo "Evidence package: $OUTDIR/"
echo "Files: $(ls "$OUTDIR" | wc -l)"
echo "Integrity manifest: $OUTDIR/manifest.sha256"
```

The SHA-256 manifest provides tamper-evident integrity verification for the exported evidence. Each file's hash can be independently verified at any time.

### 14.5 Close and Document Incidents

After completing the investigation, close the anomalies and document the resolution.

#### Resolve Anomalies

```
PATCH /watch/v1/anomalies/{anomaly_id}
Content-Type: application/json

{
  "status": "resolved",
  "acknowledged_by": "analyst@example.com"
}
```

On resolution, the `resolved_at` timestamp is automatically set. For false positives:

```json
{
  "status": "false_positive",
  "acknowledged_by": "analyst@example.com"
}
```

#### Release Quarantines

If the agent was quarantined and the investigation confirms the threat is mitigated, release the quarantine:

```
POST /watch/v1/quarantines/{quarantine_id}/release
Content-Type: application/json

{
  "released_by": "analyst@example.com"
}
```

The quarantine engine reverses applicable enforcement actions:
- `suspend_key` -- calls `POST /v1/soulauth/admin/keys/{soulkey_id}/reinstate` to restore the key
- `rate_limit` -- calls `DELETE /gate/admin/rate-limit/{soulkey_id}` to remove the rate limit override
- `isolate` -- reinstates the key and clears isolation metadata
- `kill_session`, `force_reauth`, `reset_context` -- one-time actions with no reversal needed

#### Auto-Release Expiration

Quarantines with an `auto_release_at` timestamp are automatically released when the expiration time passes. The `QuarantineEngine.auto_release_check` method runs periodically and transitions expired records from `active` to `expired`, reversing enforcement actions.

**Default auto-release timers by policy:**

| Trigger | Auto-Release | Description |
|---------|-------------|-------------|
| Credential stuffing | 60 minutes | Source is likely a script; temporary block is sufficient |
| Scope escalation | 30 minutes | May be a misconfigured integration |
| Rate spike (critical) | None (manual release) | Requires human investigation |
| Any critical anomaly | None (manual release) | Requires human investigation |

#### Tune Rules Based on Investigation Findings

If an investigation reveals a false positive pattern, update the triggering rule:

**Option 1: Adjust the rule's severity or threshold**

```
PUT /watch/v1/rules/{rule_id}
Content-Type: application/json

{
  "level": "medium"
}
```

**Option 2: Disable the rule temporarily**

```
PUT /watch/v1/rules/{rule_id}
Content-Type: application/json

{
  "enabled": false
}
```

**Option 3: Rebuild the agent's baseline** (if the baseline was outdated)

```
POST /watch/v1/baselines/{soulkey_id}/rebuild
```

**Option 4: Write a more specific exclusion rule**

Create a custom rule with a `NOT` condition that excludes the false positive pattern, or modify the existing rule's detection block to add a filter.

### 14.6 API Reference Summary

The following table summarizes all detection and investigation API endpoints covered in this chapter.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/watch/v1/rules` | List all Sigma rules (filterable by status, level, enabled) |
| `POST` | `/watch/v1/rules` | Add a custom Sigma rule (YAML body) |
| `GET` | `/watch/v1/rules/{rule_id}` | Get rule detail |
| `PUT` | `/watch/v1/rules/{rule_id}` | Update rule fields |
| `DELETE` | `/watch/v1/rules/{rule_id}` | Delete a custom rule (built-in rules cannot be deleted) |
| `POST` | `/watch/v1/rules/{rule_id}/test` | Test a rule against a sample event |
| `GET` | `/watch/v1/detections` | List Sigma rule matches (filterable by rule_id, level, soulkey_id, time) |
| `GET` | `/watch/v1/playbooks` | List all playbooks |
| `POST` | `/watch/v1/playbooks` | Add a custom playbook (YAML body) |
| `GET` | `/watch/v1/playbooks/{playbook_id}` | Get playbook detail |
| `PUT` | `/watch/v1/playbooks/{playbook_id}` | Replace a playbook (YAML body) |
| `GET` | `/watch/v1/playbooks/executions` | List playbook execution history |
| `GET` | `/watch/v1/anomalies` | List anomalies (filterable by type, severity, status, agent, time) |
| `GET` | `/watch/v1/anomalies/stats` | Aggregated anomaly statistics |
| `GET` | `/watch/v1/anomalies/{anomaly_id}` | Get anomaly detail |
| `PATCH` | `/watch/v1/anomalies/{anomaly_id}` | Update anomaly status |
| `GET` | `/watch/v1/baselines` | List all agent baselines |
| `GET` | `/watch/v1/baselines/{soulkey_id}` | Get agent baseline |
| `POST` | `/watch/v1/baselines/rebuild` | Rebuild all baselines |
| `POST` | `/watch/v1/baselines/{soulkey_id}/rebuild` | Rebuild a specific agent's baseline |
| `GET` | `/watch/v1/quarantines` | List quarantine records (filterable by status, soulkey_id) |
| `POST` | `/watch/v1/quarantines` | Manually quarantine an agent |
| `POST` | `/watch/v1/quarantines/{id}/release` | Release an agent from quarantine |
| `POST` | `/watch/v1/quarantines/{id}/approve` | Approve a pending quarantine |
| `GET` | `/watch/v1/dashboard` | Real-time dashboard stats |
| `GET` | `/watch/v1/dashboard/timeline` | Anomaly timeline for charting |
| `GET` | `/watch/v1/dashboard/agents` | Agent risk scores |
| `POST` | `/watch/v1/events` | Ingest an event (standalone mode, requires X-Internal-Key) |

---

*End of Part IV: Threat Detection & Response*

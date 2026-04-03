# Part III: Agent Security

> **Tiresias Administration Guide v3.0**
> **Classification:** Customer-Facing
> **Audience:** Security administrators, SOC managers, MSSPs, platform operators

---

## Chapter 8: Agent Lifecycle Management

This chapter covers the full lifecycle of an AI agent identity within Tiresias -- from initial registration through active operation to secure decommission. Every agent in the platform is represented by a SoulKey, a durable cryptographic credential that carries identity semantics and is scoped to a single tenant.

### 8.1 Agent Registration Workflows

Tiresias supports three registration workflows for onboarding new agents. The appropriate workflow depends on your operational model and the level of human oversight required.

#### Manual Registration via Portal

Use the Portal dashboard for individual agent registration with full visibility into key issuance.

**Procedure**

| Step | Action |
|------|--------|
| 1 | Navigate to **Agents > Register New Agent** in the Portal. |
| 2 | Enter the **Persona ID** (a unique slug identifying the agent's function, e.g., `research-assistant`, `code-reviewer`). |
| 3 | Optionally set a **Label** (human-readable description), **Expiration Date**, and custom **Metadata** key-value pairs. |
| 4 | Click **Issue SoulKey**. |
| 5 | Copy the raw SoulKey from the confirmation dialog. |

> **CAUTION:** The raw SoulKey is displayed exactly once at issuance. It is never stored in the database -- only its SHA-512 hash is persisted. If you lose the raw key, you must revoke it and issue a new one. There is no recovery mechanism by design.

The issued SoulKey follows the format:

```
sk_agent_<tenant_short>_<persona_slug>_<hex64>
```

Example:

```
sk_agent_acme_research-assistant_a3f8c91d2b...
```

#### API-Driven Registration

For programmatic agent provisioning, use the SoulAuth admin API. This is the preferred method for CI/CD pipelines, fleet provisioning, and infrastructure-as-code workflows.

**Issue a SoulKey via API**

```bash
curl -X POST https://api.tiresias.network/v1/soulauth/admin/keys/issue \
  -H "Authorization: Bearer $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "persona_id": "research-assistant",
    "label": "Production research assistant - team alpha",
    "expires_at": "2026-07-01T00:00:00Z",
    "metadata": {
      "department": "engineering",
      "environment": "production",
      "owner": "platform-team",
      "admin_role": "viewer"
    }
  }'
```

**Response (200 OK)**

```json
{
  "raw_key": "sk_agent_acme_research-assistant_a3f8c91d2b...",
  "soulkey_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "persona_id": "research-assistant",
  "status": "active",
  "issued_at": "2026-04-02T14:00:00Z",
  "expires_at": "2026-07-01T00:00:00Z"
}
```

> **NOTE:** The `raw_key` field is included in the issuance response only. Subsequent API calls return the `soulkey_id` (UUID) but never the raw key.

**Required Permission:** `keys:create`

#### Auto-Registration with Approval Gates

For environments where agents self-register, configure approval gates to require human review before activation.

**Procedure**

| Step | Action |
|------|--------|
| 1 | Enable auto-registration in tenant settings: **Settings > Agent Policies > Auto-Registration**. |
| 2 | Set the approval workflow to **Require Admin Approval** or **Require Owner Approval**. |
| 3 | When an unregistered agent makes its first request, Tiresias creates a SoulKey record in `pending` status and sends a notification to the configured approval channel. |
| 4 | An administrator reviews the request in the Portal under **Agents > Pending Approvals** and approves or rejects it. |
| 5 | On approval, the SoulKey transitions to `active` and the agent receives its credential via the configured delivery mechanism. |

> **NOTE:** Auto-registration is disabled by default. When enabled, all auto-registered keys inherit the tenant's default scope and metadata template. Review the default scope carefully before enabling this feature.

### 8.2 Configure Agent Metadata

Every SoulKey record carries a `metadata_` JSON column that supports arbitrary key-value attributes. Metadata enables fleet-level organization, filtering, and policy targeting.

#### Standard Metadata Fields

The following metadata keys have platform-level significance:

| Key | Type | Purpose |
|-----|------|---------|
| `admin_role` | string | RBAC role for Portal access: `owner`, `admin`, `operator`, `viewer` |
| `department` | string | Organizational unit (used for group filtering and reporting) |
| `environment` | string | Deployment environment: `production`, `staging`, `development` |
| `owner` | string | Team or individual responsible for this agent |
| `tags` | array | Arbitrary string tags for filtering and search |
| `isolated` | boolean | Set by quarantine engine when agent is network-isolated |
| `isolated_at` | string | ISO 8601 timestamp of when isolation was applied |

#### Set Metadata via API

```bash
curl -X POST https://api.tiresias.network/v1/soulauth/admin/keys/{soulkey_id}/metadata \
  -H "Authorization: Bearer $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "department": "security-ops",
    "environment": "production",
    "tags": ["tier-1", "pci-scope", "auto-scaled"],
    "cost_center": "CC-4200"
  }'
```

> **NOTE:** Metadata updates are additive by default. To remove a key, set its value to `null`. The `admin_role` key can only be modified by users with `owner` or `admin` roles.

**Required Permission:** `keys:update`

#### Set Labels

The `label` field is a human-readable identifier separate from metadata, designed for quick identification in dashboards and logs.

```bash
curl -X PATCH https://api.tiresias.network/v1/soulauth/admin/keys/{soulkey_id} \
  -H "Authorization: Bearer $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Production orchestrator - updated 2026-04-02"
  }'
```

### 8.3 Manage Agent Status

SoulKeys follow a deterministic state machine with four states and defined transitions. Understanding these states is critical for incident response and fleet management.

#### State Machine

```
                 +--------+
  Issue          |        |
  ──────────────>| active |<──────────────────+
                 |        |                   |
                 +---+----+                   |
                     |                    reinstate
                     | suspend                |
                     v                        |
                 +---+-------+                |
                 |           |                |
                 | suspended +────────────────+
                 |           |
                 +---+-------+
                     |
                     | revoke
                     v
                 +---+------+
                 |          |
                 | revoked  |  (terminal)
                 |          |
                 +----------+
```

#### State Definitions

| State | Description | Reversible | API Requests |
|-------|-------------|------------|--------------|
| `active` | Agent is fully operational. All API requests are evaluated by the PDP. | -- | Processed normally |
| `suspended` | Agent is temporarily disabled. All API requests are denied with reason `soulkey status: suspended`. | Yes | Denied (403) |
| `revoked` | Agent is permanently decommissioned. This is a terminal state. | No | Denied (403) |

#### Suspend an Agent

Suspension is a reversible action used for temporary access restriction during investigations, maintenance windows, or automated quarantine responses.

```bash
curl -X POST https://api.tiresias.network/v1/soulauth/admin/keys/{soulkey_id}/suspend \
  -H "Authorization: Bearer $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Investigating anomalous scope escalation pattern",
    "suspended_by": "analyst@example.com"
  }'
```

The system records `suspended_at` (UTC timestamp) and `suspended_by` (identity string) on the SoulKey record for audit purposes.

**Required Permission:** `keys:update`

#### Reinstate a Suspended Agent

```bash
curl -X POST https://api.tiresias.network/v1/soulauth/admin/keys/{soulkey_id}/reinstate \
  -H "Authorization: Bearer $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "reinstated_by": "analyst@example.com"
  }'
```

Reinstatement clears the `suspended_at` and `suspended_by` fields and returns the key to `active` status. An audit event of type `key.reinstated` is written to the hash chain.

> **CAUTION:** Only keys in `suspended` status can be reinstated. Attempting to reinstate a `revoked` key returns a 404 error. Revocation is permanent by design.

**Required Permission:** `keys:update`

#### Revoke an Agent

Revocation is a permanent, terminal action. Use it when an agent is decommissioned, a key is compromised, or a key has expired (the system auto-revokes expired keys).

```bash
curl -X POST https://api.tiresias.network/v1/soulauth/admin/keys/{soulkey_id}/revoke \
  -H "Authorization: Bearer $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Agent decommissioned - project sunset",
    "revoked_by": "platform-admin@example.com"
  }'
```

The system records `revoked_at`, `revoked_by`, and `revocation_reason` on the SoulKey record. These fields are immutable once set.

> **NOTE:** When a SoulKey expires (the `expires_at` timestamp passes), the system automatically revokes it with `revoked_by: "system:expiry"` and `revocation_reason: "Key expired"`. Auto-revoked keys cannot be reinstated -- issue a new key instead.

**Required Permission:** `keys:delete`

### 8.4 Decommission an Agent

Secure decommissioning is a multi-step procedure that ensures no residual access, preserves audit history, and cleans up associated resources.

**Procedure**

| Step | Action | Command |
|------|--------|---------|
| 1 | **Suspend the agent** to immediately cut access while preserving the ability to investigate. | `POST /v1/soulauth/admin/keys/{id}/suspend` |
| 2 | **Revoke all active capability tokens** to invalidate any in-flight sessions. | `POST /v1/soulauth/admin/keys/{id}/revoke-tokens` |
| 3 | **Revoke all active delegations** where this agent is either grantor or grantee. | `DELETE /v1/soulauth/admin/delegations?soulkey_id={id}` |
| 4 | **Permanently revoke the SoulKey** to move it to terminal state. | `POST /v1/soulauth/admin/keys/{id}/revoke` |
| 5 | **Verify decommission** by confirming the key status is `revoked` and no active delegations remain. | `GET /v1/soulauth/admin/keys/{id}` |
| 6 | **Archive audit records** for the decommissioned agent if required by your retention policy. | Export via Portal or SIEM |

> **CAUTION:** Do not delete SoulKey records from the database. The `_soulkeys` table participates in foreign key relationships with `_soulauth_audit`, `_soulwatch_anomalies`, and `_soulwatch_quarantines`. Revocation preserves referential integrity while preventing all future access.

> **NOTE:** Audit records, anomaly records, and quarantine history for decommissioned agents are retained according to the tenant's configured retention policy. These records remain queryable for compliance and forensic purposes.

### 8.5 Bulk Agent Operations

#### Bulk Import via CSV

To register multiple agents at once, prepare a CSV file and use the bulk import API.

**CSV Format**

```csv
persona_id,label,expires_at,department,environment,tags
data-analyst-01,Data analyst pod 1,2026-12-31T00:00:00Z,analytics,production,"tier-2,batch"
data-analyst-02,Data analyst pod 2,2026-12-31T00:00:00Z,analytics,production,"tier-2,batch"
code-reviewer,Code review agent,,engineering,production,"tier-1,ci-cd"
```

```bash
curl -X POST https://api.tiresias.network/v1/soulauth/admin/keys/bulk-import \
  -H "Authorization: Bearer $ADMIN_SOULKEY" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@agents.csv"
```

The response includes the raw keys for all successfully created agents. Save this response securely -- the raw keys will not be available again.

**Required Permission:** `keys:create`

#### Bulk Export

Export all agent records (excluding raw keys and key hashes) for inventory management or migration.

```bash
curl -X GET "https://api.tiresias.network/v1/soulauth/admin/keys?format=csv" \
  -H "Authorization: Bearer $ADMIN_SOULKEY" \
  -o agents_export.csv
```

#### Batch Status Updates

Update the status of multiple agents simultaneously. This is useful for maintenance windows or coordinated incident response.

```bash
curl -X POST https://api.tiresias.network/v1/soulauth/admin/keys/bulk-update \
  -H "Authorization: Bearer $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "soulkey_ids": [
      "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "b2c3d4e5-f6a7-8901-bcde-f12345678901"
    ],
    "action": "suspend",
    "reason": "Scheduled maintenance window 2026-04-05 02:00-06:00 UTC"
  }'
```

**Required Permission:** `keys:update`

### 8.6 View the Agent Inventory Dashboard

The Agent Inventory dashboard in the Portal provides a consolidated view of all registered agents across the tenant.

#### Navigate to the Dashboard

| Step | Action |
|------|--------|
| 1 | Log in to the Portal at `https://portal.tiresias.network`. |
| 2 | Navigate to **Agents > Inventory**. |
| 3 | The dashboard displays all agents for the current tenant, sorted by `issued_at` (most recent first). |

#### Filter and Search

The inventory supports the following filters:

| Filter | Description | Example |
|--------|-------------|---------|
| **Status** | Filter by lifecycle state | `active`, `suspended`, `revoked` |
| **Persona ID** | Search by agent persona identifier | `research-assistant` |
| **Department** | Filter by metadata department tag | `engineering` |
| **Environment** | Filter by deployment environment | `production` |
| **Label** | Free-text search across labels | `orchestrator` |
| **Last Used** | Filter by last activity timestamp | `> 7 days ago`, `never` |
| **Expiring Soon** | Show agents expiring within N days | `30 days` |

#### List Agents via API

```bash
# List all active agents
curl -X GET "https://api.tiresias.network/v1/soulauth/admin/keys?status=active" \
  -H "Authorization: Bearer $ADMIN_SOULKEY"

# List agents for a specific persona
curl -X GET "https://api.tiresias.network/v1/soulauth/admin/keys?persona_id=research-assistant" \
  -H "Authorization: Bearer $ADMIN_SOULKEY"
```

**Response**

```json
{
  "keys": [
    {
      "soulkey_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "tenant_id": "11111111-1111-1111-1111-111111111111",
      "persona_id": "research-assistant",
      "label": "Production research assistant - team alpha",
      "status": "active",
      "issued_at": "2026-04-02T14:00:00Z",
      "expires_at": "2026-07-01T00:00:00Z",
      "last_used_at": "2026-04-02T18:32:00Z",
      "metadata": {
        "department": "engineering",
        "environment": "production",
        "admin_role": "viewer"
      }
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 50
}
```

**Required Permission:** `keys:read`

#### Fleet Health Indicators

The dashboard displays the following fleet-level metrics:

| Metric | Description |
|--------|-------------|
| **Total Agents** | Count of all registered SoulKeys (all statuses) |
| **Active Agents** | Count of keys in `active` status |
| **Suspended Agents** | Count of keys in `suspended` status (manual or quarantine) |
| **Quarantined Agents** | Count of agents with active quarantine records |
| **Expiring Soon** | Count of agents with `expires_at` within 30 days |
| **Stale Agents** | Count of active agents with no activity in the last 30 days |
| **Anomaly Rate** | Average anomalies per agent per day across the fleet |

---

## Chapter 9: Agent Behavioral Baselines

SoulWatch's behavioral baseline engine learns the normal operating patterns of each agent and uses this profile to detect deviations that may indicate compromise, misconfiguration, or abuse. This chapter explains how baselines are computed, stored, and tuned.

### 9.1 How Behavioral Baselines Work

The baseline engine operates on a per-agent model. For each SoulKey, SoulWatch analyzes historical audit events from the `_soulauth_audit` table to build a behavioral profile that captures what "normal" looks like for that specific agent.

#### Baseline Architecture

```
 _soulauth_audit                  BaselineEngine                _soulwatch_baselines
 (hash-chained                   (in-memory cache              (persistent storage)
  event log)                      + periodic rebuild)
       |                                |                              |
       |  1. Query events for           |                              |
       |     soulkey_id within          |                              |
       |     lookback window            |                              |
       +------------------------------->|                              |
       |                                |                              |
       |  2. Compute profile:           |                              |
       |     - request rate             |                              |
       |     - resources accessed       |                              |
       |     - actions performed        |                              |
       |     - active hours             |                              |
       |     - denial rate              |                              |
       |     - burst size               |                              |
       |                                |                              |
       |  3. Cache in memory            |                              |
       |                                +----------------------------->|
       |                                |  4. Persist to database      |
       |                                |                              |
```

When an event arrives, the anomaly detector compares it against the cached baseline to produce real-time deviation scores. This comparison happens synchronously in the event processing pipeline, ensuring sub-millisecond detection latency.

#### Feature Extraction

The baseline engine extracts the following features from the audit trail:

| Feature | Source Field | Computation |
|---------|-------------|-------------|
| `typical_request_rate` | All events for soulkey_id | `total_events / lookback_hours` (requests per hour) |
| `typical_resources` | `resource` column | Distinct set of resources accessed |
| `typical_actions` | `action` column | Distinct set of actions performed |
| `typical_scopes` | `scope` column | Distinct set of scopes requested |
| `typical_hours` | `timestamp` column | Set of hours (0-23 UTC) during which the agent was active |
| `typical_denial_rate` | `decision` column | `deny_count / total_count` (ratio, 0.0 to 1.0) |
| `typical_burst_size` | `timestamp` column | Maximum events in any single one-minute bucket |

#### No-Baseline Agents

When an event arrives for an agent with no baseline (a newly registered or previously unseen agent), the detector flags it as a low-severity `new_resource` anomaly. This is informational -- it tells the SOC that an agent is operating before a behavioral profile has been established.

Once the agent has sufficient audit history within the lookback window, the next scheduled baseline rebuild will create a profile automatically.

### 9.2 Configure Baseline Learning Parameters

Three parameters control how baselines are built. These are set at the BaselineEngine initialization level and apply to all agents within the SoulWatch instance.

#### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `lookback_hours` | `168` (7 days) | How far back to analyze audit events when building a baseline. Longer windows produce more stable baselines but are slower to adapt to legitimate behavior changes. |
| `rebuild_interval_hours` | `6` | How often the background rebuild task runs. Each cycle rebuilds baselines for all agents with recent audit activity. |
| `window_size` (detector) | `300` (5 minutes) | Sliding window for real-time event comparison. Events older than this window are pruned from the in-memory deque. |

#### Configure via Environment Variables

```bash
# In docker-compose.yml or Cloud Run environment
SOULWATCH_BASELINE_LOOKBACK_HOURS=168
SOULWATCH_BASELINE_REBUILD_INTERVAL_HOURS=6
SOULWATCH_DETECTOR_WINDOW_SIZE=300
```

#### Tuning Guidance

| Scenario | Recommended Lookback | Recommended Rebuild Interval |
|----------|---------------------|------------------------------|
| **New deployment** (learning phase) | `336` (14 days) | `12` hours |
| **Stable production** | `168` (7 days) | `6` hours |
| **Rapidly changing agent fleet** | `72` (3 days) | `2` hours |
| **High-security environment** | `720` (30 days) | `24` hours |

> **NOTE:** Longer lookback windows require more database query time during rebuilds. For tenants with more than 1,000 active agents, consider staggering rebuilds or increasing the rebuild interval to avoid database contention.

#### Minimum Sample Size

The engine does not enforce a minimum sample size -- it will build a baseline from any number of events, including a single event. However, baselines built from fewer than 100 events should be treated as preliminary. The `events_analyzed` field on each baseline record indicates how many events were used.

```bash
# Check baseline quality via API
curl -X GET "https://api.tiresias.network/watch/v1/baselines/{soulkey_id}" \
  -H "Authorization: Bearer $ADMIN_SOULKEY"
```

**Response**

```json
{
  "soulkey_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "typical_request_rate": 12.5,
  "typical_resources": ["memory", "code", "documents"],
  "typical_actions": ["read", "write"],
  "typical_scopes": ["cs:algorithms", "cs:networking"],
  "typical_hours": [9, 10, 11, 12, 13, 14, 15, 16, 17],
  "typical_denial_rate": 0.02,
  "typical_burst_size": 8,
  "last_updated": "2026-04-02T12:00:00Z",
  "events_analyzed": 1847,
  "lookback_hours": 168
}
```

### 9.3 View and Interpret Agent Baselines

Understanding what an agent's baseline contains is essential for tuning detection sensitivity and investigating anomalies.

#### Baseline Field Interpretation

**typical_request_rate** (float, requests/hour)

This is the agent's average throughput over the lookback window. A value of `12.5` means the agent averages 12.5 requests per hour. The anomaly detector compares the current sliding-window rate against this value multiplied by the `rate_spike` threshold (default: 3.0x).

Example: If `typical_request_rate = 12.5` and `rate_spike threshold = 3.0`, a rate spike anomaly fires when the current rate exceeds `37.5 requests/hour`.

**typical_resources** (set of strings)

The set of all distinct resources the agent accessed during the lookback window. When the agent accesses a resource not in this set, a `new_resource` anomaly fires at `medium` severity.

**typical_actions** (set of strings)

The set of all distinct actions (e.g., `read`, `write`, `delete`, `execute`) performed during the lookback window.

**typical_scopes** (set of strings)

The set of all distinct scopes requested. When an agent requests a scope outside this set, a `scope_escalation` anomaly fires at `high` severity. This is one of the most important baseline features for detecting compromised agents.

**typical_hours** (set of integers, 0-23)

The set of UTC hours during which the agent was active. Activity outside these hours triggers an `off_hours` anomaly at `medium` severity. For 24/7 agents, this set will contain all 24 hours and off-hours detection effectively becomes disabled.

**typical_denial_rate** (float, 0.0 to 1.0)

The historical ratio of denied requests to total requests. A sudden increase in denial rate often indicates credential probing or policy misconfiguration. The `denial_spike` threshold (default: 2.0x) triggers when the current window's denial rate exceeds this baseline multiplied by the threshold, with a minimum of 3 denied requests.

**typical_burst_size** (integer)

The maximum number of events in any one-minute bucket during the lookback window. The `burst` threshold (default: 2.0x) triggers when burst activity in the last 60 seconds exceeds this baseline multiplied by the threshold.

#### View All Baselines for a Tenant

```bash
curl -X GET "https://api.tiresias.network/watch/v1/baselines" \
  -H "Authorization: Bearer $ADMIN_SOULKEY"
```

### 9.4 Reset or Rebuild a Baseline

Baselines should be rebuilt when an agent's behavior has legitimately changed -- for example, after a new deployment, role expansion, or operational schedule change.

#### Rebuild a Single Agent's Baseline

```bash
curl -X POST "https://api.tiresias.network/watch/v1/baselines/{soulkey_id}/rebuild" \
  -H "Authorization: Bearer $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "lookback_hours": 72
  }'
```

This triggers an immediate baseline rebuild for the specified agent using the provided lookback window. The new baseline replaces the existing one in both the in-memory cache and the `_soulwatch_baselines` table.

> **NOTE:** If you specify a shorter `lookback_hours` than the default, the rebuilt baseline will reflect only recent behavior. This is useful after deployments but may increase false positive rates if the observation window is too narrow.

#### Rebuild All Baselines

Force a rebuild of all agent baselines. This queries `_soulauth_audit` for all distinct `soulkey_id` values within the lookback window and rebuilds each one sequentially.

```bash
curl -X POST "https://api.tiresias.network/watch/v1/baselines/rebuild-all" \
  -H "Authorization: Bearer $ADMIN_SOULKEY"
```

**Response**

```json
{
  "rebuilt": 47,
  "failed": 0,
  "message": "Baseline rebuild complete"
}
```

> **CAUTION:** Rebuilding all baselines is a database-intensive operation. On tenants with more than 500 agents, this query may take several minutes. Schedule rebuilds during low-traffic periods or use the background rebuild mechanism instead.

#### When to Rebuild

| Trigger | Action |
|---------|--------|
| Agent deployed with new capabilities | Rebuild that agent's baseline with lookback covering only post-deployment activity |
| Operational schedule changed (e.g., moved to 24/7) | Rebuild with lookback covering the new schedule |
| False positive storm after a legitimate behavior change | Rebuild with shorter lookback (48-72 hours) |
| Tenant-wide policy overhaul | Rebuild all baselines |
| SoulWatch service restart | Baselines are loaded from the database automatically; no manual rebuild needed |

### 9.5 Tune Anomaly Sensitivity

The anomaly detector uses per-type threshold multipliers to control detection sensitivity. Increasing a threshold reduces sensitivity (fewer alerts); decreasing it increases sensitivity (more alerts).

#### Default Thresholds

| Anomaly Type | Default Threshold | Unit | Description |
|-------------|-------------------|------|-------------|
| `rate_spike` | `3.0` | multiplier | Current rate must exceed `baseline * 3.0` |
| `off_hours` | `1` | flag | Any activity outside typical hours triggers |
| `new_resource` | `1` | flag | Any access to an unseen resource triggers |
| `scope_escalation` | `1` | flag | Any request for an unseen scope triggers |
| `denial_spike` | `2.0` | multiplier | Current denial rate must exceed `baseline * 2.0` |
| `burst` | `2.0` | multiplier | Current burst must exceed `baseline * 2.0` |
| `impossible_travel` | `1` | flag | Requests from different nodes within 2 seconds |
| `credential_stuffing` | `5` | count | 5+ failed auth attempts from same source in 5 minutes |
| `session_hijack` | `1` | flag | Session used from unexpected node |
| `model_abuse` | `1` | flag | Request for model outside typical set |
| `token_harvesting` | `3.0` | multiplier | Output/input token ratio below 0.1 with >1000 input tokens |
| `data_poisoning` | `1` | flag | Data modification patterns outside baseline |
| `lateral_movement` | `1` | flag | Cross-tenant resource access |
| `persistence` | `1` | flag | Persistence establishment patterns |
| `evasion` | `2.0` | multiplier | Evasion technique indicators |
| `supply_chain` | `1` | flag | Supply chain attack indicators |
| `resource_abuse` | `5.0` | multiplier | Request cost exceeds `baseline * 5.0` |
| `credential_rotation` | `3` | count | 3+ key lifecycle events in detection window |

#### Override Thresholds via API

```bash
curl -X PUT "https://api.tiresias.network/watch/v1/detection/thresholds" \
  -H "Authorization: Bearer $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "rate_spike": 5.0,
    "burst": 3.0,
    "credential_stuffing": 10,
    "off_hours": 0
  }'
```

> **NOTE:** Setting a threshold to `0` disables that anomaly type entirely. Use this with caution -- disabling detection types creates blind spots in your security posture.

#### Per-Agent Threshold Overrides

For agents with known unusual patterns (e.g., batch processing agents that legitimately spike), configure per-agent threshold overrides:

```bash
curl -X PUT "https://api.tiresias.network/watch/v1/detection/thresholds/{soulkey_id}" \
  -H "Authorization: Bearer $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "rate_spike": 10.0,
    "burst": 5.0
  }'
```

### 9.6 Exclude Known Patterns from Detection

Certain agent behaviors are expected but would otherwise trigger anomalies. Configure exclusions to suppress alerts for known-good patterns.

#### Maintenance Window Exclusions

During scheduled maintenance, agents may exhibit atypical behavior. Define maintenance windows to suppress anomaly detection:

```bash
curl -X POST "https://api.tiresias.network/watch/v1/detection/exclusions" \
  -H "Authorization: Bearer $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Weekly batch processing window",
    "type": "maintenance_window",
    "schedule": {
      "start": "02:00",
      "end": "06:00",
      "days": ["saturday"],
      "timezone": "UTC"
    },
    "suppressed_types": ["rate_spike", "burst", "off_hours"],
    "applies_to": {
      "persona_ids": ["batch-processor", "data-etl"],
      "tags": ["batch"]
    }
  }'
```

#### Permanent Exclusions

For agents that permanently operate outside normal patterns:

```bash
curl -X POST "https://api.tiresias.network/watch/v1/detection/exclusions" \
  -H "Authorization: Bearer $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "24/7 monitoring agent - off-hours exempt",
    "type": "permanent",
    "suppressed_types": ["off_hours"],
    "applies_to": {
      "soulkey_ids": ["a1b2c3d4-e5f6-7890-abcd-ef1234567890"]
    }
  }'
```

> **CAUTION:** Every exclusion creates a detection gap. Document the business justification for each exclusion. All exclusions are logged to the audit trail and are visible in the Portal under **Detection > Exclusions**.

#### List Active Exclusions

```bash
curl -X GET "https://api.tiresias.network/watch/v1/detection/exclusions" \
  -H "Authorization: Bearer $ADMIN_SOULKEY"
```

---

## Chapter 10: Agent-to-Agent Trust

Tiresias implements a delegation-based trust model that allows agents to temporarily expand other agents' permissions. This chapter covers the delegation chain model, trust policies, monitoring, and cross-tenant isolation guarantees.

### 10.1 Delegation Chain Model

In multi-agent architectures, an orchestrator agent often needs to grant temporary permissions to subordinate agents. Tiresias handles this through the delegation system -- a time-bound, scope-narrowing mechanism where one agent (the grantor) temporarily expands another agent's (the grantee's) access.

#### How Delegation Works

```
 Grantor Agent                  SoulAuth PDP                   Grantee Agent
 (has permission)               (delegation store)             (needs permission)
       |                              |                              |
       |  1. POST /delegations        |                              |
       |  {grantee, resource,         |                              |
       |   action, scope, ttl}        |                              |
       +----------------------------->|                              |
       |                              |                              |
       |  2. Verify grantor has       |                              |
       |     the permission being     |                              |
       |     delegated                |                              |
       |                              |                              |
       |  3. Check grantee hasn't     |                              |
       |     exceeded max active      |                              |
       |     delegations (10)         |                              |
       |                              |                              |
       |  4. Create delegation        |                              |
       |     record with TTL          |                              |
       |                              |                              |
       |  5. Audit log:               |                              |
       |     escalation_approved      |                              |
       |<-----------------------------+                              |
       |  {delegation_id}             |                              |
       |                              |                              |
       |                              |   6. Grantee requests access |
       |                              |<-----------------------------+
       |                              |                              |
       |                              |   7. PDP: no matching rule   |
       |                              |      -> check delegations    |
       |                              |      -> delegation found     |
       |                              |      -> GRANT + issue token  |
       |                              |                              |
       |                              +----------------------------->|
       |                              |   8. Capability token        |
       |                              |      (scoped to delegated    |
       |                              |       resource:action:scope) |
```

#### Key Properties

**Scope narrowing only.** A grantor can only delegate permissions it already possesses. The system verifies this by loading the grantor's resolved policy and checking for a matching rule before creating the delegation. If the grantor does not have the permission, the delegation is rejected with a clear error.

**Time-bound.** Every delegation has a TTL (time-to-live) in seconds, capped at a system maximum of 3,600 seconds (1 hour). When the TTL expires, the delegation becomes inactive and the grantee's expanded access ends automatically.

**Audited.** Delegation creation produces an `escalation_approved` audit event in the tamper-evident hash chain. Delegation revocation produces a separate audit event. Both events include the delegation ID, grantor, grantee, resource, action, scope, and TTL.

**Single-hop by default.** The current implementation supports single-hop delegation only. Agent A can delegate to Agent B, but Agent B cannot re-delegate to Agent C. This prevents privilege accumulation through delegation chains.

#### Delegation Record Schema

The `_soulauth_delegations` table stores all delegation records:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `tenant_id` | UUID | Owning tenant (scoped isolation) |
| `grantor_id` | UUID FK | SoulKey ID of the granting agent |
| `grantee_persona` | TEXT | Persona ID of the receiving agent |
| `resource` | TEXT | Resource being delegated (e.g., `memory`, `code`) |
| `action` | TEXT | Action being delegated (e.g., `read`, `write`) |
| `scope` | TEXT | Scope being delegated (e.g., `cs:algorithms`). Supports wildcard: `*` or prefix wildcard `cs:*` |
| `granted_at` | TIMESTAMPTZ | When the delegation was created |
| `expires_at` | TIMESTAMPTZ | When the delegation expires (computed from TTL) |
| `reason` | TEXT | Human-readable justification for the delegation |
| `revoked_at` | TIMESTAMPTZ | When the delegation was revoked (null if active) |
| `revoked_by` | TEXT | Identity that revoked the delegation |

### 10.2 Configure Trust Policies

Trust policies define which agents can delegate to which other agents and under what constraints.

#### Create a Delegation

```bash
curl -X POST https://api.tiresias.network/v1/soulauth/delegations \
  -H "Authorization: Bearer $GRANTOR_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "grantee_persona": "research-assistant",
    "resource": "memory",
    "action": "read",
    "scope": "cs:algorithms",
    "ttl": 1800,
    "reason": "Research assistant needs read access to algorithms knowledge base for task #4521"
  }'
```

**Response (201 Created)**

```json
{
  "delegation_id": "d1e2f3a4-b5c6-7890-abcd-ef1234567890",
  "grantor_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "grantee_persona": "research-assistant",
  "resource": "memory",
  "action": "read",
  "scope": "cs:algorithms",
  "granted_at": "2026-04-02T14:00:00Z",
  "expires_at": "2026-04-02T14:30:00Z",
  "reason": "Research assistant needs read access to algorithms knowledge base for task #4521"
}
```

> **NOTE:** The grantor authenticates with its own SoulKey. The system resolves the grantor's identity, loads its policy, and verifies the grantor has the `memory:read:cs:algorithms` permission before creating the delegation.

#### Revoke a Delegation Early

Active delegations can be revoked before their TTL expires. This immediately terminates the grantee's expanded access.

```bash
curl -X POST https://api.tiresias.network/v1/soulauth/delegations/{delegation_id}/revoke \
  -H "Authorization: Bearer $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "revoked_by": "security-ops@example.com"
  }'
```

The `revoked_at` and `revoked_by` fields are set on the delegation record. Any subsequent PDP evaluation that would have matched this delegation will now fall through to the standard deny path.

#### Policy-Based Delegation Constraints

Define which agents are permitted to delegate in the authorization policy YAML:

```yaml
# policy/personas/orchestrator.yaml
persona: orchestrator
resources:
  memory:
    - actions: ["read", "write"]
      scopes: ["*"]
      conditions: []
  code:
    - actions: ["read"]
      scopes: ["*"]
      conditions: []
escalation:
  approval_required_for: ["delete"]
  can_delegate_to:
    - "research-assistant"
    - "code-reviewer"
    - "data-analyst-*"  # wildcard persona matching
  max_delegation_ttl: 3600
  max_delegations_per_grantee: 5
```

> **NOTE:** The `can_delegate_to` field restricts which personas can receive delegations from this grantor. If omitted, the grantor can delegate to any persona within the same tenant. The wildcard pattern `data-analyst-*` matches all personas with that prefix.

### 10.3 Monitor Active Delegation Chains

#### List Active Delegations

Retrieve all active (non-expired, non-revoked) delegations for a tenant:

```bash
curl -X GET "https://api.tiresias.network/v1/soulauth/delegations?status=active" \
  -H "Authorization: Bearer $ADMIN_SOULKEY"
```

**Response**

```json
{
  "delegations": [
    {
      "id": "d1e2f3a4-b5c6-7890-abcd-ef1234567890",
      "grantor_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "grantor_persona": "orchestrator",
      "grantee_persona": "research-assistant",
      "resource": "memory",
      "action": "read",
      "scope": "cs:algorithms",
      "granted_at": "2026-04-02T14:00:00Z",
      "expires_at": "2026-04-02T14:30:00Z",
      "reason": "Task #4521",
      "remaining_seconds": 1247
    }
  ],
  "total": 1
}
```

#### Filter Delegations by Agent

View all delegations where a specific agent is the grantee:

```bash
curl -X GET "https://api.tiresias.network/v1/soulauth/delegations?grantee_persona=research-assistant" \
  -H "Authorization: Bearer $ADMIN_SOULKEY"
```

View all delegations where a specific agent is the grantor:

```bash
curl -X GET "https://api.tiresias.network/v1/soulauth/delegations?grantor_id={soulkey_id}" \
  -H "Authorization: Bearer $ADMIN_SOULKEY"
```

#### Portal Delegation View

The Portal provides a real-time delegation monitoring view at **Agents > Delegations**. This view shows:

- All active delegations with countdown timers showing remaining TTL
- A delegation graph visualization showing grantor-to-grantee relationships
- Historical delegation activity with filtering by grantor, grantee, resource, and time range
- Alerts for unusual delegation patterns (high volume, unusual grantee-grantor pairs)

### 10.4 Set Delegation Limits

Several system-level and policy-level limits prevent delegation abuse.

#### System Limits

| Limit | Default | Description |
|-------|---------|-------------|
| `MAX_DELEGATION_TTL` | `3600` seconds (1 hour) | Maximum time-to-live for any delegation. Requests exceeding this value are rejected. |
| `MAX_ACTIVE_DELEGATIONS_PER_GRANTEE` | `10` | Maximum number of concurrent active delegations any single grantee can hold. Prevents privilege accumulation. |
| Chain depth | `1` (single-hop) | Grantees cannot re-delegate received permissions. |

#### Override System Limits

System limits are configured as constants in the SoulAuth service. To modify them, update the environment variables:

```bash
SOULAUTH_MAX_DELEGATION_TTL=1800          # Reduce max TTL to 30 minutes
SOULAUTH_MAX_DELEGATIONS_PER_GRANTEE=5    # Reduce max concurrent delegations
```

> **CAUTION:** Reducing `MAX_DELEGATION_TTL` below 300 seconds (5 minutes) may cause operational issues for agents that need sustained access to delegated resources. Test with your agent fleet before deploying restrictive limits.

#### Automatic Expiration and Cleanup

Expired delegations are cleaned up by a background housekeeping task. The `cleanup_expired_delegations` function runs periodically and sets `revoked_at` to the current time and `revoked_by` to `system:expired` for all delegations past their `expires_at` timestamp.

```bash
# Manually trigger cleanup
curl -X POST "https://api.tiresias.network/v1/soulauth/delegations/cleanup" \
  -H "Authorization: Bearer $ADMIN_SOULKEY"
```

**Response**

```json
{
  "cleaned": 23,
  "message": "Expired delegations cleaned up"
}
```

### 10.5 Investigate Delegation Abuse

The delegation model can be exploited through several attack patterns. SoulWatch monitors for these patterns and raises anomalies. This section describes common abuse scenarios and how to investigate them.

#### Privilege Accumulation

A grantee agent accumulates delegations from multiple grantors to assemble a broader set of permissions than any single grantor intended.

**Detection:** The `MAX_ACTIVE_DELEGATIONS_PER_GRANTEE` limit (default: 10) prevents a grantee from holding more than 10 concurrent delegations. When this limit is approached, SoulWatch raises a `scope_escalation` anomaly.

**Investigation Steps**

| Step | Action |
|------|--------|
| 1 | List all active delegations for the suspect grantee: `GET /v1/soulauth/delegations?grantee_persona={persona_id}` |
| 2 | Review each delegation's `reason` field for legitimacy. |
| 3 | Check whether the combined scope of all delegations constitutes a security risk. |
| 4 | Revoke any unnecessary or suspicious delegations. |
| 5 | Consider reducing `MAX_ACTIVE_DELEGATIONS_PER_GRANTEE` if the pattern recurs. |

#### Unauthorized Delegation Attempts

An agent attempts to delegate a permission it does not possess. The system rejects this with a clear error.

**Detection:** Failed delegation attempts produce audit events of type `escalation_denied`. Filter the audit log for these events:

```bash
curl -X GET "https://api.tiresias.network/v1/soulauth/audit?event_type=escalation_denied&limit=100" \
  -H "Authorization: Bearer $ADMIN_SOULKEY"
```

**Investigation Steps**

| Step | Action |
|------|--------|
| 1 | Identify the grantor agent making unauthorized delegation attempts. |
| 2 | Review the grantor's resolved policy to understand its actual permissions. |
| 3 | Determine whether the delegation attempt was a legitimate misconfiguration or a compromise indicator. |
| 4 | If the agent's behavior suggests compromise, quarantine it (see Chapter 13). |

#### Delegation Timing Abuse

An agent creates short-lived delegations in rapid succession to maintain persistent expanded access without appearing to hold a long-lived delegation.

**Detection:** The `credential_rotation` anomaly type fires when 3 or more key lifecycle events (including delegation creates/revokes) occur within the detection window. Review the delegation history for patterns of rapid create/expire cycles:

```bash
curl -X GET "https://api.tiresias.network/v1/soulauth/delegations?grantee_persona={persona_id}&include_expired=true&limit=100" \
  -H "Authorization: Bearer $ADMIN_SOULKEY"
```

**Investigation Steps**

| Step | Action |
|------|--------|
| 1 | Query delegation history for the suspect grantee, including expired delegations. |
| 2 | Look for patterns: same resource/action/scope delegated repeatedly with short TTLs. |
| 3 | If the pattern indicates abuse, consider revoking the grantor's delegation capability by removing `can_delegate_to` entries for the suspect grantee. |
| 4 | Set up a quarantine policy targeting `credential_rotation` anomalies for automated response. |

### Cross-Tenant Isolation

Delegations are strictly tenant-scoped. The `tenant_id` column on the delegation record must match the tenant of both the grantor and the grantee. The PDP enforces this constraint at query time by including `tenant_id` in all delegation lookups.

#### Isolation Guarantees

| Property | Enforcement Layer | Description |
|----------|------------------|-------------|
| **Tenant-scoped delegation** | Database query (WHERE clause) | Delegation lookups always include `tenant_id` as a filter. A delegation in tenant A is invisible to queries from tenant B. |
| **Grantor tenant verification** | Application layer (delegation creation) | The grantor's `tenant_id` is resolved from its SoulKey. The delegation inherits this `tenant_id`. |
| **Cross-tenant detection** | SoulWatch anomaly detector | The `lateral_movement` anomaly type fires at `critical` severity when an agent accesses resources in a different tenant than its own. |
| **No cross-tenant delegation** | Application layer | An agent in tenant A cannot create a delegation for an agent in tenant B. The `grantee_persona` is resolved within the grantor's tenant only. |

> **NOTE:** Cross-tenant access is denied by default at every layer -- the database, the PDP, and the anomaly detector. There is no configuration option to enable cross-tenant delegation. This is a security invariant, not a policy decision.

#### Cross-Tenant Anomaly Response

When SoulWatch detects a `lateral_movement` anomaly (cross-tenant resource access), the default quarantine policy triggers:

1. **suspend_key** -- Immediately suspends the offending SoulKey.
2. **kill_session** -- Revokes all active capability tokens for the agent.
3. **No auto-release** -- Cross-tenant violations require manual investigation and release.

The quarantine record includes the source tenant and target tenant in the evidence field:

```json
{
  "type": "lateral_movement",
  "severity": "critical",
  "evidence": {
    "source_tenant": "11111111-1111-1111-1111-111111111111",
    "target_tenant": "22222222-2222-2222-2222-222222222222"
  }
}
```

This evidence is visible in the Portal under **Incidents** and in the quarantine record at **Enforcement > Quarantines**.

---

*End of Part III: Agent Security*

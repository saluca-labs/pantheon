# Tiresias App Proxy -- Security Documentation

**Version:** 0.1.0
**Last updated:** 2026-04-05
**Audience:** CISOs, security architects, penetration testers, compliance officers

---

## Table of Contents

1. [Authentication Model](#1-authentication-model)
2. [Authorization -- Cedar Policy Engine](#2-authorization----cedar-policy-engine)
3. [Encryption and Data Protection](#3-encryption-and-data-protection)
4. [Wasm Sandbox Security](#4-wasm-sandbox-security)
5. [Network Security](#5-network-security)
6. [Secret Management](#6-secret-management)
7. [Audit Trail](#7-audit-trail)
8. [Risk Scoring](#8-risk-scoring)
9. [Behavioral Analysis](#9-behavioral-analysis)
10. [Incident Response](#10-incident-response)
11. [Vulnerability Reporting](#11-vulnerability-reporting)

---

## 1. Authentication Model

The App Proxy implements a two-tier authentication model: API keys for agent traffic and admin keys for privileged operations.

### 1.1 API Key Authentication

All agent-facing endpoints require a bearer token in the `Authorization` header:

```
Authorization: Bearer <api-key>
```

**Verification process:**

1. The middleware extracts the bearer token from the header (`auth/middleware.py:extract_api_key`).
2. The token is hashed with SHA-256 (`hashlib.sha256`).
3. The hash is compared against the configured `APP_PROXY_API_KEY_HASH` using `hmac.compare_digest` (constant-time comparison to prevent timing attacks).
4. On mismatch, the request is rejected with HTTP 401.

**Key properties:**

- The raw API key is never stored on the server. Only the SHA-256 hex digest is configured.
- Timing-safe comparison prevents side-channel extraction of the hash.
- When `APP_PROXY_API_KEY_HASH` is not set, the proxy operates in **dev mode** -- all requests are permitted without authentication. Dev mode is logged with `auth.dev_mode` and must never be used in production.

### 1.2 Admin Key Authentication

Administrative endpoints (`/admin/*`) require the `X-Admin-Key` header:

```
X-Admin-Key: <admin-key>
```

The admin key is compared using `hmac.compare_digest` against `APP_PROXY_ADMIN_KEY`. Admin endpoints include:

- `POST /admin/policies/reload` -- force Cedar policy reload
- `POST /admin/policies/validate` -- validate on-disk policies
- `POST /admin/plugins/{name}/unload` -- unload a plugin

When `APP_PROXY_ADMIN_KEY` is not set, admin endpoints are unprotected (dev mode only).

### 1.3 Soulkey Integration

The Cedar entity schema includes a `soulkey` attribute on `Tiresias::Agent` entities. This supports integration with the Tiresias identity layer for cryptographic agent identity verification. Soulkeys are passed as agent attributes during policy evaluation and can be referenced in Cedar policy conditions.

### 1.4 Authentication Context

On successful authentication, the middleware produces a context dict carried through the request lifecycle:

```json
{
  "tenant_id": "a1b2c3d4-...",
  "authenticated": true,
  "mode": "production"
}
```

This context is attached to every audit log entry, policy evaluation, and risk assessment.

---

## 2. Authorization -- Cedar Policy Engine

### 2.1 Overview

Every tool call is evaluated against Cedar policies before dispatch. Cedar is Amazon's open-source authorization language, chosen for its formal verification properties and declarative syntax.

### 2.2 Evaluation Flow

```
Request -> Auth middleware -> Risk scorer -> Cedar policy engine -> Dispatch or Deny
```

1. The request is authenticated (Section 1).
2. The risk scorer computes a 0-100 risk score with factor breakdown (Section 8).
3. The Cedar engine evaluates the action against loaded policies.
4. If the policy decision is `deny` and the action is on a destructive plugin without approval, the action is routed to the approval queue instead of being flat-denied.
5. In `strict` mode, denied actions return HTTP 403. In `advisory` mode, denied actions are logged but permitted.

### 2.3 Entity Model

Three entity types form the authorization model:

| Entity | Type | Key Attributes | Hierarchy |
|---|---|---|---|
| Tenant | `Tiresias::Tenant` | `tier` (string), `max_agents` (long) | Root entity |
| Agent | `Tiresias::Agent` | `soulkey` (string), `roles` (set of string) | Member of Tenant |
| Plugin | `Tiresias::Plugin` | `classification` (string), `owner_tenant` (string) | Standalone |

### 2.4 Actions

| Action | Context Fields | Purpose |
|---|---|---|
| `tool_call` | `tool_name`, `rate_count`, `rate_window_seconds`, `hour_of_day`, `has_approval`, `estimated_cost_usd`, `input_keys` | Primary action for tool invocations |
| `read` | `tool_name`, `hour_of_day` | Read-only operations |
| `write` | `tool_name`, `hour_of_day`, `has_approval`, `rate_count` | Write/mutate operations |

### 2.5 Default Policy Set

The base policy set (`policies/cedar/base.cedar`) implements:

- **P1:** Any agent may read from any plugin (no restrictions on read).
- **P2-P3:** Tool calls and writes permitted within rate limits (<100/window) and business hours (06:00-22:00 UTC).
- **F1-F2:** Writes and tool calls to destructive plugins forbidden without approval.
- **F3:** Tool calls forbidden when rate limit exceeded.
- **F4:** Writes forbidden outside business hours.

### 2.6 Policy Hot-Reload

The engine checks for policy file changes every 30 seconds (configurable via `CEDAR_RELOAD_INTERVAL_SECONDS`). On reload:

1. All `.cedar` files under `policies_dir` are concatenated.
2. A validation dry-run authorization is executed against the schema.
3. If validation passes, the new policies replace the current set atomically under a thread lock.
4. If validation fails, the previous policies are retained and an error is logged.

This ensures that a malformed policy file never takes effect in production.

### 2.7 Thread Safety

All access to the policy store is guarded by `threading.Lock`. Policy evaluation and reload are safe for concurrent use across async workers.

---

## 3. Encryption and Data Protection

### 3.1 Audit Log Integrity

Audit log entries include a SHA-256 hash chain for tamper detection. Each record's hash is computed over the previous record's hash plus the current record's content, forming an immutable chain. Any modification to a historical record breaks the chain and is detectable during compliance reporting.

### 3.2 Argument Masking

Tool call arguments are scanned for sensitive data patterns before logging:

| Pattern | Severity | Examples |
|---|---|---|
| Credit card numbers | High | 13-19 digit sequences |
| Social Security numbers | High | NNN-NN-NNNN format |
| API keys and tokens | High | `sk-*`, `pk-*`, `api_*`, bearer tokens |
| Email addresses | Medium | Standard email format |
| URLs | Low | HTTP/HTTPS URLs |
| PII keywords | Medium | `password`, `secret`, `ssn`, `credit_card`, `bank_account` |

Detected patterns contribute to the risk score (Section 8) and are masked in audit logs stored at rest.

### 3.3 Transport Encryption

The proxy serves plain HTTP. TLS must be terminated at a reverse proxy (nginx, Traefik, cloud load balancer). See the Deployment Guide for TLS configuration.

### 3.4 Data at Rest

- **SQLite:** No native encryption. Use LUKS/BitLocker full-disk encryption on the host.
- **PostgreSQL:** Enable `ssl=on` in PostgreSQL configuration. Use encrypted storage volumes in cloud deployments.
- **Secrets** are never written to the database. API keys are stored only as hashes. Admin keys are held in memory from environment variables.

---

## 4. Wasm Sandbox Security

Plugins can be deployed as WebAssembly (Wasm) modules, executing in a sandboxed runtime with strict isolation guarantees.

### 4.1 Isolation Model

Each Wasm plugin instance receives:

- **Isolated linear memory** -- no shared address space between plugins. Each instance has its own linear memory, preventing cross-plugin data leakage.
- **Capability-based imports** -- only host functions matching the plugin's declared capabilities are injected as Wasmtime imports. Undeclared capabilities are never available to the guest module. An attempt to import an undeclared function fails at instantiation time.
- **No filesystem access** -- plugins cannot read or write the host filesystem unless explicitly granted through a capability.
- **No network access** -- plugins cannot make outbound network calls unless the `http:fetch` capability is declared and wired.

### 4.2 Resource Limits

| Resource | Default | Configurable | Enforcement |
|---|---|---|---|
| Instruction fuel | 1,000,000,000 | Per-plugin via `WasmResourceLimits.fuel` | Wasmtime traps on exhaustion |
| Linear memory | 256 pages (16 MiB) | Per-plugin via `WasmResourceLimits.memory_pages` | Wasmtime enforces at allocation |
| Call timeout | 30 seconds | Per-call via `timeout` parameter | `asyncio.wait_for` cancellation |

Fuel metering prevents infinite loops and runaway computation. When a plugin exhausts its fuel budget, Wasmtime raises a trap and the call returns an error -- the plugin cannot continue executing.

### 4.3 Capability Registry

Built-in capabilities:

| Token | Host Function | Description |
|---|---|---|
| `echo:call` | `echo_call` | Echoes input (testing/debugging) |
| `slack:read` | `slack_read_messages` | Read messages from Slack |
| `slack:post` | `slack_post_message` | Post a message to Slack |
| `http:fetch` | `http_fetch` | Make outbound HTTP requests |

Custom capabilities are registered via `register_capability()`. Each capability maps to one or more host functions that are injected into the Wasm linker only when the plugin declares that capability.

### 4.4 Execution Backends

| Backend | Isolation | Performance | Availability |
|---|---|---|---|
| wasmtime Python bindings | In-process, memory-isolated | Low overhead | Requires `pip install wasmtime` |
| wasmtime CLI subprocess | Process-level | Higher per-call overhead | Requires `wasmtime` on PATH |

The runtime selects the best available backend automatically. If neither is present, Wasm plugins are unavailable but the proxy continues operating with native MCP plugins.

### 4.5 Security Boundaries

```
Host (App Proxy)
  |
  +-- Wasmtime Engine (fuel metering, memory limits)
       |
       +-- Store (per-plugin, isolated)
       |    +-- Module instance
       |    +-- Only declared host imports available
       |
       +-- Store (per-plugin, isolated)
            +-- Module instance
            +-- Only declared host imports available
```

A compromised Wasm plugin cannot:

- Read or write memory of other plugins.
- Access host functions it did not declare.
- Escape the Wasmtime sandbox (barring a Wasmtime engine vulnerability).
- Consume unbounded CPU or memory.

---

## 5. Network Security

### 5.1 Deployment Topology

The App Proxy is designed for **internal-only deployment**. It should not be exposed to the public internet. Recommended topology:

```
Internet -> [Firewall] -> [Reverse Proxy / TLS] -> App Proxy (port 8081)
                                                        |
                                                        +-> PostgreSQL (port 5432)
                                                        +-> MCP plugin servers (internal)
```

### 5.2 Port Exposure

| Port | Protocol | Purpose | External Access |
|---|---|---|---|
| 8081 | HTTP | App Proxy API | No -- reverse proxy only |
| 5432 | TCP | PostgreSQL | No -- internal only |

### 5.3 CORS Configuration

The application configures `CORSMiddleware` with `allow_origins=["*"]` for dashboard development. In production, restrict origins to the Tiresias dashboard domain:

```python
allow_origins=["https://dashboard.tiresias.network"]
```

### 5.4 Network Policy (Kubernetes)

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: tiresias-app-proxy
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: tiresias-app-proxy
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: tiresias-ingress
      ports:
        - port: 8081
  egress:
    - to:
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: postgres
      ports:
        - port: 5432
```

---

## 6. Secret Management

### 6.1 Principles

- Secrets are injected via environment variables at runtime.
- Secrets are never stored in source code, configuration files, or container images.
- The API key is stored only as a SHA-256 hash (`APP_PROXY_API_KEY_HASH`).
- Wasm plugin secrets are passed through the `CapabilityBridge` and held in memory only.

### 6.2 Required Secrets

| Secret | Environment Variable | Storage |
|---|---|---|
| API key hash | `APP_PROXY_API_KEY_HASH` | SHA-256 hex in env var |
| Admin key | `APP_PROXY_ADMIN_KEY` | Plaintext in env var (compared via `hmac.compare_digest`) |
| Database password | In `APP_PROXY_DATABASE_URL` | Embedded in connection string |
| Approval webhook URL | `APP_PROXY_APPROVAL_NOTIFY_URL` | URL in env var |

### 6.3 Kubernetes Secrets

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: tiresias-app-proxy-secrets
type: Opaque
stringData:
  APP_PROXY_API_KEY_HASH: "<sha256-hex>"
  APP_PROXY_ADMIN_KEY: "<admin-key>"
  APP_PROXY_DATABASE_URL: "postgresql+asyncpg://user:pass@host:5432/db"
```

For production, use an external secret manager (HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager) with a CSI driver or sidecar injector.

### 6.4 Secret Rotation

1. Generate a new API key and compute its SHA-256 hash.
2. Update `APP_PROXY_API_KEY_HASH` in the environment/secret store.
3. Restart the proxy (or trigger a rolling update). The new hash takes effect on next request.
4. Distribute the new API key to authorized agents.
5. Revoke the old API key from all agents.

There is no graceful dual-key period in v0.1.0. Plan a brief maintenance window for key rotation, or implement key rotation at the reverse proxy layer.

---

## 7. Audit Trail

### 7.1 What Is Logged

Every tool call generates an audit record containing:

| Field | Description |
|---|---|
| `timestamp` | UTC ISO 8601 timestamp |
| `agent_id` | Identity of the calling agent |
| `tenant_id` | Tenant that owns the agent |
| `plugin_name` | Target plugin |
| `tool_name` | Specific tool invoked |
| `action` | Cedar action (`tool_call`, `read`, `write`) |
| `policy_decision` | `allow` or `deny` |
| `policy_reasons` | Cedar policy IDs that contributed to the decision |
| `risk_score` | Composite risk score (0-100) |
| `risk_level` | Classification (`low`, `medium`, `high`, `critical`) |
| `risk_factors` | Breakdown of contributing factors |
| `behavioral_alerts` | Any behavioral alerts triggered |
| `approval_status` | `approved`, `denied`, `pending`, or `n/a` |
| `resolved_by` | Identity of the human who approved/denied (if applicable) |
| `arguments_masked` | Tool arguments with sensitive data masked |
| `result_summary` | Truncated result metadata |
| `integrity_hash` | SHA-256 hash for chain-of-integrity verification |

### 7.2 Retention

Audit logs are retained for the number of days specified by `APP_PROXY_RETENTION_DAYS` (default: 30). For compliance:

- **SOC 2:** Minimum 90 days recommended.
- **EU AI Act:** Retain logs for the operational lifetime of the system plus any required post-decommission period.
- **NIST AI RMF:** Retain as defined in organizational risk management policy.

### 7.3 Integrity Verification

Each audit record includes an `integrity_hash` computed as:

```
SHA-256(previous_record_hash + current_record_json)
```

This creates a hash chain. To verify integrity:

1. Query audit records in chronological order.
2. Recompute each hash from the previous hash and the current record content.
3. Compare against the stored hash. Any mismatch indicates tampering.

### 7.4 Export

Audit records can be queried via the compliance API:

```
GET /compliance/{framework}/report
```

Returns structured JSON suitable for import into GRC platforms (ServiceNow GRC, Drata, Vanta).

---

## 8. Risk Scoring

### 8.1 Overview

Every tool call is assigned a composite risk score from 0 to 100 before Cedar policy evaluation. The score is computed from six weighted factors and determines the recommended action.

### 8.2 Risk Factors

| Factor | Weight | Activation | Description |
|---|---|---|---|
| `destructive_tool` | 30 | 0.0 or 1.0 | Tool has `destructiveHint` or `tiresias:approvalRequired` annotation |
| `external_exposure` | 25 | 0.0 - 1.0 | Tool sends data externally (name heuristic + URL/email in args) |
| `sensitive_data` | 20 | 0.0 - 1.0 | Arguments contain credit cards, SSNs, API keys, PII keywords |
| `off_hours` | 10 | 0.0 or 1.0 | Operation outside 06:00-22:00 UTC |
| `blast_radius` | 10 | 0.0 or 1.0 | Arguments contain wildcards, `@everyone`, `@channel`, broadcast indicators |
| `new_agent` | 5 | 0.0 or 1.0 | Agent has fewer than 10 prior calls in current session |

**Composite score:** `sum(factor.weight * factor.value)`, clamped to 0-100.

### 8.3 Risk Levels and Recommendations

| Score Range | Level | Recommendation |
|---|---|---|
| 0 - 25 | Low | Allow |
| 26 - 50 | Medium | Review |
| 51 - 75 | High | Require approval |
| 76 - 100 | Critical | Block |

### 8.4 Policy Integration

The risk score and level are available in the Cedar policy context. Custom policies can reference `context.risk_score` to implement organization-specific risk thresholds.

---

## 9. Behavioral Analysis

### 9.1 Overview

The `BehavioralAnalyzer` maintains a sliding window of recent tool calls per agent (default: 30 minutes, max 100 events) and matches against five threat patterns. Analysis runs in-memory with O(n) complexity per pattern, adding negligible latency to the request path.

### 9.2 Threat Patterns

#### Pattern 1: Data Exfiltration (Critical)

**Trigger:** Agent reads from an internal source then sends to an external target within 5 minutes.

**Detection logic:** Matches sequences where a read tool (e.g., `read_messages`, `list_files`) is followed by an external write tool (e.g., `send_email`, `upload_file`) within a 300-second window.

**Recommendation:** Review whether the agent should have access to both internal read and external send tools. Consider Cedar policy constraints on data flow between plugins.

#### Pattern 2: Privilege Escalation (Critical)

**Trigger:** A new agent (fewer than 10 total calls) invokes admin/configuration tools, or an agent invokes admin tools after performing only read operations.

**Detection logic:** Identifies agents using tools like `configure_relay`, `set_permissions`, `update_policy`, `create_webhook` when their history shows either very few prior calls or only read activity.

**Recommendation:** Verify agent identity and authorization level. Require human approval for configuration changes from new agents.

#### Pattern 3: Rapid Destructive Operations (Warning)

**Trigger:** Agent calls three or more destructive tools within 2 minutes.

**Detection logic:** Sliding window over destructive operations (`delete_*`, `remove_*`, `purge`, `destroy`) looking for three or more within a 120-second window.

**Recommendation:** Rate-limit destructive operations or require per-call approval. Investigate whether bulk deletion was intended.

#### Pattern 4: Reconnaissance (Warning)

**Trigger:** Agent performs five or more read/list operations within 60 seconds without any write actions.

**Detection logic:** Identifies rapid sequential enumeration of resources (channels, users, files, documents) without interleaved write operations.

**Recommendation:** Monitor for subsequent exfiltration attempts. May be legitimate enumeration -- context determines severity.

#### Pattern 5: Approval Circumvention (Critical)

**Trigger:** Agent submits the same tool call three or more times after denial, potentially with varying arguments.

**Detection logic:** Groups denied calls by tool name and flags repeated attempts. Distinguishes between identical retries (brute force) and varying arguments (circumvention).

**Recommendation:** Temporarily block the agent or escalate to a human operator.

### 9.3 Alert Structure

Each alert includes:

```json
{
  "pattern_name": "data_exfiltration",
  "severity": "critical",
  "description": "Agent read from 'list_files' then sent to 'send_email' within 45s",
  "events": [ ... ],
  "recommendation": "Review data flow between plugins..."
}
```

Alerts are logged via structlog (`behavioral.alert` event) and included in the tool call response and audit record.

### 9.4 Thread Safety

All history access is guarded by `threading.Lock`. The analyzer prunes expired events on every `record()` and `analyze()` call, keeping memory bounded.

---

## 10. Incident Response

### 10.1 Immediate Actions

| Incident | Action | Endpoint/Method |
|---|---|---|
| Suspicious agent behavior | Deny pending approvals | `POST /approval/{id}/deny` |
| Compromised plugin | Unload the plugin | `POST /admin/plugins/{name}/unload` |
| Policy bypass detected | Deploy deny-all policy | Add `forbid(principal, action, resource);` to Cedar, wait 30s for reload |
| Compromised API key | Rotate key hash | Update `APP_PROXY_API_KEY_HASH`, restart |
| Mass destructive operations | Emergency halt | Deploy deny-all Cedar policy via hot-reload |

### 10.2 Policy Hot-Reload for Incident Response

Cedar policies reload every 30 seconds. To respond to an incident:

1. Write a `forbid` policy to the policies directory (e.g., `emergency_deny_all.cedar`).
2. The engine picks up the change within 30 seconds.
3. Alternatively, call `POST /admin/policies/reload` with the admin key for immediate effect.
4. Verify via `POST /admin/policies/validate`.

Example emergency deny-all policy:

```cedar
// Emergency: deny all actions
forbid (
    principal,
    action,
    resource
);
```

### 10.3 Approval Queue as Kill Switch

When `APP_PROXY_ENABLE_APPROVAL_QUEUE` is `true`, destructive actions on destructive-classified plugins are routed to the approval queue. An administrator can:

- Deny all pending approvals to halt destructive operations.
- Reduce `APP_PROXY_APPROVAL_TIMEOUT_MINUTES` to auto-deny faster.
- Disable the queue entirely to hard-block (combined with a forbid policy).

### 10.4 Forensic Data

After an incident, collect:

1. **Audit logs** -- query by agent_id and time range via the compliance API.
2. **Behavioral alerts** -- filter structlog output for `behavioral.alert` events.
3. **Policy decisions** -- filter for `cedar_engine.authorize` log events with `allowed=false`.
4. **Risk factor breakdowns** -- available in audit records for each tool call.

---

## 11. Vulnerability Reporting

Report security vulnerabilities to:

**Email:** security@saluca.com

**What to include:**

- Description of the vulnerability
- Steps to reproduce
- Affected version(s)
- Impact assessment

**Response timeline:**

- Acknowledgment within 48 hours.
- Initial triage within 5 business days.
- Fix or mitigation plan within 30 days for critical/high severity.

See also: [SECURITY.md](../SECURITY.md) in the repository root.

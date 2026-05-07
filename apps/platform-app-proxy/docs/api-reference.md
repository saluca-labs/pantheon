# Tiresias App Proxy -- API Reference

Base URL: `http://<host>:<APP_PROXY_PROXY_PORT>` (default port `8081`)

## Authentication

The App Proxy uses two authentication mechanisms:

| Mechanism | Header | Used by |
|-----------|--------|---------|
| **API Key** | `Authorization: Bearer <key>` | Tools, Schedules endpoints |
| **Admin Key** | `X-Admin-Key: <key>` | Admin, Approval (approve/deny/list) endpoints |

When `APP_PROXY_API_KEY_HASH` is unset, API key auth is disabled (dev mode -- all requests pass).
When `APP_PROXY_ADMIN_KEY` is unset, admin key auth is disabled (dev mode).

API keys are verified by comparing `SHA-256(provided_key)` against the configured `api_key_hash` using constant-time comparison.

---

## 1. Health

### GET /health

Liveness/readiness probe. No authentication required.

**Response 200**

```json
{
  "status": "ok",
  "plugins": 5,
  "policy_enforcement": "strict"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Always `"ok"` if the service is running |
| `plugins` | int | Number of tools loaded across all plugins |
| `policy_enforcement` | string | Current policy mode: `"strict"` or `"advisory"` |

**Example**

```bash
curl http://localhost:8081/health
```

---

## 2. Tools

### POST /v1/tools/list

List all available tools across all healthy plugins.

**Authentication:** API Key (Bearer token)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agent_id` | string | No | Filter by agent (currently unused, reserved) |
| `tenant_id` | string | No | Filter by tenant (currently unused, reserved) |

```json
{
  "agent_id": "agent-001",
  "tenant_id": "acme-corp"
}
```

**Response 200**

```json
{
  "tools": [
    {
      "name": "slack_post_message",
      "plugin": "slack",
      "description": "Post a message to a Slack channel",
      "inputSchema": {
        "type": "object",
        "properties": {
          "channel": {"type": "string"},
          "text": {"type": "string"}
        },
        "required": ["channel", "text"]
      }
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `tools` | array | List of tool entries |
| `tools[].name` | string | Unique tool name |
| `tools[].plugin` | string | Plugin that owns this tool |
| `tools[].description` | string | Human-readable description |
| `tools[].inputSchema` | object | JSON Schema for the tool's arguments |

**Error Responses**

| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid API key |
| 503 | Plugin registry not initialized |

**Example**

```bash
curl -X POST http://localhost:8081/v1/tools/list \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "agent-001"}'
```

---

### POST /v1/tools/call

Dispatch a tool call through the full policy pipeline: argument validation, risk scoring, behavioral analysis, Cedar policy evaluation, optional approval queue, MCP plugin dispatch, and audit logging.

**Authentication:** API Key (Bearer token)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tool_name` | string | Yes | Name of the tool to call |
| `arguments` | object | No | Tool arguments (validated against inputSchema) |
| `agent_id` | string | Yes | Calling agent identifier |
| `tenant_id` | string | Yes | Tenant identifier |
| `soulkey` | string | No | Soulkey for Cedar policy context |
| `reason` | string | No | Human-readable reason for the call |
| `session_id` | string | No | Session identifier for audit correlation |

```json
{
  "tool_name": "slack_post_message",
  "arguments": {"channel": "#general", "text": "Hello"},
  "agent_id": "agent-001",
  "tenant_id": "acme-corp",
  "soulkey": "sk_abc123",
  "reason": "Notify team of deployment",
  "session_id": "sess-xyz"
}
```

**Response 200 -- Allowed and executed**

```json
{
  "status": "ok",
  "tool_name": "slack_post_message",
  "result": {"ts": "1234567890.123456", "channel": "C01ABC"},
  "audit_ref": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "behavioral_alerts": []
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"ok"` |
| `tool_name` | string | Tool that was called |
| `result` | any | Raw result from the MCP plugin |
| `audit_ref` | string | Audit log reference ID |
| `behavioral_alerts` | array | Any non-blocking behavioral pattern alerts |

**Response 200 -- Denied by policy**

```json
{
  "status": "denied",
  "tool_name": "dangerous_tool",
  "reason": "Cedar policy forbids destructive actions outside maintenance window",
  "audit_ref": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "behavioral_alerts": [
    {
      "pattern_name": "rapid_escalation",
      "severity": "warning",
      "description": "Agent escalated tool risk level 3 times in 5 minutes",
      "recommendation": "Review agent behavior for potential compromise"
    }
  ]
}
```

**Response 200 -- Queued for approval**

```json
{
  "status": "pending_approval",
  "tool_name": "delete_database",
  "approval_id": "appr-12345",
  "audit_ref": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "expires_at": "2026-04-05T12:30:00+00:00",
  "priority": "normal"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"pending_approval"` |
| `approval_id` | string | Use this ID with the Approval endpoints |
| `expires_at` | string | ISO-8601 timestamp when auto-deny triggers |
| `priority` | string | `"low"`, `"normal"`, `"high"`, or `"critical"` |

**Error Responses**

| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid API key |
| 404 | Tool not found in any plugin |
| 422 | Argument validation failed (response body contains `validation_errors` array) |
| 502 | MCP plugin dispatch failed or returned an error |
| 503 | Plugin registry, audit logger, or behavioral analyzer not available |

**Example**

```bash
curl -X POST http://localhost:8081/v1/tools/call \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "slack_post_message",
    "arguments": {"channel": "#general", "text": "deploy complete"},
    "agent_id": "agent-001",
    "tenant_id": "acme-corp"
  }'
```

---

## 3. Admin

All admin endpoints require the `X-Admin-Key` header.

### GET /v1/admin/plugins

List all registered plugins with health status.

**Authentication:** Admin Key

**Response 200**

```json
{
  "plugins": [
    {
      "name": "slack",
      "version": "1.0.0",
      "mcp_server_type": "stdio",
      "tools": 12,
      "healthy": true,
      "last_health_check": "2026-04-05T10:00:00+00:00"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `plugins` | array | List of plugin summaries |
| `plugins[].name` | string | Plugin identifier |
| `plugins[].version` | string | Plugin manifest version |
| `plugins[].mcp_server_type` | string | Transport type (`"stdio"`, `"sse"`, `"streamable_http"`) |
| `plugins[].tools` | int | Number of tools in this plugin |
| `plugins[].healthy` | bool | Whether last health check passed |
| `plugins[].last_health_check` | string or null | ISO-8601 timestamp of last check |

**Error Responses**

| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid admin key |

**Example**

```bash
curl http://localhost:8081/v1/admin/plugins \
  -H "X-Admin-Key: YOUR_ADMIN_KEY"
```

---

### POST /v1/admin/plugins/health

Force an immediate health check across all plugins.

**Authentication:** Admin Key

**Response 200**

```json
{
  "results": [
    {"plugin": "slack", "healthy": true},
    {"plugin": "github", "healthy": false}
  ],
  "healthy_count": 1,
  "total_count": 2
}
```

| Field | Type | Description |
|-------|------|-------------|
| `results` | array | Per-plugin health results |
| `results[].plugin` | string | Plugin name |
| `results[].healthy` | bool | Health check result |
| `healthy_count` | int | Number of healthy plugins |
| `total_count` | int | Total registered plugins |

**Error Responses**

| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid admin key |

**Example**

```bash
curl -X POST http://localhost:8081/v1/admin/plugins/health \
  -H "X-Admin-Key: YOUR_ADMIN_KEY"
```

---

### POST /v1/admin/policies/reload

Force a Cedar policy reload from disk. Reads all `.cedar` files from the configured `policies_dir`.

**Authentication:** Admin Key

**Response 200**

```json
{
  "status": "ok",
  "policies_loaded": 4,
  "message": "Policies reloaded successfully"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"ok"` or `"warning"` (if validation errors exist) |
| `policies_loaded` | int | Number of `.cedar` files found |
| `message` | string | Human-readable status message |

**Error Responses**

| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid admin key |
| 500 | Policy reload failed (filesystem error, parse error) |

**Example**

```bash
curl -X POST http://localhost:8081/v1/admin/policies/reload \
  -H "X-Admin-Key: YOUR_ADMIN_KEY"
```

---

### POST /v1/admin/policies/validate

Validate all Cedar policies on disk without reloading. Use this in CI/CD before deploying policy changes.

**Authentication:** Admin Key

**Response 200 -- valid**

```json
{
  "valid": true,
  "errors": []
}
```

**Response 200 -- invalid**

```json
{
  "valid": false,
  "errors": [
    {
      "file": "policies/cedar/tenant.cedar",
      "line": 12,
      "message": "Unexpected token 'when'"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `valid` | bool | `true` if all policies parse without errors |
| `errors` | array | List of validation errors |
| `errors[].file` | string | File path (if determinable) |
| `errors[].line` | int or null | Line number (if determinable) |
| `errors[].message` | string | Error description |

**Error Responses**

| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid admin key |
| 500 | Validation engine itself failed |

**Example**

```bash
curl -X POST http://localhost:8081/v1/admin/policies/validate \
  -H "X-Admin-Key: YOUR_ADMIN_KEY"
```

---

## 4. Approval

The approval queue holds tool calls that Cedar policy flagged as requiring human review before execution. Approvals auto-expire after `APP_PROXY_APPROVAL_TIMEOUT_MINUTES` (default 30).

### GET /v1/approval

List approval records with optional filters.

**Authentication:** Admin Key

**Query Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `status` | string | No | null | Filter: `"pending"`, `"approved"`, `"denied"`, `"expired"` |
| `tenant_id` | string | No | null | Filter by tenant |
| `limit` | int | No | 50 | Max results (1--500) |

**Response 200**

```json
{
  "approvals": [
    {
      "approval_id": "appr-12345",
      "status": "pending",
      "tool_name": "delete_database",
      "agent_id": "agent-001",
      "tenant_id": "acme-corp",
      "created_at": "2026-04-05T12:00:00+00:00",
      "expires_at": "2026-04-05T12:30:00+00:00",
      "resolved_at": null,
      "resolved_by": null,
      "result": null
    }
  ],
  "count": 1
}
```

**Error Responses**

| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid admin key |
| 503 | ApprovalService not initialized |

**Example**

```bash
curl "http://localhost:8081/v1/approval?status=pending&limit=10" \
  -H "X-Admin-Key: YOUR_ADMIN_KEY"
```

---

### GET /v1/approval/{approval_id}

Get the current status of a specific approval request.

**Authentication:** None (approval IDs are opaque UUIDs and serve as capability tokens)

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `approval_id` | string | Approval identifier (returned by `/v1/tools/call`) |

**Response 200**

```json
{
  "approval_id": "appr-12345",
  "status": "pending",
  "tool_name": "delete_database",
  "agent_id": "agent-001",
  "tenant_id": "acme-corp",
  "created_at": "2026-04-05T12:00:00+00:00",
  "expires_at": "2026-04-05T12:30:00+00:00",
  "resolved_at": null,
  "resolved_by": null,
  "result": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `approval_id` | string | Approval identifier |
| `status` | string | `"pending"`, `"approved"`, `"denied"`, `"executed"`, `"expired"` |
| `tool_name` | string | Tool that was requested |
| `agent_id` | string | Agent that initiated the call |
| `tenant_id` | string | Tenant scope |
| `created_at` | string | ISO-8601 creation timestamp |
| `expires_at` | string | ISO-8601 expiration timestamp |
| `resolved_at` | string or null | ISO-8601 timestamp when resolved |
| `resolved_by` | string or null | Admin who resolved (from `X-Admin-Id` header) |
| `result` | any | Tool execution result (populated after approval + execution) |

**Error Responses**

| Status | Meaning |
|--------|---------|
| 404 | Approval ID not found |
| 503 | ApprovalService not initialized |

**Example**

```bash
curl http://localhost:8081/v1/approval/appr-12345
```

---

### POST /v1/approval/{approval_id}/approve

Approve a pending tool call. The proxy immediately dispatches the tool call to the MCP plugin and returns the result.

**Authentication:** Admin Key

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `approval_id` | string | Approval identifier |

**Headers**

| Header | Required | Description |
|--------|----------|-------------|
| `X-Admin-Key` | Yes | Admin authentication |
| `X-Admin-Id` | No | Identifier of the approving admin (recorded in audit) |

**Response 200**

```json
{
  "approval_id": "appr-12345",
  "status": "executed",
  "resolved_by": "admin@acme.com",
  "resolved_at": "2026-04-05T12:15:00+00:00",
  "result": {"ts": "1234567890.123456"}
}
```

**Error Responses**

| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid admin key |
| 404 | Approval ID not found |
| 409 | Approval is not in `"pending"` state (already resolved/expired) |
| 502 | MCP plugin dispatch failed |
| 503 | ApprovalService or plugin registry not available |

**Example**

```bash
curl -X POST http://localhost:8081/v1/approval/appr-12345/approve \
  -H "X-Admin-Key: YOUR_ADMIN_KEY" \
  -H "X-Admin-Id: ops@acme.com"
```

---

### POST /v1/approval/{approval_id}/deny

Deny a pending tool call. The tool is not executed.

**Authentication:** Admin Key

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `approval_id` | string | Approval identifier |

**Response 200**

```json
{
  "approval_id": "appr-12345",
  "status": "denied",
  "resolved_by": "admin@acme.com",
  "resolved_at": "2026-04-05T12:15:00+00:00",
  "result": null
}
```

**Error Responses**

| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid admin key |
| 404 | Approval ID not found |
| 409 | Approval is not in `"pending"` state |
| 503 | ApprovalService not available |

**Example**

```bash
curl -X POST http://localhost:8081/v1/approval/appr-12345/deny \
  -H "X-Admin-Key: YOUR_ADMIN_KEY" \
  -H "X-Admin-Id: ops@acme.com"
```

---

## 5. Schedules

CRUD for recurring scheduled tool calls. Each schedule fires tool calls through the same policy pipeline as `/v1/tools/call`. Exactly one of `cron_expr` or `interval_seconds` must be provided.

### POST /v1/schedules

Create a new recurring scheduled tool call.

**Authentication:** API Key (Bearer token)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agent_id` | string | Yes | Agent identifier |
| `tenant_id` | string | Yes | Tenant identifier |
| `plugin_name` | string | Yes | Target plugin |
| `tool_name` | string | Yes | Target tool |
| `arguments` | object | No | Tool arguments |
| `cron_expr` | string | No* | Cron expression (e.g. `"0 */6 * * *"`) |
| `interval_seconds` | int | No* | Fixed interval in seconds |
| `enabled` | bool | No | Start enabled (default `true`) |

*One of `cron_expr` or `interval_seconds` is required.

```json
{
  "agent_id": "agent-001",
  "tenant_id": "acme-corp",
  "plugin_name": "slack",
  "tool_name": "slack_post_message",
  "arguments": {"channel": "#status", "text": "Heartbeat"},
  "interval_seconds": 3600,
  "enabled": true
}
```

**Response 200**

```json
{
  "schedule_id": "sched-abc123",
  "status": "created",
  "next_run_at": "2026-04-05T13:00:00+00:00"
}
```

**Error Responses**

| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid API key |
| 422 | Neither `cron_expr` nor `interval_seconds` provided |
| 500 | Scheduler engine error |
| 503 | Scheduler not available |

**Example**

```bash
curl -X POST http://localhost:8081/v1/schedules \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agent-001",
    "tenant_id": "acme-corp",
    "plugin_name": "slack",
    "tool_name": "slack_post_message",
    "arguments": {"channel": "#status", "text": "heartbeat"},
    "cron_expr": "0 */6 * * *"
  }'
```

---

### GET /v1/schedules

List all scheduled tool calls.

**Authentication:** API Key (Bearer token)

**Response 200**

```json
{
  "schedules": [
    {
      "id": "sched-abc123",
      "agent_id": "agent-001",
      "tenant_id": "acme-corp",
      "plugin_name": "slack",
      "tool_name": "slack_post_message",
      "arguments": {"channel": "#status", "text": "heartbeat"},
      "cron_expr": "0 */6 * * *",
      "interval_seconds": null,
      "enabled": true,
      "created_at": "2026-04-05T10:00:00+00:00",
      "last_run_at": "2026-04-05T12:00:00+00:00",
      "last_result": {"status": "ok"},
      "run_count": 3,
      "error_count": 0,
      "next_run_at": "2026-04-05T18:00:00+00:00"
    }
  ]
}
```

**Error Responses**

| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid API key |
| 503 | Scheduler not available |

**Example**

```bash
curl http://localhost:8081/v1/schedules \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

### GET /v1/schedules/{schedule_id}

Get details for a specific schedule.

**Authentication:** API Key (Bearer token)

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `schedule_id` | string | Schedule identifier |

**Response 200**

Same schema as a single entry in the `schedules` array above.

**Error Responses**

| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid API key |
| 404 | Schedule not found |
| 503 | Scheduler not available |

**Example**

```bash
curl http://localhost:8081/v1/schedules/sched-abc123 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

### DELETE /v1/schedules/{schedule_id}

Delete a scheduled tool call permanently.

**Authentication:** API Key (Bearer token)

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `schedule_id` | string | Schedule identifier |

**Response 200**

```json
{
  "schedule_id": "sched-abc123",
  "status": "deleted"
}
```

**Error Responses**

| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid API key |
| 404 | Schedule not found |
| 503 | Scheduler not available |

**Example**

```bash
curl -X DELETE http://localhost:8081/v1/schedules/sched-abc123 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

### POST /v1/schedules/{schedule_id}/pause

Pause a schedule. The definition is retained but no further executions occur until resumed.

**Authentication:** API Key (Bearer token)

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `schedule_id` | string | Schedule identifier |

**Response 200**

```json
{
  "schedule_id": "sched-abc123",
  "status": "paused"
}
```

**Error Responses**

| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid API key |
| 404 | Schedule not found |
| 503 | Scheduler not available |

**Example**

```bash
curl -X POST http://localhost:8081/v1/schedules/sched-abc123/pause \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

### POST /v1/schedules/{schedule_id}/resume

Resume a paused schedule.

**Authentication:** API Key (Bearer token)

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `schedule_id` | string | Schedule identifier |

**Response 200**

```json
{
  "schedule_id": "sched-abc123",
  "status": "resumed"
}
```

**Error Responses**

| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid API key |
| 404 | Schedule not found |
| 503 | Scheduler not available |

**Example**

```bash
curl -X POST http://localhost:8081/v1/schedules/sched-abc123/resume \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## 6. Compliance

Compliance endpoints map audit log events to regulatory framework controls and generate gap analysis reports. No authentication is required (these endpoints read audit data only).

### GET /v1/compliance/frameworks

List all supported compliance frameworks.

**Authentication:** None

**Response 200**

```json
{
  "frameworks": [
    {
      "framework": "soc2",
      "display_name": "SOC2",
      "control_count": 8,
      "controls": ["CC6.1", "CC6.2", "CC6.3", "CC7.1", "CC7.2", "CC8.1", "CC9.1", "CC9.2"]
    },
    {
      "framework": "nist_ai_rmf",
      "display_name": "NIST AI RMF",
      "control_count": 5,
      "controls": ["MAP-1", "MAP-2", "MEASURE-1", "MANAGE-1", "GOVERN-1"]
    },
    {
      "framework": "eu_ai_act",
      "display_name": "EU AI ACT",
      "control_count": 4,
      "controls": ["AIA-9", "AIA-13", "AIA-14", "AIA-17"]
    }
  ]
}
```

**Example**

```bash
curl http://localhost:8081/v1/compliance/frameworks
```

---

### GET /v1/compliance/controls

List all controls for a specific compliance framework.

**Authentication:** None

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `framework` | string | Yes | Framework key: `soc2`, `nist_ai_rmf`, `eu_ai_act` |

**Response 200**

```json
{
  "framework": "soc2",
  "control_count": 8,
  "controls": [
    {
      "id": "CC6.1",
      "name": "Logical and Physical Access Controls",
      "framework": "soc2",
      "description": "The entity implements logical access security...",
      "evidence_criteria": "policy_enforcement"
    }
  ]
}
```

**Error Responses**

| Status | Meaning |
|--------|---------|
| 404 | Unknown framework key |

**Example**

```bash
curl "http://localhost:8081/v1/compliance/controls?framework=soc2"
```

---

### GET /v1/compliance/report

Generate a compliance report for a framework and time period. Queries audit logs, maps events to controls, and produces per-control status (satisfied / partial / gap).

**Authentication:** None

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `framework` | string | Yes | Framework key |
| `start` | string | Yes | Period start, ISO-8601 (e.g. `2026-04-01` or `2026-04-01T00:00:00Z`) |
| `end` | string | Yes | Period end, ISO-8601 |
| `tenant_id` | string | No | Filter by tenant |

**Response 200**

```json
{
  "framework": "soc2",
  "generated_at": "2026-04-05T12:00:00+00:00",
  "tenant_id": "acme-corp",
  "period_start": "2026-04-01T00:00:00+00:00",
  "period_end": "2026-04-05T00:00:00+00:00",
  "total_events": 1247,
  "controls_satisfied": 6,
  "controls_partial": 1,
  "controls_gap": 1,
  "summary": "6 of 8 controls satisfied",
  "mappings": [
    {
      "framework": "soc2",
      "control_id": "CC6.1",
      "control_name": "Logical and Physical Access Controls",
      "evidence_type": "policy_enforcement",
      "status": "satisfied",
      "notes": "All tool calls evaluated against Cedar policies"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `total_events` | int | Audit events in the period |
| `controls_satisfied` | int | Controls fully met |
| `controls_partial` | int | Controls partially met |
| `controls_gap` | int | Controls with no evidence |
| `mappings` | array | Per-control detail |
| `mappings[].status` | string | `"satisfied"`, `"partial"`, or `"gap"` |

**Error Responses**

| Status | Meaning |
|--------|---------|
| 400 | Invalid datetime format |
| 404 | Unknown framework key |

**Example**

```bash
curl "http://localhost:8081/v1/compliance/report?framework=soc2&start=2026-04-01&end=2026-04-05&tenant_id=acme-corp"
```

---

### GET /v1/compliance/gaps

List controls with gaps or partial compliance. This is the auditor's shortcut -- shows only what needs attention.

**Authentication:** None

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `framework` | string | Yes | Framework key |
| `start` | string | No | Period start, ISO-8601 (defaults to 30 days ago) |
| `end` | string | No | Period end, ISO-8601 (defaults to now) |
| `tenant_id` | string | No | Filter by tenant |

**Response 200**

```json
{
  "framework": "soc2",
  "period_start": "2026-03-06T12:00:00+00:00",
  "period_end": "2026-04-05T12:00:00+00:00",
  "total_controls": 8,
  "gaps": [
    {
      "control_id": "CC9.2",
      "control_name": "Risk Mitigation",
      "evidence_type": "risk_assessment",
      "status": "gap",
      "notes": "No risk scoring events found in period"
    }
  ],
  "partial": [
    {
      "control_id": "CC7.2",
      "control_name": "System Monitoring",
      "evidence_type": "behavioral_analysis",
      "status": "partial",
      "notes": "Behavioral analysis active but no alerts triggered"
    }
  ]
}
```

**Error Responses**

| Status | Meaning |
|--------|---------|
| 400 | Invalid datetime format |
| 404 | Unknown framework key |

**Example**

```bash
curl "http://localhost:8081/v1/compliance/gaps?framework=soc2&tenant_id=acme-corp"
```

---

## Common Error Response Format

All error responses follow the FastAPI default structure:

```json
{
  "detail": "Human-readable error message"
}
```

For validation errors (422), the detail may be an object:

```json
{
  "detail": {
    "validation_errors": [
      "Missing required argument: channel",
      "Argument 'count' expected type 'integer', got 'str'"
    ]
  }
}
```

## Rate Limiting

The App Proxy tracks per-agent, per-plugin call counts via the internal `RateCounter`. These counts are passed into Cedar policy evaluation as `context.rate_count` (rolling 1-hour window). Rate limits are enforced by Cedar policies, not the proxy itself -- configure them in your `.cedar` files.

# Tiresias App Proxy

## Product Overview

Tiresias App Proxy is a governance layer for AI agent actions. It intercepts every tool call an AI agent makes, evaluates it against Cedar authorization policies, scores its risk across six contextual factors, checks for cross-tool behavioral threat patterns, and either dispatches the call to the target MCP plugin, queues it for human approval, or denies it. Every decision is recorded in an immutable audit trail with compliance mappings to SOC 2, NIST AI RMF, and the EU AI Act. The product is designed for security-conscious enterprises that deploy AI agents in production and need verifiable control over what those agents can do.

## Key Capabilities

- **Cedar policy engine** -- Sub-millisecond authorization via [cedarpy](https://github.com/cedar-policy/cedar-python). Thread-safe, hot-reloadable from disk every 30 seconds (configurable). Entity model: `Tiresias::Agent`, `Tiresias::Plugin`, `Tiresias::Tenant`. Strict or advisory enforcement modes.
- **Plugin SDK with MCP-native manifest** -- Abstract base class (`TiresiasPlugin`) for building plugins. Each plugin declares tools, capabilities, and required secrets. Manifests follow the `tiresias.plugin.json` schema. Supports stdio, HTTP, and Wasm transports.
- **Risk scoring (0--100, 6 factors)** -- Contextual risk assessment runs before Cedar evaluation. Factors: tool destructiveness (weight 30), external exposure (25), sensitive data / PII detection (20), off-hours operation (10), blast radius (10), new agent (5). Scores map to levels: low (0--25), medium (26--50), high (51--75), critical (76--100).
- **Cross-tool behavioral analysis (5 threat patterns)** -- Sliding-window analyzer detects: data exfiltration (read then external send), privilege escalation (new agent using admin tools), rapid destructive operations (3+ deletes in 2 minutes), reconnaissance (5+ reads in 60 seconds), and approval circumvention (3+ retries after denial). Critical patterns auto-deny in strict mode.
- **Human-in-the-loop approval queue** -- DB-backed (SQLAlchemy + async SQLite/Postgres). Configurable TTL with automatic expiry sweeper. Deduplication by call ID. Webhook notifications on status change. Admin approve/deny endpoints with audit linkage. Approved calls are dispatched to the plugin and results recorded.
- **Cron/interval scheduled tool calls** -- APScheduler-backed engine supports cron expressions and fixed-interval triggers. Every scheduled execution passes through Cedar policy evaluation and audit logging. Schedules are persisted to the database and survive restarts. CRUD + pause/resume API.
- **Wasm sandbox for untrusted plugins** -- Capability-based host function injection via Wasmtime. Plugins declare capability tokens (e.g., `slack:read`, `http:fetch`); only declared capabilities are linked. Undeclared imports fail at instantiation, enforcing a hard security boundary.
- **Compliance mapping (SOC 2, NIST AI RMF, EU AI Act -- 17 controls)** -- Maps audit events to framework controls with per-control status (satisfied / partial / gap). Generate reports over arbitrary time ranges. Gap analysis endpoint surfaces only what needs attention.
- **21 REST API endpoints** -- Grouped into Tools, Admin, Approval, Schedules, and Compliance. Bearer token auth for tool endpoints, admin key auth for privileged operations.

## Quick Start

### Run with Docker

```bash
docker build -t tiresias-app-proxy .
docker run -d \
  --name app-proxy \
  -p 8081:8081 \
  -e APP_PROXY_API_KEY_HASH="<sha256-hex-of-your-api-key>" \
  -e APP_PROXY_ADMIN_KEY="<your-admin-key>" \
  tiresias-app-proxy
```

### Health Check

```bash
curl http://localhost:8081/health
```

Expected response:

```json
{
  "status": "ok",
  "plugins": 2,
  "policy_enforcement": "strict"
}
```

### First API Call -- List Available Tools

```bash
curl -X POST http://localhost:8081/v1/tools/list \
  -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "my-agent", "tenant_id": "my-tenant"}'
```

### Dispatch a Tool Call

```bash
curl -X POST http://localhost:8081/v1/tools/call \
  -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "slack_post_message",
    "arguments": {"channel": "#general", "text": "Hello from my agent"},
    "agent_id": "my-agent",
    "tenant_id": "my-tenant"
  }'
```

The response will be one of: `ToolCallSuccess` (dispatched and executed), `ToolCallDenied` (blocked by policy, risk, or behavioral analysis), or `ToolCallPending` (queued for human approval).

## Architecture

```
                          Tiresias App Proxy
 +-----------------------------------------------------------------+
 |                                                                   |
 |  Agent Request                                                    |
 |       |                                                           |
 |       v                                                           |
 |  [Auth Middleware] --- Bearer token or admin key verification      |
 |       |                                                           |
 |       v                                                           |
 |  [Risk Scorer] --- 6-factor contextual risk (0-100)               |
 |       |                                                           |
 |       v                                                           |
 |  [Behavioral Analyzer] --- 5 threat pattern checks                |
 |       |                                                           |
 |       v                                                           |
 |  [Cedar Policy Engine] --- cedarpy authorization eval             |
 |       |                                                           |
 |       +-----> DENY -----> [Audit Logger] ---> Response (denied)   |
 |       |                                                           |
 |       +-----> APPROVE ---> [Approval Queue] ---> Webhook          |
 |       |                         |                                 |
 |       |                    Human approves                         |
 |       |                         |                                 |
 |       v                         v                                 |
 |  [MCP Dispatch] --- stdio / HTTP / Wasm transport                 |
 |       |                                                           |
 |       v                                                           |
 |  [Audit Logger] --- Immutable DB record with hashed args          |
 |       |                                                           |
 |       v                                                           |
 |  Response (success + behavioral alerts)                           |
 |                                                                   |
 +-----------------------------------------------------------------+
```

Every path through the system produces an audit record. Arguments are SHA-256 hashed before storage -- plaintext is never persisted.

## Configuration

All settings are controlled via environment variables prefixed with `APP_PROXY_`. A `.env` file in the working directory is also read.

| Variable | Type | Default | Description |
|---|---|---|---|
| `APP_PROXY_TENANT_ID` | UUID | Auto-generated | Unique tenant identifier for multi-tenant isolation. |
| `APP_PROXY_PROXY_PORT` | int | `8081` | Port the App Proxy listens on. |
| `APP_PROXY_DATABASE_URL` | str | `sqlite+aiosqlite:///app_proxy.db` | Async SQLAlchemy database URL. Supports SQLite and PostgreSQL. |
| `APP_PROXY_PLUGINS_DIR` | path | `plugins` | Directory containing MCP plugin manifests. |
| `APP_PROXY_POLICIES_DIR` | path | `policies/cedar` | Directory containing `.cedar` policy files. |
| `APP_PROXY_CEDAR_SCHEMA_PATH` | path | `src/app_proxy/policy/schema.json` | Path to the Cedar schema definition. |
| `APP_PROXY_MCP_SERVER_TIMEOUT_SECONDS` | int | `30` | Seconds before an MCP server call is timed out. |
| `APP_PROXY_POLICY_ENFORCEMENT_MODE` | str | `strict` | `strict` denies actions that fail policy; `advisory` logs but permits. |
| `APP_PROXY_API_KEY_HASH` | str | `None` | SHA-256 hash of the bearer API key (hex-encoded). When unset, dev mode allows all requests. |
| `APP_PROXY_ADMIN_KEY` | str | `None` | Admin key for privileged operations. When unset, admin endpoints are open (dev mode). |
| `APP_PROXY_RETENTION_DAYS` | int | `30` | Number of days to retain audit logs. |
| `APP_PROXY_ENABLE_APPROVAL_QUEUE` | bool | `true` | Whether high-risk actions require human approval. |
| `APP_PROXY_APPROVAL_TIMEOUT_MINUTES` | int | `30` | Minutes before a pending approval auto-denies. |
| `APP_PROXY_APPROVAL_NOTIFY_URL` | str | `None` | Webhook URL for approval status notifications (POST). |
| `APP_PROXY_APPROVAL_SWEEPER_INTERVAL_SECONDS` | int | `300` | Seconds between approval sweeper runs for expiring stale requests. |

## API Reference

### Tools

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/v1/tools/list` | Bearer | List all available tools across all healthy plugins. |
| POST | `/v1/tools/call` | Bearer | Dispatch a tool call through risk scoring, Cedar policy, behavioral analysis, and MCP dispatch. Returns `success`, `denied`, or `pending_approval`. |

### Admin

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/v1/admin/plugins` | Admin | List all registered plugins with health status, version, and tool count. |
| POST | `/v1/admin/policies/reload` | Admin | Force a Cedar policy reload from disk. Validates before applying. |
| POST | `/v1/admin/policies/validate` | Admin | Validate current Cedar policies and return any errors. |
| POST | `/v1/admin/plugins/health` | Admin | Trigger an immediate health check across all plugins. |

### Approval

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/v1/approval` | Admin | List approval records with optional status and tenant filters. |
| GET | `/v1/approval/{id}` | None | Check the current status of an approval request by ID. |
| POST | `/v1/approval/{id}/approve` | Admin | Approve a pending tool call. Dispatches to plugin and records result. |
| POST | `/v1/approval/{id}/deny` | Admin | Deny a pending tool call. Records denial in audit log. |

### Schedules

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/v1/schedules` | Bearer | Create a new recurring scheduled tool call (cron or interval). |
| GET | `/v1/schedules` | Bearer | List all scheduled tool calls with next-run time. |
| GET | `/v1/schedules/{id}` | Bearer | Get details for a specific schedule including run history. |
| DELETE | `/v1/schedules/{id}` | Bearer | Delete a scheduled tool call. |
| POST | `/v1/schedules/{id}/pause` | Bearer | Pause a schedule (keeps definition, stops triggering). |
| POST | `/v1/schedules/{id}/resume` | Bearer | Resume a paused schedule. |

### Compliance

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/v1/compliance/frameworks` | None | List supported compliance frameworks with control counts. |
| GET | `/v1/compliance/controls` | None | List all controls for a specific framework. |
| GET | `/v1/compliance/report` | None | Generate a compliance report for a framework and time period. Queries audit logs and maps to controls. |
| GET | `/v1/compliance/gaps` | None | List controls with gaps or partial compliance. Auditor shortcut. |

### System

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | Health check returning status, plugin count, and enforcement mode. |

## Plugins

### Registered Plugins

The proxy ships with two reference plugins:

- **slack** -- Slack relay plugin (stdio transport). Reads and posts messages via the Slack API.
- **echo_wasm** -- Echo plugin running in a Wasm sandbox. Demonstrates the Wasm transport path.

### Adding a New Plugin

1. Create a directory under `plugins/` (e.g., `plugins/my-plugin/`).
2. Add a `config.yaml` with the plugin manifest:

```yaml
name: my-plugin
version: "0.1.0"
mcp_server_type: stdio          # or "http" or "wasm"
mcp_server_command: ["python", "-m", "my_plugin"]
tools:
  - name: my_tool
    description: "What it does"
    inputSchema:
      type: object
      properties:
        param1:
          type: string
      required: [param1]
    annotations:
      destructiveHint: false
```

3. Optionally, use the Plugin SDK (`app_proxy.sdk.base.TiresiasPlugin`) to build a typed plugin with lifecycle hooks.
4. Generate a manifest with `app_proxy.sdk.manifest.generate_manifest()`.
5. Restart the proxy or call `POST /v1/admin/policies/reload` to pick up new plugins.

For the full plugin development guide, see [docs/plugin-development.md](docs/plugin-development.md).

## Compliance

### Supported Frameworks

| Framework | Key | Controls | Coverage |
|---|---|---|---|
| SOC 2 Type II | `soc2` | 7 | CC6.1, CC6.2, CC6.3, CC6.6, CC7.1, CC7.2, CC8.1 |
| NIST AI RMF 1.0 | `nist_ai_rmf` | 6 | MAP 1.1, MAP 1.5, MEASURE 2.6, MANAGE 1.1, MANAGE 2.2, GOVERN 1.1 |
| EU AI Act | `eu_ai_act` | 4 | Art 14.1, 14.2, 14.3, 14.4 |

### Generating a Report

```bash
curl "http://localhost:8081/v1/compliance/report?framework=soc2&start=2026-01-01&end=2026-04-01"
```

The report returns per-control status (`satisfied`, `partial`, `gap`), evidence mappings, and a summary. Use the `/v1/compliance/gaps` endpoint to surface only controls that need remediation.

## Security

### Authentication Model

The proxy supports two authentication mechanisms:

- **Bearer token** (tool endpoints) -- API key verified against a pre-configured SHA-256 hash (`APP_PROXY_API_KEY_HASH`). Constant-time comparison via `hmac.compare_digest` to prevent timing attacks. When no hash is configured, the proxy runs in dev mode (all requests pass).
- **Admin key** (admin and approval endpoints) -- Separate credential via the `X-Admin-Key` header (`APP_PROXY_ADMIN_KEY`). Used for policy management, plugin administration, and approval decisions.

### Data Protection

- **Arguments are never stored in plaintext.** All tool-call arguments are SHA-256 hashed before persistence. The audit log stores only the hash.
- **Results are hashed.** Execution results are stored as SHA-256 digests.
- **Approval queue arguments are encrypted.** Original arguments for pending approvals are stored encrypted for re-dispatch after approval.
- **Soft deletes.** Audit records use a `deleted_at` timestamp rather than physical deletion, preserving the audit trail.

### Audit Trail

Every tool-call attempt produces an immutable `AppProxyAuditLog` record containing:

- Tenant ID, agent ID, plugin name, tool name
- Call ID (UUID, unique per request)
- Arguments hash (SHA-256)
- Policy decision and reason
- Approval ID, status, and timestamp (when applicable)
- Execution status, result hash, error message
- Latency breakdown (dispatch, plugin, total) in milliseconds
- Session ID for correlation
- Created-at timestamp (server-generated, indexed)

Records are indexed by tenant + created_at for efficient time-range queries in compliance reporting.

### Rate Limiting

In-memory sliding-window rate counter tracks per-agent, per-plugin call counts over a 1-hour window. Rate counts are passed into Cedar policy context, allowing policies to enforce rate limits declaratively.

## License

Proprietary. Copyright 2026 Saluca LLC. All rights reserved.

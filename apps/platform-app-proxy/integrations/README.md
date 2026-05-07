# Tiresias App Proxy -- Integration Guide

The App Proxy is the governance layer between AI agents and external systems.
Every tool call passes through Cedar policy evaluation, audit logging, risk
scoring, and rate limiting before reaching the target plugin (Slack, GitHub,
file system, etc.).

Any system that speaks HTTP or MCP can connect.

## Architecture

```
+-----------------+     +-----------------+     +------------------+
|   PicoClaw      |     |   MiroShark     |     |   Claude Code    |
|   (Go agent)    |     |   (Py pipeline) |     |   (CLI harness)  |
+--------+--------+     +--------+--------+     +--------+---------+
         |                       |                       |
         |  POST /tools/call     |  POST /tools/call     |  MCP stdio / HTTP
         |                       |                       |
         +----------+------------+-----------+-----------+
                    |                        |
           +--------v------------------------v--------+
           |           Tiresias App Proxy              |
           |           (FastAPI :8081)                  |
           |                                           |
           |  1. Auth + tenant resolution              |
           |  2. Cedar policy evaluation               |
           |  3. Risk scoring + behavioral analysis    |
           |  4. Rate limiting                         |
           |  5. Plugin dispatch (Slack, GH, FS, ...)  |
           |  6. Audit logging                         |
           +--------+---------+----------+-------------+
                    |         |          |
           +--------v--+ +----v----+ +---v-----------+
           | Slack API  | | GitHub  | | Other plugins |
           | (Socket    | | API     | | (filesystem,  |
           |  Mode +    | |         | |  Linear, ...) |
           |  Web API)  | |         | |               |
           +-----------+ +---------+ +---------------+
```

## Integration Paths

### 1. PicoClaw (Go agent runtime)

PicoClaw connects to the App Proxy over HTTP within the Docker network.
Set the environment variable to switch from direct Slack access to
proxy-governed access:

```
APP_PROXY_URL=http://app-proxy:8081
APP_PROXY_AGENT_ID=alfred
APP_PROXY_TENANT_ID=saluca
```

PicoClaw calls `POST /tools/call` with a JSON body:

```json
{
  "tool": "slack_send_message",
  "arguments": {
    "channel": "C0APMH39WSY",
    "text": "Hello from Alfred"
  },
  "agent_id": "alfred",
  "tenant_id": "saluca"
}
```

The App Proxy evaluates the Cedar policy, checks rate limits, dispatches to
the Slack plugin, logs the action, and returns the result.

See `docker-compose.full.yml` for the full PicoClaw + App Proxy stack.

### 2. MiroShark (Python pipeline)

MiroShark connects via a Python HTTP client. Example:

```python
import httpx

proxy = httpx.AsyncClient(base_url="http://app-proxy:8081")

resp = await proxy.post("/tools/call", json={
    "tool": "slack_read_messages",
    "arguments": {"channel": "C0APMH39WSY", "limit": 5},
    "agent_id": "miroshark",
    "tenant_id": "saluca",
})
messages = resp.json()
```

### 3. Claude Code (CLI harness)

Claude Code sessions on the Saluca tailnet can reach the App Proxy directly
or via the MCP Gateway. Two options:

**Direct HTTP:**

```bash
curl -s http://app-proxy.saluca.local:8081/tools/call \
  -H "Content-Type: application/json" \
  -d '{"tool":"slack_list_channels","arguments":{},"agent_id":"claude-code","tenant_id":"saluca"}'
```

**MCP stdio:** The App Proxy can also be started as an MCP stdio server
(see `plugins/slack/config.yaml` for the command). The MCP Gateway proxies
this to any Claude Code session on the tailnet.

### 4. Any MCP Client

The App Proxy exposes a standard MCP tool interface. Any MCP-compatible
client can connect:

- **stdio mode:** Launch the proxy as a subprocess and communicate over
  stdin/stdout using the MCP JSON-RPC protocol.
- **HTTP+SSE mode:** Connect to the `/mcp` endpoint (when enabled) for
  server-sent-event streaming.

### 5. Custom Agents (REST API)

Any agent that can make HTTP requests can use the App Proxy. The contract:

```
POST /tools/call
Content-Type: application/json

{
  "tool": "<plugin>_<action>",
  "arguments": { ... },
  "agent_id": "<your-agent-id>",
  "tenant_id": "<your-tenant-id>"
}
```

Response:

```json
{
  "content": [{"type": "text", "text": "..."}],
  "is_error": false
}
```

Administrative endpoints:

| Endpoint                | Method | Description                        |
|-------------------------|--------|------------------------------------|
| `/health`               | GET    | Health check + plugin count        |
| `/tools/list`           | GET    | List all available tools           |
| `/tools/call`           | POST   | Execute a tool through governance  |
| `/admin/plugins`        | GET    | Plugin status and health           |
| `/admin/audit`          | GET    | Query audit log                    |
| `/approval/pending`     | GET    | List pending approval requests     |
| `/approval/{id}/decide` | POST   | Approve or deny a pending action   |
| `/schedules`            | GET    | List scheduled tool calls          |

## Slack Relay Daemon

The Slack plugin includes a Socket Mode relay daemon that maintains a
persistent websocket connection to Slack. Events are buffered in-memory
(with optional SQLite persistence) and delivered to agents via
`slack_poll_events` / `slack_ack_event`.

The relay starts automatically when the App Proxy starts, provided
`SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` are set in the environment.

Required Slack app scopes (Saluca Labs app):
- `channels:read`, `channels:join`, `groups:read`
- `chat:write`, `reactions:write`, `files:read`, `files:write`
- Socket Mode enabled with `connections:write`

## Environment Variables

| Variable                             | Required | Description                          |
|--------------------------------------|----------|--------------------------------------|
| `SLACK_BOT_TOKEN`                    | Yes      | Slack bot OAuth token (xoxb-...)     |
| `SLACK_APP_TOKEN`                    | Yes      | Slack app-level token (xapp-...)     |
| `APP_PROXY_DATABASE_URL`             | Yes      | SQLAlchemy async DB URL              |
| `APP_PROXY_POLICIES_DIR`             | Yes      | Path to Cedar policy files           |
| `APP_PROXY_CEDAR_SCHEMA_PATH`        | Yes      | Path to Cedar schema JSON            |
| `APP_PROXY_POLICY_ENFORCEMENT_MODE`  | No       | `strict` (default) or `permissive`   |

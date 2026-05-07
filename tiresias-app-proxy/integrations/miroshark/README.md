# MiroShark - Tiresias App Proxy Integration

Route MiroShark's simulated agent actions through the Tiresias App Proxy
so that every post, reaction, and read is governed by Cedar policy, risk
scoring, optional human approval, and a full audit trail.

## How to Enable

Set these variables in MiroShark's `.env` (project root):

```env
TIRESIAS_ENABLED=true
APP_PROXY_URL=http://app-proxy.saluca.local:8400
APP_PROXY_API_KEY=sk-...           # optional — required when proxy auth is on
```

When `TIRESIAS_ENABLED` is `false` (the default), MiroShark executes
actions directly and the App Proxy is not involved.

## Using TiresiasActionClient

The client is an async drop-in replacement for MiroShark's direct action
executor. Import it and wire it into your simulation loop:

```python
from integrations.miroshark.client import TiresiasActionClient

client = TiresiasActionClient(
    app_proxy_url="http://app-proxy.saluca.local:8400",
    api_key="sk-...",
)

# Post a message as a simulated agent
result = await client.post_message(
    agent_id="analyst-a",
    channel="#threat-intel",
    text="New IOC observed: 198.51.100.42",
)

# React to a message
await client.add_reaction(
    agent_id="soc-lead-a",
    channel="#threat-intel",
    timestamp="1714000000.000100",
    emoji="eyes",
)

# Read recent messages
messages = await client.read_messages(
    agent_id="analyst-a",
    channel="#threat-intel",
    limit=20,
)

# Clean up when done
await client.close()
```

The client also works as an async context manager:

```python
async with TiresiasActionClient(app_proxy_url=url) as client:
    await client.post_message("analyst-a", "#general", "Hello from MiroShark")
```

## What Gets Enforced

When actions route through the App Proxy, every tool call passes through
the full Tiresias governance pipeline:

| Layer           | What it does                                                  |
|-----------------|---------------------------------------------------------------|
| Cedar policy    | Evaluates allow/deny rules per agent, tool, channel, tenant   |
| Risk scoring    | Assigns a numeric risk score to the action                    |
| Approval queue  | High-risk actions are held for human review before executing  |
| Audit trail     | Every action (allowed, denied, queued) is logged immutably    |

Actions that MiroShark maps to `DO_NOTHING` (follows, mutes, searches)
are skipped client-side and never hit the proxy.

## Architecture

```
MiroShark simulation loop
  -> TiresiasActionClient.post_message()
    -> POST /v1/tools/call  (App Proxy)
      -> Cedar policy evaluation
      -> Risk scoring
      -> Approval queue (if high risk)
      -> MCP tool execution (slack_send_rich_message, etc.)
      -> Audit log entry
    <- JSON result
  <- result dict back to simulation
```

## Mapping from OASIS Actions

MiroShark uses OASIS-style action types internally. The existing
`tiresias_client.py` in MiroShark's backend maps these to Tiresias
action types. The App Proxy client maps them to MCP tool names:

| OASIS Action     | MCP Tool                    |
|------------------|-----------------------------|
| CREATE_POST      | `slack_send_rich_message`   |
| REPLY            | `slack_send_rich_message`   |
| LIKE_POST        | `slack_add_reaction`        |
| CREATE_COMMENT   | `slack_send_rich_message`   |
| DO_NOTHING       | (skipped, no proxy call)    |

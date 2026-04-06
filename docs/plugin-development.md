# Tiresias App Proxy -- Plugin Development Guide

## Table of Contents

1. [Overview](#1-overview)
2. [Quick Start](#2-quick-start)
3. [SDK Reference](#3-sdk-reference)
4. [Plugin Config (config.yaml)](#4-plugin-config-configyaml)
5. [Tool Manifest (manifest.json)](#5-tool-manifest-manifestjson)
6. [MCP Adapter](#6-mcp-adapter)
7. [Transport Modes](#7-transport-modes)
8. [Policy Integration](#8-policy-integration)
9. [Testing Your Plugin](#9-testing-your-plugin)
10. [Distribution](#10-distribution)
11. [Security](#11-security)
12. [Reference Implementation -- Slack Plugin](#12-reference-implementation----slack-plugin)

---

## 1. Overview

A **Tiresias plugin** extends the App Proxy with new tools that AI agents can call. Each plugin:

- Declares one or more **tools** with MCP-compatible JSON Schema inputs.
- Declares **capabilities** it requires (e.g., `slack:read`, `github:write`).
- Declares **secrets** it needs at runtime (e.g., API tokens).
- Runs as an **out-of-process MCP server** (stdio), an **HTTP service**, or a **Wasm module**.

The App Proxy handles discovery, secret injection, policy enforcement (Cedar), audit logging, and transport. Your plugin focuses on business logic.

### Architecture

```
  AI Agent
    |
    v
  Tiresias App Proxy
    |--- Cedar Policy Engine (authorization)
    |--- Secret Manager (injects credentials)
    |--- Audit Pipeline (structured logs)
    |
    v
  Your Plugin (MCP server)
    |--- Tool A
    |--- Tool B
    |--- Tool C
```

When an agent calls a tool, the proxy:

1. Evaluates Cedar policies against the tool's annotations and the caller's identity.
2. Injects required secrets from the tenant's secret store into the `ToolContext`.
3. Dispatches the call to your plugin over the configured transport (stdio/HTTP/Wasm).
4. Records an audit event with the tool name, caller, tenant, and result status.

---

## 2. Quick Start

Build a "hello world" plugin in five minutes.

### Step 1: Create the directory structure

```
plugins/
  hello/
    __init__.py
    __main__.py
    plugin.py
    config.yaml
```

### Step 2: Write the plugin class

**`plugins/hello/plugin.py`**

```python
from app_proxy.sdk import TiresiasPlugin, ToolDefinition, ToolContext, ToolResult


class HelloPlugin(TiresiasPlugin):
    name = "hello"
    version = "0.1.0"
    description = "A minimal plugin that greets the caller."
    capabilities = ["hello:greet"]
    required_secrets = []  # No secrets needed

    def tools(self) -> list[ToolDefinition]:
        return [
            ToolDefinition(
                name="hello_greet",
                description="Return a greeting for the given name.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Name to greet.",
                        },
                    },
                    "required": ["name"],
                    "additionalProperties": False,
                },
                annotations={
                    "readOnlyHint": True,
                    "tiresias:capability": "hello:greet",
                },
            ),
        ]

    async def call(
        self, tool_name: str, arguments: dict, ctx: ToolContext
    ) -> ToolResult:
        if tool_name == "hello_greet":
            name = arguments["name"]
            ctx.audit.emit("greet", {"name": name})
            return ToolResult.text(f"Hello, {name}!")

        return ToolResult.error(f"Unknown tool: {tool_name}")
```

### Step 3: Add the MCP entry point

**`plugins/hello/__main__.py`**

```python
from app_proxy.sdk import mcp_adapter
from plugins.hello.plugin import HelloPlugin

mcp_adapter.run(HelloPlugin())
```

**`plugins/hello/__init__.py`** -- leave empty or re-export:

```python
from .plugin import HelloPlugin
```

### Step 4: Write the config

**`plugins/hello/config.yaml`**

```yaml
name: hello
version: 0.1.0
description: "A minimal greeting plugin."
capabilities:
  - hello:greet
required_secrets: []
mcp_server:
  type: stdio
  command: ["python", "-m", "plugins.hello"]
  timeout_seconds: 10
policies:
  default_enforcement: strict
  rules:
    - tool: hello_greet
      requires_approval: false
```

### Step 5: Test it

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | python -m plugins.hello
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | python -m plugins.hello
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"hello_greet","arguments":{"name":"World"}}}' | python -m plugins.hello
```

You should see JSON-RPC responses on stdout with your greeting.

### Step 6: Generate the manifest

```python
from app_proxy.sdk import generate_manifest
from plugins.hello.plugin import HelloPlugin
import json

manifest = generate_manifest(HelloPlugin())
print(json.dumps(manifest, indent=2))
```

Save the output as `plugins/hello/manifest.json`.

---

## 3. SDK Reference

All SDK types are importable from `app_proxy.sdk`:

```python
from app_proxy.sdk import (
    TiresiasPlugin,
    ToolDefinition,
    ToolContext,
    ToolResult,
    AuditEmitter,
    generate_manifest,
)
```

### 3.1 TiresiasPlugin (base class)

**Module:** `app_proxy.sdk.base`

Abstract base class. Every plugin must subclass it and define the required class attributes and abstract methods.

#### Required class attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `name` | `str` | Unique plugin identifier (lowercase, hyphens allowed). |
| `version` | `str` | SemVer string (e.g., `"1.0.0"`). |
| `description` | `str` | Human-readable one-liner. |
| `capabilities` | `list[str]` | Capability tokens this plugin requires (e.g., `["slack:read", "slack:post"]`). |

#### Optional class attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `required_secrets` | `list[str]` | `[]` | Secret keys the proxy must inject at runtime (e.g., `["SLACK_BOT_TOKEN"]`). |

#### Abstract methods (must implement)

**`tools() -> list[ToolDefinition]`**

Return the list of tools this plugin exposes. Called during discovery and manifest generation. Must be deterministic -- return the same list every time.

```python
def tools(self) -> list[ToolDefinition]:
    return [
        ToolDefinition(name="my_tool", description="...", inputSchema={...}),
    ]
```

**`async call(tool_name: str, arguments: dict, ctx: ToolContext) -> ToolResult`**

Handle a tool invocation. The proxy calls this when an agent invokes one of your tools.

- `tool_name` -- which tool was called (matches a `name` from `tools()`).
- `arguments` -- parsed JSON arguments matching the tool's `inputSchema`.
- `ctx` -- runtime context with secrets, caller identity, logger, and audit emitter.

Return a `ToolResult`. Never raise exceptions to the caller -- catch them and return `ToolResult.error(...)`.

```python
async def call(self, tool_name: str, arguments: dict, ctx: ToolContext) -> ToolResult:
    if tool_name == "my_tool":
        return ToolResult.text("done")
    return ToolResult.error(f"Unknown tool: {tool_name}")
```

#### Lifecycle hooks (optional overrides)

**`async on_install(ctx: ToolContext) -> None`**

Called once when the plugin is first installed for a tenant. Use it for setup tasks like creating webhook subscriptions or database tables.

**`async on_uninstall(ctx: ToolContext) -> None`**

Called when a tenant removes the plugin. Use it for cleanup (remove webhooks, revoke tokens).

**`async health_check() -> bool`**

Called by the proxy's health monitoring. Returns `True` if the plugin is healthy. Override to add custom checks (e.g., verify API connectivity).

```python
async def health_check(self) -> bool:
    try:
        await self._ping_external_api()
        return True
    except Exception:
        return False
```

### 3.2 ToolDefinition

**Module:** `app_proxy.sdk.types`

Frozen dataclass representing one tool that a plugin exposes. Follows the MCP tool schema.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `str` | Yes | Unique tool name. Convention: `{plugin}_{action}` (e.g., `slack_send_message`). |
| `description` | `str` | Yes | Human-readable description of what the tool does. Agents use this to decide when to call it. |
| `inputSchema` | `dict[str, Any]` | Yes | JSON Schema object describing the tool's parameters. Must have `"type": "object"` at the top level. |
| `annotations` | `dict[str, Any]` | No | Metadata dict for policy hints and MCP annotations (see Section 5). |

#### inputSchema format

Use standard JSON Schema (draft 2020-12). Always set `"additionalProperties": false` to prevent unexpected inputs.

```python
ToolDefinition(
    name="example_search",
    description="Search for items by query.",
    inputSchema={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Search query string.",
            },
            "limit": {
                "type": "integer",
                "description": "Max results to return.",
                "default": 10,
                "minimum": 1,
                "maximum": 100,
            },
        },
        "required": ["query"],
        "additionalProperties": False,
    },
)
```

### 3.3 ToolContext

**Module:** `app_proxy.sdk.types`

Mutable dataclass injected into every `call()` invocation. Provides everything your tool needs from the runtime environment.

| Field | Type | Description |
|-------|------|-------------|
| `secrets` | `dict[str, str]` | Secrets requested via `required_secrets`, injected by the proxy. Keys match what you declared. |
| `caller_agent_id` | `str` | Identity of the AI agent making the call. |
| `caller_tenant_id` | `str` | Tenant that owns the calling agent. Use for multi-tenant logic. |
| `session_id` | `Optional[str]` | Session correlation ID, if available. |
| `logger` | `structlog.stdlib.BoundLogger` | Structured logger. Use for operational logs. |
| `audit` | `AuditEmitter` | Emit audit events for compliance and observability. |

#### Using secrets

Access secrets by key name. Never log or return secret values.

```python
async def call(self, tool_name, arguments, ctx):
    token = ctx.secrets["MY_API_TOKEN"]
    # Use token to call external API
    ...
```

#### Using the logger

```python
async def call(self, tool_name, arguments, ctx):
    ctx.logger.info("processing_request", tool=tool_name, query=arguments.get("query"))
    ...
```

#### Using the audit emitter

Emit structured audit events for actions that should be tracked. The audit pipeline indexes these for alerting and compliance review.

```python
async def call(self, tool_name, arguments, ctx):
    # ... do work ...
    ctx.audit.emit("message_sent", {
        "channel": arguments["channel"],
        "message_length": len(arguments["text"]),
    })
    return ToolResult.text("sent")
```

### 3.4 ToolResult

**Module:** `app_proxy.sdk.types`

Frozen dataclass representing the response from a tool invocation. MCP-compatible.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `content` | `list[dict[str, Any]]` | -- | List of content blocks (e.g., `[{"type": "text", "text": "..."}]`). |
| `is_error` | `bool` | `False` | Whether this result represents an error. |

#### Convenience constructors

**`ToolResult.text(text: str, *, is_error: bool = False) -> ToolResult`**

Create a result with a single text content block. This is what you will use 90% of the time.

```python
return ToolResult.text("Operation completed successfully.")
return ToolResult.text(json.dumps({"items": items}, indent=2))
```

**`ToolResult.error(message: str) -> ToolResult`**

Create an error result. Shorthand for `ToolResult.text(message, is_error=True)`.

```python
return ToolResult.error("Channel not found.")
return ToolResult.error(f"API returned status {resp.status_code}")
```

#### Returning structured data

For structured responses, serialize to JSON and use `ToolResult.text()`:

```python
return ToolResult.text(json.dumps({
    "ok": True,
    "items": results,
    "count": len(results),
}, indent=2))
```

#### Multi-block responses

For advanced use cases, construct the content list directly:

```python
return ToolResult(content=[
    {"type": "text", "text": "Here is the file:"},
    {"type": "text", "text": file_contents},
])
```

### 3.5 AuditEmitter

**Module:** `app_proxy.sdk.types`

Emits structured audit events from plugin code into the proxy's log pipeline.

**`emit(event_type: str, data: dict[str, Any]) -> None`**

- `event_type` -- short identifier for the event (e.g., `"message_sent"`, `"file_uploaded"`, `"reaction_added"`).
- `data` -- arbitrary key-value pairs. Do NOT include secrets or PII unless required for audit compliance.

The emitter automatically attaches `plugin` name and `tenant_id` to every event. You do not need to construct an `AuditEmitter` yourself -- it is provided on the `ToolContext`.

---

## 4. Plugin Config (config.yaml)

Every plugin directory must contain a `config.yaml` that the App Proxy reads during plugin discovery. This is the contract between your plugin and the proxy.

### Full schema

```yaml
# Required: unique plugin identifier
name: my-plugin

# Required: SemVer version
version: 1.0.0

# Required: human-readable description
description: "What this plugin does, in one sentence."

# Required: capability tokens this plugin uses
capabilities:
  - my-plugin:read
  - my-plugin:write

# Optional: secrets the proxy must inject at runtime
required_secrets:
  - MY_API_TOKEN
  - MY_API_SECRET

# Optional: external manifest file for tool definitions
# If omitted, tools must be defined inline under "tools:"
tools_from: manifest.json

# Optional: inline tool definitions (alternative to tools_from)
tools:
  - name: my_tool
    description: "Does something."
    inputSchema:
      type: object
      properties:
        input:
          type: string
      required:
        - input
    annotations:
      tiresias:capability: "my-plugin:read"

# Required: MCP server configuration
mcp_server:
  # Transport type: "stdio", "http", or "wasm"
  type: stdio

  # For stdio: the command to launch the plugin process
  command: ["python", "-m", "plugins.my_plugin"]

  # For http: the base URL of the plugin's HTTP server
  # url: "http://localhost:9100"

  # For wasm: path to the Wasm module
  # wasm_path: plugins/my_plugin/my_plugin.wasm

  # Environment variables passed to the plugin process (stdio only)
  # Use ${SECRET_NAME} syntax to reference secrets
  env:
    MY_API_TOKEN: "${MY_API_TOKEN}"

  # For wasm: capability tokens granted to the sandbox
  # capabilities:
  #   - "my-plugin:read"

  # For wasm: resource limits
  # resource_limits:
  #   memory_pages: 64
  #   fuel: 100000000

  # Max time (seconds) the proxy waits for a tool call to complete
  timeout_seconds: 30

# Optional: policy rules for this plugin's tools
policies:
  # "strict" = deny unless a matching rule allows; "permissive" = allow unless denied
  default_enforcement: strict
  rules:
    - tool: my_read_tool
      requires_approval: false
    - tool: my_write_tool
      requires_approval: false
      rate_limit: "10/hour"
    - tool: my_delete_tool
      requires_approval: true

# Optional: access control (used for Wasm and HTTP plugins)
acl:
  allow_all: true
  # Or restrict to specific tenants:
  # allowed_tenants:
  #   - tenant-abc
  #   - tenant-xyz
```

### Field reference

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Plugin identifier. Must be unique across all installed plugins. |
| `version` | Yes | SemVer version string. |
| `description` | Yes | One-line description. |
| `capabilities` | Yes | List of capability tokens. These map to Cedar policy conditions. |
| `required_secrets` | No | Secret keys the proxy looks up in the tenant's secret store and injects. |
| `tools_from` | No | Path to a `manifest.json` file containing tool definitions. Mutually exclusive with inline `tools:`. |
| `tools` | No | Inline tool definitions. Mutually exclusive with `tools_from:`. |
| `mcp_server` | Yes | Transport and server configuration. See [Transport Modes](#7-transport-modes). |
| `mcp_server.type` | Yes | One of `stdio`, `http`, `wasm`. |
| `mcp_server.command` | stdio | Command to launch the plugin process. |
| `mcp_server.url` | http | Base URL for the HTTP plugin server. |
| `mcp_server.wasm_path` | wasm | Path to the compiled `.wasm` module. |
| `mcp_server.env` | No | Environment variables. Use `${SECRET}` to reference injected secrets. |
| `mcp_server.timeout_seconds` | No | Per-call timeout. Default varies by transport. |
| `mcp_server.resource_limits` | wasm | Memory and fuel limits for Wasm sandboxing. |
| `policies` | No | Per-tool policy rules. See [Policy Integration](#8-policy-integration). |
| `acl` | No | Tenant-level access control for the entire plugin. |

---

## 5. Tool Manifest (manifest.json)

The manifest is a JSON file that describes all of a plugin's tools, capabilities, and secrets. It is consumed by the App Proxy's plugin registry for discovery without instantiating the plugin. You can generate it programmatically (see Section 2, Step 6) or write it by hand.

### Format

```json
{
  "$schema": "https://tiresias.network/schemas/plugin/v1.json",
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "What this plugin does.",
  "capabilities": ["my-plugin:read", "my-plugin:write"],
  "requiredSecrets": ["MY_API_TOKEN"],
  "tools": [
    {
      "name": "my_read_tool",
      "description": "Reads something.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "description": "Item ID." }
        },
        "required": ["id"],
        "additionalProperties": false
      },
      "annotations": {
        "readOnlyHint": true,
        "tiresias:capability": "my-plugin:read",
        "tiresias:approvalRequired": false
      }
    },
    {
      "name": "my_delete_tool",
      "description": "Deletes something.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "description": "Item ID." }
        },
        "required": ["id"],
        "additionalProperties": false
      },
      "annotations": {
        "destructiveHint": true,
        "tiresias:approvalRequired": true,
        "tiresias:capability": "my-plugin:write"
      }
    }
  ]
}
```

### Top-level fields

| Field | Type | Description |
|-------|------|-------------|
| `$schema` | `string` | Schema URL for validation. Always use `https://tiresias.network/schemas/plugin/v1.json`. |
| `name` | `string` | Must match the plugin's `name` attribute. |
| `version` | `string` | Must match the plugin's `version` attribute. |
| `description` | `string` | Must match the plugin's `description` attribute. |
| `capabilities` | `string[]` | All capability tokens the plugin requires. |
| `requiredSecrets` | `string[]` | All secret keys the plugin needs injected. |
| `tools` | `object[]` | Tool definitions (see below). |

### Tool object fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Unique tool name. |
| `description` | `string` | Yes | What the tool does. Agents read this to decide whether to call it. |
| `inputSchema` | `object` | Yes | JSON Schema for the tool's parameters. |
| `annotations` | `object` | No | Policy hints and MCP annotations. |

### Annotations reference

Annotations are key-value pairs attached to each tool. They serve two purposes: MCP protocol hints (how clients should present the tool) and Tiresias policy signals (how the proxy enforces authorization).

#### MCP standard annotations

| Key | Type | Description |
|-----|------|-------------|
| `readOnlyHint` | `bool` | Tool does not modify external state. Clients may auto-approve. |
| `destructiveHint` | `bool` | Tool mutates or deletes external state. Clients may warn the user. |

#### Tiresias-specific annotations

| Key | Type | Description |
|-----|------|-------------|
| `tiresias:capability` | `string` | The capability token required to call this tool. Maps to a Cedar policy condition. |
| `tiresias:approvalRequired` | `bool` | If `true`, the proxy requires human approval before executing. The proxy holds the call until an authorized user approves in the Tiresias portal. |
| `tiresias:adminOnly` | `bool` | If `true`, only tenant administrators can call this tool. |

#### How annotations affect behavior

- A tool with `"destructiveHint": true` and `"tiresias:approvalRequired": true` (like `slack_delete_message`) will be held for human approval AND flagged as destructive in the UI.
- A tool with `"readOnlyHint": true` and `"tiresias:approvalRequired": false` (like `slack_list_channels`) can execute without any approval gate.
- A tool with `"tiresias:adminOnly": true` (like `slack_configure_relay`) is restricted to admin-role callers regardless of other policies.
- `tiresias:capability` maps the tool to a specific capability token. Cedar policies can allow or deny based on whether the agent's role grants that capability.

---

## 6. MCP Adapter

The MCP adapter runs your plugin as a JSON-RPC 2.0 stdio server. This is the standard transport the App Proxy uses to communicate with out-of-process plugins.

### How it works

The adapter:

1. Reads newline-delimited JSON-RPC requests from **stdin**.
2. Dispatches `initialize`, `tools/list`, and `tools/call` methods to your plugin.
3. Writes JSON-RPC responses to **stdout**.
4. Advertises MCP protocol version `2024-11-05`.

### Entry point pattern

Create a `__main__.py` in your plugin package:

```python
from app_proxy.sdk import mcp_adapter
from my_plugin.plugin import MyPlugin

mcp_adapter.run(MyPlugin())
```

`mcp_adapter.run()` blocks until stdin is closed. It calls `asyncio.run()` internally, so you do not need your own event loop.

### Protocol messages

The adapter handles three MCP methods:

**`initialize`** -- returns server info and capabilities:

```json
{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "serverInfo": { "name": "my-plugin", "version": "1.0.0" },
    "capabilities": { "tools": {} }
  }
}
```

**`tools/list`** -- returns all tool definitions:

```json
{"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}
```

**`tools/call`** -- invokes a tool:

```json
{
  "jsonrpc": "2.0", "id": 3,
  "method": "tools/call",
  "params": {
    "name": "hello_greet",
    "arguments": { "name": "World" }
  }
}
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [{ "type": "text", "text": "Hello, World!" }],
    "isError": false
  }
}
```

### Context in stdio mode

When running via the MCP adapter directly (e.g., for local testing), the `ToolContext` is populated with minimal values:

- `secrets` -- empty dict (no secret injection without the proxy)
- `caller_agent_id` -- `"mcp-stdio"`
- `caller_tenant_id` -- `"local"`

In production, the App Proxy populates these fields with real values before dispatching to your plugin.

---

## 7. Transport Modes

The App Proxy supports three transport modes. Choose based on your plugin's needs.

### stdio (recommended default)

The proxy launches your plugin as a child process and communicates over stdin/stdout using newline-delimited JSON-RPC.

**When to use:** Most plugins. This is the simplest model and provides process isolation.

```yaml
mcp_server:
  type: stdio
  command: ["python", "-m", "plugins.my_plugin"]
  env:
    MY_TOKEN: "${MY_TOKEN}"
  timeout_seconds: 30
```

**Pros:**
- Simple to develop and debug.
- Process isolation -- a crash does not affect the proxy.
- Secrets passed via environment variables, not over the network.

**Cons:**
- One process per plugin instance (higher memory for many plugins).
- Not suitable for plugins that need to maintain persistent connections (use HTTP).

### HTTP

The plugin runs as a standalone HTTP server. The proxy sends JSON-RPC requests over HTTP POST.

**When to use:** Plugins that need persistent state (connection pools, WebSocket listeners), need to be scaled independently, or are written in a language other than Python.

```yaml
mcp_server:
  type: http
  url: "http://localhost:9100"
  timeout_seconds: 30
```

**Pros:**
- Plugin manages its own lifecycle (persistent connections, background tasks).
- Can run on a separate host or in a separate container.
- Language-agnostic -- implement the JSON-RPC interface in any language.

**Cons:**
- You manage the HTTP server, TLS, and health checks.
- Secrets must be passed via configuration or a secret manager, not environment injection.

### Wasm (sandboxed)

The plugin is compiled to WebAssembly and runs inside the proxy's Wasm runtime with strict sandboxing.

**When to use:** Untrusted or third-party plugins where you need hard resource limits and capability-based sandboxing.

```yaml
mcp_server:
  type: wasm
  wasm_path: plugins/echo_wasm/echo.wasm
  capabilities:
    - "echo:call"
  resource_limits:
    memory_pages: 64       # 64 * 64KB = 4MB max memory
    fuel: 100000000        # Instruction fuel limit
  timeout_seconds: 10
```

**Pros:**
- Hard sandboxing -- the plugin cannot access the filesystem, network, or host memory.
- Deterministic resource limits (memory pages, instruction fuel).
- Fast cold start.

**Cons:**
- Limited to languages that compile to Wasm (Rust, C, Go, AssemblyScript).
- No direct network access -- must use host-provided imports for API calls.
- More complex development workflow.

### Summary

| | stdio | HTTP | Wasm |
|-|-------|------|------|
| **Language** | Python (SDK) | Any | Rust/C/Go/AS |
| **Isolation** | Process | Network | Sandbox |
| **Secret injection** | Env vars | Manual | Host imports |
| **Persistent state** | No | Yes | No |
| **Resource limits** | OS-level | Manual | Hard (fuel/mem) |
| **Best for** | Most plugins | Stateful services | Untrusted code |

---

## 8. Policy Integration

The App Proxy uses **Cedar** policies to authorize tool calls. Your plugin does not enforce policies itself -- the proxy does that before dispatching to your plugin. However, the annotations you declare on your tools directly affect how policies evaluate.

### How it works

1. An agent calls `slack_delete_message`.
2. The proxy looks up the tool's annotations: `destructiveHint: true`, `tiresias:approvalRequired: true`, `tiresias:capability: "slack:post"`.
3. The proxy evaluates Cedar policies for the agent's principal (identity + role + tenant) against the action (tool call) and resource (the tool + its annotations).
4. If the policy denies the call, the proxy returns an error without ever reaching your plugin.
5. If `tiresias:approvalRequired` is true, the proxy holds the call for human approval.
6. Only after authorization passes does the proxy dispatch to your plugin's `call()` method.

### Annotations that affect policy

| Annotation | Policy effect |
|------------|---------------|
| `tiresias:capability` | The agent must have this capability granted in their role. If missing, the default capability for the plugin applies. |
| `tiresias:approvalRequired` | Triggers the approval workflow. The call is queued until a human approves or denies it. |
| `tiresias:adminOnly` | Restricts the tool to admin-role principals only. |
| `destructiveHint` | Can be referenced in Cedar conditions. Organizations often write policies that require approval for all destructive tools. |
| `readOnlyHint` | Can be referenced in Cedar conditions. Organizations may auto-allow all read-only tools. |

### Example Cedar policy

```cedar
// Allow agents with slack:read capability to use read-only Slack tools
permit(
  principal,
  action == Action::"tools/call",
  resource
)
when {
  resource.annotations["tiresias:capability"] == "slack:read" &&
  resource.annotations["readOnlyHint"] == true &&
  principal.capabilities.contains("slack:read")
};

// Require approval for all destructive tools
forbid(
  principal,
  action == Action::"tools/call",
  resource
)
when {
  resource.annotations["destructiveHint"] == true
}
unless {
  context.approved == true
};
```

### Best practices

- Always set `tiresias:capability` on every tool so policies can be granular.
- Mark tools that create, update, or delete external state with `destructiveHint: true`.
- Set `tiresias:approvalRequired: true` on high-risk tools (delete, transfer, publish).
- Use `tiresias:adminOnly: true` for configuration and management tools.
- Use distinct capability tokens for read vs. write operations (e.g., `github:read` and `github:write`, not just `github`).

---

## 9. Testing Your Plugin

### Local testing with stdin/stdout

The simplest way to test is to pipe JSON-RPC messages to your plugin:

```bash
# Initialize
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  | python -m plugins.my_plugin

# List tools
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | python -m plugins.my_plugin

# Call a tool
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"my_tool","arguments":{"key":"value"}}}' \
  | python -m plugins.my_plugin
```

### Unit testing with pytest

Test your plugin class directly without the MCP adapter:

```python
import pytest
from unittest.mock import MagicMock
from app_proxy.sdk import ToolContext, AuditEmitter
from plugins.hello.plugin import HelloPlugin


@pytest.fixture
def plugin():
    return HelloPlugin()


@pytest.fixture
def ctx():
    """Create a mock ToolContext with no real secrets."""
    logger = MagicMock()
    audit = AuditEmitter(plugin_name="hello", tenant_id="test-tenant", logger=logger)
    return ToolContext(
        secrets={},
        caller_agent_id="test-agent",
        caller_tenant_id="test-tenant",
        session_id="test-session",
        logger=logger,
        audit=audit,
    )


def test_tools_returns_definitions(plugin):
    tools = plugin.tools()
    assert len(tools) >= 1
    assert tools[0].name == "hello_greet"
    assert "name" in tools[0].inputSchema["properties"]


@pytest.mark.asyncio
async def test_greet(plugin, ctx):
    result = await plugin.call("hello_greet", {"name": "Alice"}, ctx)
    assert not result.is_error
    assert result.content[0]["text"] == "Hello, Alice!"


@pytest.mark.asyncio
async def test_unknown_tool(plugin, ctx):
    result = await plugin.call("nonexistent", {}, ctx)
    assert result.is_error
    assert "Unknown tool" in result.content[0]["text"]


def test_health_check(plugin):
    import asyncio
    assert asyncio.run(plugin.health_check()) is True
```

### Mock external API pattern

For plugins that call external APIs (like Slack), mock the HTTP client:

```python
import pytest
from unittest.mock import AsyncMock, patch
from plugins.slack.plugin import SlackPlugin


@pytest.fixture
def slack_ctx():
    from app_proxy.sdk import ToolContext
    return ToolContext(
        secrets={"SLACK_BOT_TOKEN": "xoxb-fake-token", "SLACK_APP_TOKEN": "xapp-fake"},
        caller_agent_id="test-agent",
        caller_tenant_id="test-tenant",
    )


@pytest.mark.asyncio
async def test_list_channels(slack_ctx):
    plugin = SlackPlugin()

    mock_response = {
        "ok": True,
        "channels": [
            {"id": "C123", "name": "general", "is_private": False, "num_members": 10, "topic": {"value": ""}},
        ],
    }

    with patch.object(plugin, "_slack_request", new=AsyncMock(return_value=mock_response)):
        result = await plugin.call("slack_list_channels", {}, slack_ctx)

    assert not result.is_error
    import json
    data = json.loads(result.content[0]["text"])
    assert data[0]["id"] == "C123"
```

### Manifest validation

Verify your generated manifest matches your plugin:

```python
from app_proxy.sdk import generate_manifest
from plugins.hello.plugin import HelloPlugin

manifest = generate_manifest(HelloPlugin())

assert manifest["name"] == "hello"
assert manifest["version"] == "0.1.0"
assert len(manifest["tools"]) == len(HelloPlugin().tools())
for tool in manifest["tools"]:
    assert "name" in tool
    assert "inputSchema" in tool
```

---

## 10. Distribution

### Python package (PyPI)

For Python plugins, package as a standard Python distribution:

```
my-tiresias-plugin/
  pyproject.toml
  src/
    my_plugin/
      __init__.py
      __main__.py
      plugin.py
  config.yaml
  manifest.json
```

**`pyproject.toml`:**

```toml
[project]
name = "tiresias-plugin-my-plugin"
version = "1.0.0"
dependencies = [
    "tiresias-app-proxy-sdk",
    "httpx>=0.27",
]

[project.scripts]
tiresias-my-plugin = "my_plugin.__main__:main"
```

Install with:

```bash
pip install tiresias-plugin-my-plugin
```

### npm package

For TypeScript/JavaScript plugins using the HTTP transport:

```bash
npm pack
npm publish --registry https://your-registry
```

### Tarball

For air-gapped or on-premise deployments:

```bash
tar czf my-plugin-1.0.0.tar.gz \
  plugins/my_plugin/ \
  --exclude='__pycache__' \
  --exclude='*.pyc'
```

Place in the proxy's plugin directory and restart.

### Wasm module

Compile your Rust/C/Go plugin to `.wasm` and distribute the binary alongside its `config.yaml`:

```bash
# Rust example
cargo build --target wasm32-wasi --release
cp target/wasm32-wasi/release/my_plugin.wasm plugins/my_plugin/
```

The `config.yaml` points to the `.wasm` file via `mcp_server.wasm_path`.

### Container image

For HTTP-transport plugins that need their own runtime:

```dockerfile
FROM python:3.12-slim
COPY . /app
WORKDIR /app
RUN pip install -r requirements.txt
EXPOSE 9100
CMD ["python", "-m", "my_plugin.server"]
```

Reference the container's service URL in your `config.yaml`:

```yaml
mcp_server:
  type: http
  url: "http://my-plugin-service:9100"
```

---

## 11. Security

### Secret management

**Never hardcode secrets.** Declare them in `required_secrets` and access them through `ctx.secrets`:

```python
class MyPlugin(TiresiasPlugin):
    required_secrets = ["MY_API_TOKEN", "MY_WEBHOOK_SECRET"]

    async def call(self, tool_name, arguments, ctx):
        token = ctx.secrets["MY_API_TOKEN"]  # Injected by the proxy
        ...
```

**Do not:**
- Log secret values (even at debug level).
- Return secrets in `ToolResult` content.
- Store secrets in the manifest or config files.
- Pass secrets through tool arguments.

The proxy resolves secrets from the tenant's secret store at call time and injects them into the `ToolContext`. In `config.yaml`, the `${SECRET_NAME}` syntax references secrets for environment variable injection in stdio mode.

### Capability declarations

Capabilities follow the principle of least privilege. Declare only what your plugin needs:

```python
# Good: granular capabilities
capabilities = ["jira:read", "jira:create"]

# Bad: overly broad
capabilities = ["jira:admin"]
```

Each tool should declare its specific capability via `tiresias:capability` annotation. This allows organizations to write fine-grained Cedar policies.

### Input validation

The proxy validates arguments against your `inputSchema` before calling your plugin. However, always validate business logic constraints yourself:

```python
async def call(self, tool_name, arguments, ctx):
    channel = arguments["channel"]
    if not channel.startswith("C"):
        return ToolResult.error("Invalid channel ID format.")
    ...
```

### Wasm sandboxing

Wasm plugins run in a capability-restricted sandbox:

- **No filesystem access** -- the plugin cannot read or write host files.
- **No network access** -- all external calls go through host-provided imports.
- **Memory limits** -- capped by `resource_limits.memory_pages` (each page is 64KB).
- **Instruction limits** -- capped by `resource_limits.fuel`. The runtime terminates the plugin if it exhausts its fuel.

```yaml
resource_limits:
  memory_pages: 64        # 4MB max
  fuel: 100000000         # ~100M instructions
```

These limits prevent a plugin from consuming unbounded resources, making Wasm the right choice for untrusted or third-party plugins.

### Rate limiting

Use the `rate_limit` field in `config.yaml` policy rules to prevent abuse:

```yaml
policies:
  rules:
    - tool: my_expensive_tool
      requires_approval: false
      rate_limit: "10/hour"
```

Rate limits are enforced by the proxy per tenant.

---

## 12. Reference Implementation -- Slack Plugin

The Slack plugin (`plugins/slack/`) is the canonical reference implementation. It demonstrates all major patterns: multiple tool categories, external API integration, lazy initialization, relay architecture, and rich annotations.

**Source files:**
- `plugins/slack/plugin.py` -- Plugin class (14 tools, ~890 lines)
- `plugins/slack/config.yaml` -- Plugin config
- `plugins/slack/manifest.json` -- Tool manifest (auto-generated)

### Plugin structure

```python
class SlackPlugin(TiresiasPlugin):
    name = "slack"
    version = "2.0.0"
    description = "Slack integration -- read channels, post messages, manage reactions, relay"
    capabilities = ["slack:read", "slack:post", "slack:react", "slack:relay"]
    required_secrets = ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN"]
```

Four capability tokens cover the full surface area. Two secrets are required: the bot token for API calls and the app token for Socket Mode relay.

### Tool categories

The Slack plugin organizes its 14 tools into four groups:

**Read-only tools** (no approval needed):
- `slack_list_channels` -- list accessible channels
- `slack_read_messages` -- read channel history
- `slack_poll_events` -- poll buffered relay events
- `slack_ack_event` -- acknowledge a processed event
- `slack_download_file` -- download a file attachment

**Write tools** (destructive, may require approval):
- `slack_send_message` -- post a message
- `slack_send_rich_message` -- post with persona and typing indicator
- `slack_upload_file` -- upload a file
- `slack_edit_message` -- edit an existing message

**Reaction tools:**
- `slack_add_reaction` -- add emoji reaction
- `slack_remove_reaction` -- remove emoji reaction
- `slack_set_typing` -- show typing indicator

**Dangerous tools** (approval required):
- `slack_delete_message` -- delete a message (`tiresias:approvalRequired: true`)

**Admin tools:**
- `slack_configure_relay` -- configure relay behavior (`tiresias:adminOnly: true`)

### Dispatch pattern

The `call()` method uses a dictionary dispatch pattern. This is clean, explicit, and easy to extend:

```python
async def call(self, tool_name, arguments, ctx):
    handlers = {
        "slack_list_channels": self._list_channels,
        "slack_send_message": self._send_message,
        # ... all 14 tools
    }
    handler = handlers.get(tool_name)
    if handler is None:
        return ToolResult.error(f"Unknown tool: {tool_name}")
    return await handler(arguments, ctx)
```

Each handler is a private async method that receives `(arguments, ctx)` and returns a `ToolResult`.

### Lazy initialization

The Slack plugin uses lazy initialization for expensive resources (relay daemon, outbound client). They are created on first use, not at plugin construction time:

```python
async def _ensure_relay(self, ctx):
    if self._relay is not None:
        return self._relay
    # Create and start relay on first use
    bot_token = self._get_token(ctx)
    app_token = ctx.secrets.get("SLACK_APP_TOKEN", "")
    self._relay = SlackRelay(bot_token=bot_token, app_token=app_token, buffer_size=1000)
    await self._relay.start()
    return self._relay
```

This pattern avoids startup costs for tools that may never be called and ensures secrets are available from the context.

### Error handling

Every handler wraps external calls in try/except and returns `ToolResult.error()` instead of raising:

```python
async def _list_channels(self, arguments, ctx):
    try:
        token = self._get_token(ctx)
        data = await self._slack_request("conversations.list", token, params={...})
    except Exception as exc:
        return ToolResult.error(f"Slack API error: {exc}")

    if not data.get("ok"):
        return ToolResult.error(f"Slack error: {data.get('error', 'unknown')}")

    # ... process and return
```

Two levels of error handling:
1. **Transport errors** (network failure, timeout) -- caught by the `except` block.
2. **API errors** (Slack returns `ok: false`) -- checked explicitly after the call.

### Annotation patterns

The Slack plugin demonstrates all annotation types:

```python
# Read-only, no approval
annotations={"readOnlyHint": True, "tiresias:approvalRequired": False}

# Destructive write
annotations={"destructiveHint": True, "tiresias:capability": "slack:post"}

# Destructive + requires human approval
annotations={"destructiveHint": True, "tiresias:approvalRequired": True, "tiresias:capability": "slack:post"}

# Admin-only configuration
annotations={"tiresias:adminOnly": True}
```

### Graceful fallback for missing SDK

The Slack plugin includes inline stub classes that activate when the SDK is not installed. This allows the plugin module to be imported and inspected even in environments where `app_proxy.sdk` is not available:

```python
try:
    from app_proxy.sdk.base import TiresiasPlugin
    from app_proxy.sdk.types import ToolContext, ToolDefinition, ToolResult
except ImportError:
    # Define minimal stubs so the module is importable
    ...
```

This is optional but useful for plugins that need to work in development environments before the full SDK is installed.

---

## Appendix: Checklist for New Plugins

Before submitting a plugin for review, verify:

- [ ] Plugin subclasses `TiresiasPlugin` and defines all required attributes.
- [ ] All tools have `inputSchema` with `"additionalProperties": false`.
- [ ] Every tool has a `tiresias:capability` annotation.
- [ ] Destructive tools are annotated with `destructiveHint: true`.
- [ ] High-risk tools have `tiresias:approvalRequired: true`.
- [ ] Secrets are declared in `required_secrets`, never hardcoded.
- [ ] `config.yaml` is present and complete.
- [ ] `manifest.json` is generated and matches the plugin's `tools()` output.
- [ ] `__main__.py` calls `mcp_adapter.run()`.
- [ ] `call()` never raises -- all errors return `ToolResult.error()`.
- [ ] Unit tests cover every tool with a mocked context.
- [ ] `health_check()` is overridden if the plugin depends on external services.

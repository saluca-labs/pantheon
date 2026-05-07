# Tiresias App Proxy -- Architecture

## System Context

```
+------------------+         +------------------+         +------------------+
|                  |         |                  |         |                  |
|  AI Agent        |  HTTP   | Tiresias         |  MCP    |  MCP Plugin      |
|  (any harness)   +-------->+ App Proxy        +-------->+  Servers         |
|                  |         |  :8081           |         |  (Slack, Wasm,   |
+------------------+         +--------+---------+         |   custom)        |
                                      |                   +------------------+
                                      |
                    +-----------------+------------------+
                    |                 |                  |
              +-----v-----+   +------v------+   +------v------+
              |            |   |             |   |             |
              | SQLite/    |   | Cedar       |   | Webhook     |
              | PostgreSQL |   | Policy      |   | (approval   |
              | (audit,    |   | Files       |   |  notify)    |
              |  approval, |   | (.cedar)    |   |             |
              |  schedules)|   |             |   +-------------+
              +------------+   +-------------+
```

The App Proxy sits between AI agents (any harness -- Claude Code, PicoClaw, custom) and the MCP plugin servers that perform real-world actions. Agents never call plugins directly. The proxy intercepts every call, applies policy, scores risk, checks behavioral patterns, and records an audit trail before dispatching.

### Integration Points

| System | Protocol | Purpose |
|---|---|---|
| **Tiresias LLM Proxy** | HTTP | The LLM Proxy governs model calls; the App Proxy governs actions. Together they form the complete Tiresias governance layer. An agent's outbound model requests go through the LLM Proxy, and its tool calls go through the App Proxy. |
| **PicoClaw / Agent Runtimes** | HTTP | Any agent runtime can call the App Proxy's REST API. PicoClaw agents route tool calls through the proxy when deployed in governed mode. |
| **soul-svc** | HTTP | Soul-svc provides identity (soulkeys) and session management. The `soulkey` field on tool calls links to soul-svc's authentication tier. Future: derived soulkeys per node for zero-trust plugin auth. |
| **MCP Plugin Servers** | stdio / HTTP / Wasm | Plugins are standard MCP servers. The proxy communicates via JSON-RPC over the plugin's declared transport. |

## Component Diagram

```
app_proxy/
  |
  +-- main.py                    FastAPI app, lifespan, health endpoint
  |
  +-- config.py                  Pydantic BaseSettings (APP_PROXY_* env vars)
  |
  +-- auth/
  |     +-- middleware.py         Bearer token + admin key verification
  |     +-- rate_counter.py       In-memory sliding-window rate tracking
  |
  +-- risk/
  |     +-- scorer.py             6-factor contextual risk scorer (0-100)
  |     +-- analyzer.py           Behavioral pattern analyzer (sliding window)
  |     +-- patterns.py           PII/sensitive data regex patterns
  |     +-- patterns_behavioral.py  5 threat pattern detectors
  |
  +-- policy/
  |     +-- engine.py             Cedar policy engine (cedarpy, hot-reload)
  |     +-- context_builder.py    Builds Cedar authorization context
  |     +-- schema.json           Cedar entity/action schema
  |
  +-- plugins/
  |     +-- registry.py           Plugin discovery, loading, tool resolution
  |     +-- loader.py             YAML config parser for plugin manifests
  |     +-- health.py             Background health polling loop
  |
  +-- mcp/
  |     +-- client.py             MCP JSON-RPC client (stdio, HTTP, Wasm dispatch)
  |
  +-- approval/
  |     +-- service.py            DB-backed approval queue (enqueue, approve, deny)
  |     +-- sweeper.py            Background task that expires stale approvals
  |
  +-- scheduler/
  |     +-- engine.py             APScheduler wrapper for recurring tool calls
  |     +-- models.py             SQLAlchemy model for persisted schedules
  |
  +-- audit/
  |     +-- logger.py             Async audit logger (record_call, record_result, record_approval)
  |
  +-- compliance/
  |     +-- frameworks.py         Control definitions: SOC 2 (7), NIST AI RMF (6), EU AI Act (4)
  |     +-- mapper.py             Maps audit events to control evidence
  |
  +-- wasm/
  |     +-- sandbox.py            Capability-based host function injection
  |     +-- runtime.py            Wasmtime module instantiation and execution
  |     +-- types.py              Wasm-specific type definitions
  |
  +-- sdk/
  |     +-- base.py               TiresiasPlugin abstract base class
  |     +-- manifest.py           tiresias.plugin.json manifest generator
  |     +-- types.py              ToolDefinition, ToolResult, ToolContext
  |     +-- mcp_adapter.py        Adapts SDK plugins to MCP JSON-RPC protocol
  |
  +-- storage/
  |     +-- engine.py             SQLAlchemy async engine factory + table creation
  |     +-- schema.py             ORM models (AppProxyAuditLog, ApprovalQueue)
  |
  +-- routers/
  |     +-- tools.py              POST /v1/tools/list, POST /v1/tools/call
  |     +-- admin.py              GET /v1/admin/plugins, POST policies/reload|validate, POST plugins/health
  |     +-- approval.py           GET/POST /v1/approval/* (list, status, approve, deny)
  |     +-- schedules.py          CRUD + pause/resume for /v1/schedules
  |     +-- compliance.py         GET /v1/compliance/frameworks|controls|report|gaps
  |
  +-- utils/
        +-- hashing.py            SHA-256 helpers for audit refs, argument hashing
```

## Data Flow for a Tool Call

This is the step-by-step path for a `POST /v1/tools/call` request.

### Step 1: Authentication (`auth/middleware.py`)

The `verify_request` function extracts the `Authorization: Bearer <key>` header, SHA-256 hashes the key, and performs a constant-time comparison against `APP_PROXY_API_KEY_HASH`. Returns tenant context or raises HTTP 401.

### Step 2: Tool Resolution (`plugins/registry.py`)

`PluginRegistry.resolve_tool(tool_name)` looks up the tool name in the in-memory index (O(1) dict lookup) and returns the owning `PluginConfig` and `ToolDef`. If unresolved, returns HTTP 404 with an audit record.

### Step 3: Argument Validation (`routers/tools.py`)

Basic type-checking of the provided arguments against the tool's `inputSchema`. Validates required fields and type correctness. Returns HTTP 422 on failure.

### Step 4: Risk Scoring (`risk/scorer.py`)

`RiskScorer.score()` evaluates six factors against the call context:

| Factor | Weight | Signal |
|---|---|---|
| Destructive tool | 30 | `destructiveHint` or `tiresias:approvalRequired` in annotations |
| External exposure | 25 | Tool name matches outbound patterns + args contain URLs/emails |
| Sensitive data | 20 | Regex scan for PII (SSN, credit cards, API keys, etc.) |
| Off-hours | 10 | UTC hour < 6 or > 22 |
| Blast radius | 10 | Wildcards, `@everyone`, `@channel` in arguments |
| New agent | 5 | Fewer than 10 prior calls in the behavioral window |

Output: composite score (0--100), level (low/medium/high/critical), and recommendation (allow/review/require_approval/block).

If strict risk enforcement is enabled and the score is critical, the call is auto-denied before Cedar evaluation.

### Step 5: Behavioral Analysis (`risk/analyzer.py`, `risk/patterns_behavioral.py`)

`BehavioralAnalyzer.check_and_record()` appends the event to the agent's sliding window (30-minute window, max 100 events, in-memory, lock-guarded) and runs all five pattern detectors:

1. **Data exfiltration** -- Read from internal source followed by external send within 5 minutes.
2. **Privilege escalation** -- New agent (< 10 calls) invoking admin/configuration tools.
3. **Rapid destructive** -- 3+ destructive operations within 2 minutes.
4. **Reconnaissance** -- 5+ read/list operations in 60 seconds with no writes.
5. **Approval circumvention** -- 3+ retries of a denied tool call.

Each detector runs in O(n) where n is the window size. Critical alerts auto-deny in strict enforcement mode.

### Step 6: Cedar Policy Evaluation (`policy/engine.py`)

`CedarPolicyEngine.authorize()` builds a 3-entity slice (Agent, Plugin, Tenant) and evaluates the request against all loaded `.cedar` policy files via `cedarpy.is_authorized()`. The engine is thread-safe (lock-guarded) and auto-reloads policies from disk at a configurable interval (default 30 seconds).

The Cedar context includes: tool name, rate count, rate window, hour of day, approval status, estimated cost, input keys, and risk score. This allows policies to make decisions based on any combination of these signals.

Three outcomes:
- **Allow** -- Proceed to MCP dispatch.
- **Deny** -- Return denied response with policy reason.
- **Needs approval** -- Denied + destructive classification + no prior approval = queue for human review.

### Step 7a: Approval Queue (`approval/service.py`)

If Cedar returns `needs_approval`, the call is enqueued in the `ApprovalQueue` table with a configurable TTL (default 30 minutes). A background sweeper (`approval/sweeper.py`) runs every 5 minutes to expire stale requests. If a webhook URL is configured, the service POSTs a notification. The caller receives a `pending_approval` response with an `approval_id`.

When an admin approves via `POST /v1/approval/{id}/approve`, the original arguments are decrypted and the call is dispatched to the plugin. The result is recorded in the audit log.

### Step 7b: MCP Dispatch (`mcp/client.py`)

`MCPClient.dispatch_tool_call()` routes to the plugin based on its transport:

- **stdio** -- Spawns the MCP server as a subprocess, sends a JSON-RPC `tools/call` request over stdin, reads the response from stdout.
- **HTTP** -- POSTs a JSON-RPC request to the plugin's URL endpoint.
- **Wasm** -- Instantiates the Wasm module in a sandbox with only declared capabilities linked, executes the tool call within the sandbox.

### Step 8: Audit Recording (`audit/logger.py`)

`AuditLogger.record_call()` creates the initial audit row at dispatch time. `AuditLogger.record_result()` updates it with the execution outcome, latency breakdown, and result hash. All arguments and results are SHA-256 hashed -- plaintext is never stored.

### Step 9: Response

The caller receives a typed response:

- `ToolCallSuccess` -- Contains the plugin result, audit reference, and any behavioral alerts.
- `ToolCallDenied` -- Contains the denial reason, audit reference, and behavioral alerts.
- `ToolCallPending` -- Contains the approval ID, expiry time, and priority.

## Technology Choices and Rationale

### Cedar (Authorization)

Cedar is Amazon's open-source authorization language, purpose-built for policy-as-code. It was chosen over OPA/Rego for three reasons: (1) Cedar's type system catches policy errors at load time rather than at evaluation time, (2) Cedar's entity-relationship model maps directly to the Agent/Plugin/Tenant domain, and (3) Cedar evaluates in microseconds with no JIT compilation step. The `cedarpy` binding provides native Python integration without a sidecar process.

### Wasmtime (Plugin Sandbox)

Wasm provides a hard security boundary for untrusted plugins. The capability-based host function injection model ensures plugins can only access what they explicitly declare. Wasm modules run in a deterministic sandbox with memory limits, no filesystem access, and no network access unless granted via a host function. This is the correct isolation model for plugins from third parties.

### SQLAlchemy 2.0 (Async ORM)

SQLAlchemy with async support (via `aiosqlite` for SQLite, `asyncpg` for PostgreSQL) provides portable storage without coupling to a specific database. SQLite works for single-instance deployments and development. PostgreSQL is recommended for production multi-instance deployments. The ORM layer handles schema creation, migrations, and query construction.

### APScheduler (Scheduling)

APScheduler 3.x provides cron and interval triggers with an asyncio-compatible scheduler. Scheduled tool calls are persisted to the database and survive process restarts. Each execution passes through the full Cedar + audit pipeline, ensuring scheduled actions are governed identically to interactive ones.

### FastAPI (HTTP Framework)

FastAPI provides automatic OpenAPI schema generation, request validation via Pydantic, and native async support. The generated OpenAPI spec at `/docs` serves as a live API reference for integrators.

### structlog (Logging)

Structured logging with JSON output for production, human-readable output for development. Every log event includes correlation fields (tenant_id, agent_id, plugin_name, tool_name) for log aggregation and alerting.

## Database Schema

### `app_proxy_audit_log`

Immutable record for every tool-call attempt. Primary key: UUID (`id`). Indexed: `tenant_id`, `agent_id`, `plugin_name`, `tool_name`, `created_at`, composite `(tenant_id, created_at)`. Unique: `call_id`.

Key fields: `arguments_hash` (SHA-256 of arguments), `policy_decision`, `policy_reason`, `approval_id`, `approval_status`, `status` (success/error/timeout/denied), `result_hash`, latency breakdown (`dispatch_latency_ms`, `plugin_latency_ms`, `total_latency_ms`), `session_id`, `deleted_at` (soft delete).

### `approval_queue`

Pending human-approval records. Primary key: UUID (`id`). Indexed: `tenant_id`, `status`, `call_id`.

Key fields: `arguments_encrypted` (original arguments for re-dispatch), `status` (pending/approved/denied/expired), `reason`, `submitted_at`, `expires_at`, `resolved_at`, `resolved_by`.

### `scheduled_calls`

Persisted schedule definitions. Stores agent/tenant/plugin/tool, cron expression or interval, enabled flag, run count, error count, and last result.

## Deployment Topology

### Single Instance (Development / Small Deployment)

```
+---------+       +-------------------+       +----------+
|  Agent  +------>+ App Proxy (:8081) +------>+ Plugins  |
+---------+       +--------+----------+       +----------+
                           |
                    +------v------+
                    | SQLite file |
                    +-------------+
```

### Multi-Instance (Production)

```
+---------+       +-------------------+       +----------+
|  Agent  +------>+ Load Balancer     +------>+ Plugins  |
+---------+       +---+---+---+-------+       +----------+
                      |   |   |
               +------v-+ | +-v------+
               | Proxy 1 | | | Proxy N|
               +----+----+ | +---+---+
                    |       |     |
                    +---v---v---v-+
                    |  PostgreSQL  |
                    +--------------+
```

In multi-instance mode, use PostgreSQL for shared state (audit logs, approval queue, schedules). Cedar policies are loaded from a shared volume or config map. The behavioral analyzer runs per-instance (in-memory); cross-instance behavioral correlation requires an external event bus (future work).

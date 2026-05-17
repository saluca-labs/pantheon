# @platform/soul-mcp

Dual-surface adapter for the Soul tool family. Exposes the full
`mcp__soul__*` tool surface (soul + mesh + nexus, 22 tools) over **two
transports**:

| Transport | Audience | Wire |
|---|---|---|
| MCP-over-stdio | LLM harnesses (claude-code, opencode, …) | stdin/stdout JSON-RPC frames |
| HTTP REST | In-cluster Pantheon services (portal, soulauth, cronjobs) | `POST /api/tools/<name>` JSON body |

A single binary serves both. The container's `CMD` runs with no
`--transport` flag, so the binary defaults to `both`; the in-cluster
Deployment overrides this with `SOUL_MCP_TRANSPORT=http` so HTTP is the
only listener on the running container (see "Production deployment"
below for why stdio is opted out at runtime).

This adapter is one half of the Soul stack. The other half is
[`apps/soul-service`](../soul-service/README.md) — the vendored
cryptographic memory backend. For how the two pods fit together
(diagram, auth, deployment topology, when to flip on Tier 2 storage,
how to wire an external MCP client), see
[`docs/architecture/soul-stack.md`](../../docs/architecture/soul-stack.md).

## Why a separate adapter

`soul-service` (the vendored upstream) ships a narrow HTTP surface:
memory write/read, TKHR lookup, integrity verification. The `mcp__soul__*`
tool family is wider — session bookkeeping, chain-of-thought buffering,
transcripts, mesh coordination, nexus catalog. This adapter:

1. **Wraps soul-service** for everything memory-related (single source of
   truth — no schema drift).
2. **Stores the rest in local SQLite** (mesh sessions/tasks/messages,
   nexus nodes/services/projects, soul session/cot/transcript bookkeeping).
   When upstream gains first-class backends for any of these, only the
   one tool handler needs to swap to an HTTP client — the MCP + REST
   surfaces stay identical to callers.
3. **Auto-inits a Soul session at boot** when `SOUL_AUTO_INIT_SESSION=1`,
   driven by the adapter calling its own `/api/session/init` — same
   payload as any external caller, so the path is exercised end-to-end on
   every deploy.

## Tools

### `soul_*` (9)

- `soul_session_init` / `soul_session_load` / `soul_session_close`
- `soul_memory_write` / `soul_memory_search`
- `soul_topics_lookup` / `soul_topics_top`
- `soul_cot_flush` / `soul_transcript_capture`

### `mesh_*` (8)

- `mesh_heartbeat`, `mesh_sessions`
- `mesh_inbox`, `mesh_message`
- `mesh_task_create`, `mesh_task_claim`, `mesh_task_complete`, `mesh_tasks`

### `nexus_*` (6)

- `nexus_nodes`, `nexus_services`, `nexus_status`
- `nexus_gsd`, `nexus_where`, `nexus_context`

## HTTP endpoints

| Method | Path | Notes |
|---|---|---|
| `GET` | `/health/live` | liveness, no auth |
| `GET` | `/health/ready` | readiness — verifies soul-service is reachable |
| `GET` | `/api/tools` | list available tools (debug) |
| `POST` | `/api/tools/<name>` | invoke a tool by name; body matches the tool's input schema |
| `POST` | `/api/session/init` | convenience alias for `soul_session_init`; the startup hook calls this |
| `POST` | `/api/nexus/nodes/upsert` | catalog feed — node-scanner pushes node state |
| `POST` | `/api/nexus/services/upsert` | catalog feed — node-scanner pushes service state |
| `POST` | `/api/nexus/projects/upsert` | catalog feed — node-scanner pushes project/GSD state |

Auth is opt-in fail-open (matches soul-service). When
`SOUL_SERVICE_KEY` is set, every non-health endpoint requires
`X-Soul-Service-Key: $SOUL_SERVICE_KEY` or it returns 401. When unset
or empty, the adapter boots, logs a single startup WARNING, and accepts
every request without authentication — so the pod is deploy-able before
the Secret Manager key exists. Self-hosters running outside Pantheon's
GCP project can leave the key unset.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `SOUL_SERVICE_URL` | `http://soul-service:8080` | Upstream HTTP base URL |
| `SOUL_SERVICE_KEY` | — | Shared secret (passed to soul-service and required on this adapter's own API) |
| `SOUL_MCP_HTTP_PORT` | `8090` | HTTP bind port |
| `SOUL_MCP_HTTP_HOST` | `0.0.0.0` | HTTP bind host |
| `SOUL_MCP_TRANSPORT` | `both` | `both`, `http`, or `stdio` (or pass `--transport=`) |
| `SOUL_MCP_DB_PATH` | `/app/data/soul-mcp.db` | Local SQLite for mesh/nexus/session state |
| `SOUL_MCP_MESH_STALE_MS` | `300000` | Heartbeat staleness threshold (mesh) |
| `SOUL_MCP_NEXUS_STALE_MS` | `900000` | Heartbeat staleness threshold (nexus) |
| `SOUL_AUTO_INIT_SESSION` | unset | If `1` or `true`, calls `soul_session_init` at boot |
| `SOUL_AUTO_INIT_SESSION_ID` | `soul-mcp-boot` | Session ID for auto-init |
| `SOUL_AUTO_INIT_NODE_ID` | `$HOSTNAME` | Node ID for auto-init |
| `SOUL_AUTO_INIT_HARNESS` | unset | One of `claude-code`, `opencode`, `nanoclaw`, `picoclaw` |
| `SOUL_AUTO_INIT_PERSONA` | unset | Optional persona/guardrail override |

## Local dev

```bash
# Both transports:
pnpm --filter @platform/soul-mcp dev

# HTTP only (faster iteration on REST):
pnpm --filter @platform/soul-mcp dev:http

# stdio only (point an MCP client at it):
pnpm --filter @platform/soul-mcp dev:mcp
```

```bash
# Hit a tool over HTTP
curl -X POST http://localhost:8090/api/tools/nexus_status -d '{}' \
  -H 'content-type: application/json'

# Hit a tool over MCP-over-stdio
# (use your favourite MCP client; see https://modelcontextprotocol.io)
```

## Production deployment

Deployed to `tiresias-prod` (namespace `pantheon`) by `.github/workflows/cd.yml`.
The Kubernetes manifest is `apps/platform-api/k8s/pantheon/soul-mcp-deployment.yaml`
and the ClusterIP Service entry lives in `services.yaml`. Internal-only —
clients reach it as `http://soul-mcp:8090` in-cluster.

The deployment sets `SOUL_MCP_TRANSPORT=http` so the running container
serves HTTP only. Pod stdin/stdout is plumbed to the container's main
process and is unsafe to share with the HTTP listener, so MCP-over-stdio
is delivered via a separate `kubectl exec` per harness session — see
"Connecting an LLM harness over MCP" below.

The soul-mcp pod and the soul-service pod share a single secret
(`pantheon-secrets/soul-service-key`, synced from GCP Secret Manager).
For the full Soul stack topology (both pods, shared secret, when to
flip on Tier 2 storage) see
[`docs/architecture/soul-stack.md`](../../docs/architecture/soul-stack.md).

## Connecting an LLM harness over MCP

For local dev (against a running adapter inside docker):

```bash
docker exec -i soul-mcp node apps/soul-mcp/dist/server.js --transport=stdio
```

For a deployed pod:

```bash
kubectl exec -i -n pantheon deploy/soul-mcp -- \
  node apps/soul-mcp/dist/server.js --transport=stdio
```

Wire that command into your MCP client's server config (Claude Code:
`.mcp.json`; opencode: `agentic-os.toml`; etc.).

## How upstream backend changes flow through

When soul-service or a future companion service grows a backend for
something the adapter currently serves locally (mesh, nexus, transcripts),
the migration is small:

1. The relevant tool factory (`src/tools/<file>.ts`) swaps its SQLite
   `db.prepare(…)` calls for a typed HTTP client method on `SoulClient`
   (or a new client class).
2. The tool's input/output shape stays identical — both MCP and HTTP
   callers see no change.
3. The local SQLite tables become migration sources; export them with
   `sqlite3 /app/data/soul-mcp.db .dump > snapshot.sql` and replay
   against the new backend.

That's the whole point of the registry-level indirection in `mcp.ts` and
`http.ts`.

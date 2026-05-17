# Soul Stack

The Soul stack is **two pods, one shared secret**. This doc explains how
they fit together, why they are split, and where to flip switches as the
upstream Soul project gains backends.

For per-pod detail, see:

- [`apps/soul-service/README.md`](../../apps/soul-service/README.md) —
  vendored Soul memory service (Python / FastAPI)
- [`apps/soul-mcp/README.md`](../../apps/soul-mcp/README.md) —
  dual-transport MCP adapter (Node / Fastify)
- [`apps/soul-service/VENDORED.md`](../../apps/soul-service/VENDORED.md) —
  vendoring policy, scrubs, refresh procedure
- Wider Pantheon topology: [`docs/architecture/system-overview.md`](system-overview.md)

## Topology

```
                  +-----------------------------------------------------------+
                  |  External MCP clients                                     |
                  |  (claude-code .mcp.json, opencode agentic-os.toml, ...)   |
                  |                                                           |
                  |  kubectl exec -i ... node dist/server.js --transport=stdio|
                  +-------------------------+---------------------------------+
                                            | stdio JSON-RPC
                                            v
   +----------------------------------------------------------------------+
   |  apps/soul-mcp           pod: soul-mcp (Deployment, ClusterIP :8090) |
   |  Node 22 + Fastify       SOUL_MCP_TRANSPORT=http (in cluster)        |
   |                          --transport=stdio (when exec'd by harness)  |
   |                                                                      |
   |  +----- 22 mcp__soul__* tools -----+    +-- local SQLite --+         |
   |  |  soul_*   (9)                   |    | /app/data/       |         |
   |  |  mesh_*   (8) ------------------+--->|   soul-mcp.db    |         |
   |  |  nexus_*  (6)                   |    | (WAL, per-pod,   |         |
   |  +--------+------------------------+    |  better-sqlite3) |         |
   |           | memory primitives only      +------------------+         |
   |           v                                                          |
   |  SoulClient (HTTP) --- X-Soul-Service-Key ---+                       |
   +----------------------------------------------+-----------------------+
                                                  | http://soul-service:8080
   +----------------------------------------------v-----------------------+
   |  apps/soul-service        pod: soul-service (Deployment, :8080)      |
   |  Python 3.13 + FastAPI    Vendored from cristianxruvalcaba-coder/soul|
   |                                                                      |
   |  /memory/*  /tkhr/*  /graph/integrity/*                              |
   |                                                                      |
   |  +- Tier 0 (always)  SQLite active_kb.db        per-pod              |
   |  +- Tier 1 (always)  in-process dict                                 |
   |  +- Tier 2 (opt-in)  Supabase OR future Postgres                     |
   +----------------------------------------------------------------------+

   shared secret: pantheon-soul-service-key (GCP Secret Manager
   ->  k8s Secret pantheon-secrets/soul-service-key)
```

Both pods live in the `pantheon` namespace. Both are internal-only
(ClusterIP, no ingress route). External MCP clients reach soul-mcp via
`kubectl exec`; in-cluster services reach it over plain HTTP at
`http://soul-mcp:8090`.

## Why two pods, not a sidecar

The two-pod shape was accepted on this PR because:

1. **Independent scalability.** soul-service and soul-mcp have different
   resource curves. The Python service does compression, hashing, and
   potentially Supabase round-trips; the Node adapter is mostly JSON
   plumbing. Splitting them lets each scale on its own once the local
   SQLite tiers are externalized (today both are pinned at
   `replicas: 1` for the same Tier 0 reason — see deferred features
   below).
2. **HTTP API for non-MCP consumers.** Other in-cluster pods
   (cronjobs, node-scanner, portal) consume the tool surface over plain
   HTTP. A sidecar would couple every consumer to its host pod. A
   ClusterIP Service decouples them.
3. **Clean separation of concerns.** soul-service is *vendored* upstream
   code with a strict edit policy (see `apps/soul-service/VENDORED.md`).
   soul-mcp is Pantheon-owned glue that can iterate freely without
   dirtying the vendor tree.
4. **No IPC penalty.** Pod-to-pod HTTP on the same Kubernetes node is
   sub-millisecond — the latency budget of a Soul tool call is dominated
   by hashing, not transport.

The historical alternative — running an MCP server inside soul-service
itself — would have required either a second listener inside the Python
process (mixing FastAPI with stdio) or vendoring an MCP server library
into upstream Soul (which is out of scope for the vendored project).

## Tool surface (22 total)

| Family | Tools | Backed by |
|---|---|---|
| `soul_*` | `session_init`, `session_load`, `session_close`, `memory_write`, `memory_search`, `topics_lookup`, `topics_top`, `cot_flush`, `transcript_capture` | `memory_write`/`memory_search`/`topics_*` proxy to soul-service; `session_*` + `cot_flush` + `transcript_capture` live in local SQLite |
| `mesh_*` | `heartbeat`, `sessions`, `inbox`, `message`, `task_create`, `task_claim`, `task_complete`, `tasks` | All local SQLite (mesh coordination has no upstream Soul backend yet) |
| `nexus_*` | `nodes`, `services`, `status`, `gsd`, `where`, `context` | All local SQLite (catalog state has no upstream Soul backend yet) |

When upstream Soul (or a future companion service) grows a first-class
backend for any of these, the swap point is each
`apps/soul-mcp/src/tools/<file>.ts` factory: replace the
`db.prepare(...)` calls with a typed HTTP client method on `SoulClient`
(or a new client class) and the MCP + REST surfaces stay identical to
callers. See [`apps/soul-mcp/README.md` -> "How upstream backend changes
flow through"](../../apps/soul-mcp/README.md#how-upstream-backend-changes-flow-through).

## HTTP API on soul-mcp

The adapter exposes its tool surface and a few catalog conveniences over
HTTP for in-cluster consumers:

| Method | Path | Notes |
|---|---|---|
| `GET` | `/health/live` | liveness (no auth) |
| `GET` | `/health/ready` | readiness — verifies soul-service reachable |
| `GET` | `/api/tools` | list available tools (debug) |
| `POST` | `/api/tools/<name>` | invoke a tool by name; body matches the tool's input schema |
| `POST` | `/api/session/init` | convenience alias for `soul_session_init` |
| `POST` | `/api/nexus/nodes/upsert` | catalog feed (node-scanner pushes node state) |
| `POST` | `/api/nexus/services/upsert` | catalog feed (services) |
| `POST` | `/api/nexus/projects/upsert` | catalog feed (projects / GSD) |

Example in-cluster call:

```bash
curl -X POST http://soul-mcp:8090/api/tools/soul_memory_search \
  -H 'content-type: application/json' \
  -H "X-Soul-Service-Key: $SOUL_SERVICE_KEY" \
  -d '{"session_id":"demo","query":"hello"}'
```

soul-service's own HTTP API (`/memory/*`, `/tkhr/*`,
`/graph/integrity/*`) is documented in
[`apps/soul-service/README.md` -> Endpoints](../../apps/soul-service/README.md#endpoints).
Most callers should go through soul-mcp; the direct soul-service surface
is for internal use by the adapter and for one-off operator scripts.

## Auth

Both pods share a single secret (`pantheon-soul-service-key` in GCP
Secret Manager -> `pantheon-secrets/soul-service-key` in Kubernetes) and
both enforce the same `X-Soul-Service-Key` header on every non-health
endpoint. The posture is **opt-in fail-open**:

- When `SOUL_SERVICE_KEY` is set, the header is required (401 otherwise).
- When `SOUL_SERVICE_KEY` is unset/empty, the pod boots, logs a single
  startup WARNING, and accepts every request without authentication.

This deliberately diverges from `memory-service` for the MVP rollout so
the pods are deploy-able before the Secret Manager key exists.
Self-hosters running outside Pantheon's GCP project can leave the key
unset.

When soul-mcp calls soul-service it forwards its own `SOUL_SERVICE_KEY`
(same env var on both pods), so the trust boundary is the namespace, not
the pod.

## Deployment topology

| Component | Type | Namespace | Replicas | Manifest |
|---|---|---|---|---|
| soul-service | Deployment | pantheon | 1 | `apps/platform-api/k8s/pantheon/soul-service-deployment.yaml` |
| soul-service | Service (ClusterIP :8080) | pantheon | — | `apps/platform-api/k8s/pantheon/services.yaml` |
| soul-mcp | Deployment | pantheon | 1 | `apps/platform-api/k8s/pantheon/soul-mcp-deployment.yaml` |
| soul-mcp | Service (ClusterIP :8090) | pantheon | — | `apps/platform-api/k8s/pantheon/services.yaml` |
| Shared secret | Secret | pantheon | — | `pantheon-secrets/soul-service-key` (synced from GCP Secret Manager by `scripts/provision-pantheon-secrets.sh`) |

The default in-cluster transport for soul-mcp is `SOUL_MCP_TRANSPORT=http`
— stdio is not enabled on the running container because pod stdin/stdout
is plumbed to the container's main process and unsafe to share with the
HTTP listener. Operators that need MCP-over-stdio `kubectl exec` a
separate invocation (see "External MCP client wiring" below).

## Deferred features

The soul-service deferred-features menu (Tier 2 Supabase, Anthropic
compression, Postgres cold tier, multi-replica, public ingress route,
the MCP adapter itself) is documented step-by-step in
[`apps/soul-service/README.md` -> "Deferred features (and how to flip
them on)"](../../apps/soul-service/README.md#deferred-features-and-how-to-flip-them-on).

The MCP adapter (§6 there) is **shipped** as of this stack — that
section now points back here.

## External MCP client wiring

LLM harnesses talk to soul-mcp via MCP-over-stdio. The harness spawns a
process whose stdin/stdout is the MCP transport.

### Local dev (adapter running in docker)

```bash
docker exec -i soul-mcp node apps/soul-mcp/dist/server.js --transport=stdio
```

### Deployed pod (in cluster)

```bash
kubectl exec -i -n pantheon deploy/soul-mcp -- \
  node apps/soul-mcp/dist/server.js --transport=stdio
```

Wire that command into the MCP client config:

- **Claude Code** — entry in `.mcp.json`:
  ```json
  {
    "mcpServers": {
      "soul": {
        "command": "kubectl",
        "args": ["exec", "-i", "-n", "pantheon", "deploy/soul-mcp",
                 "--", "node", "apps/soul-mcp/dist/server.js",
                 "--transport=stdio"]
      }
    }
  }
  ```
- **opencode** — equivalent entry in `agentic-os.toml`.
- **Other harnesses** — anything that speaks
  [Model Context Protocol](https://modelcontextprotocol.io) over stdio.

A separate exec for stdio is intentional: the running container serves
HTTP on its main process, and a second `kubectl exec` opens an
ephemeral child that runs the MCP transport in isolation.

## Local dev

```bash
# Run both transports against a local soul-service
pnpm --filter @platform/soul-mcp dev

# HTTP only (faster REST iteration)
pnpm --filter @platform/soul-mcp dev:http

# stdio only (point an MCP client at it)
pnpm --filter @platform/soul-mcp dev:mcp

# Smoke-test the HTTP surface
node apps/soul-mcp/scripts/smoke_test.mjs
```

soul-service comes up via its own Dockerfile
(`apps/soul-service/Dockerfile`) or `pip install` from
`apps/soul-service/pyproject.toml`. See its README for the dev command.

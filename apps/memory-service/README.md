# @platform/memory-service

HTTP sidecar that exposes `@platform/memory` to non-Node services in the platform — primarily `apps/platform-api` (Python).

## Why

`@platform/memory` is a TypeScript-only library (vendored from `saluca-labs/elysium`). Rather than port the algorithms to Python, we run a small Fastify service in the same compose network and have the Python client speak HTTP to it. See `docs/decisions/ADR-003-elysium-internal-package.md`.

## Run

Local dev:

```bash
pnpm --filter @platform/memory-service dev
```

Container (full profile):

```bash
docker compose --profile full up memory-service
```

## Endpoints

| Method | Path | Body / Query |
|---|---|---|
| `GET` | `/health/live` | — |
| `GET` | `/health/ready` | — |
| `POST` | `/v1/memories` | `{ content, topics? }` |
| `GET` | `/v1/memories?limit&offset` | paged list |
| `GET` | `/v1/memories/recall?topic&limit` | recall by topic |
| `GET` | `/v1/memories/search?q&limit` | full-text search |
| `DELETE` | `/v1/memories/:id` | — |

## Auth

All non-health requests require `X-Memory-Service-Key: $MEMORY_SERVICE_KEY`. In production the service refuses to start without that env var set.

## Backends

- `MEMORY_BACKEND=sqlite` (default) — uses `ASPHODEL_DB` path
- `MEMORY_BACKEND=postgres` — uses `ASPHODEL_DATABASE_URL` or `DATABASE_URL`

## Python client

Use `platform_memory_client` from `packages/memory-client/python/`:

```python
from platform_memory_client import MemoryClient

mem = MemoryClient.from_env()
m = await mem.remember("user prefers dark mode", topics=["preferences", "ui"])
hits = await mem.recall("preferences", limit=5)
```

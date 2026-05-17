# soul-service

Pantheon deployment of the [Soul](https://github.com/cristianxruvalcaba-coder/soul)
cryptographic memory service. Soul provides persistent LLM memory with
SHA-256 dual-integrity hashing (content + topology), an O(1) topic
routing index (TKHR), recursive compression to a bounded Soul object,
and a three-tier hot/cold storage cascade.

The upstream package (`soul-memory` on PyPI, Apache 2.0) is vendored
verbatim under `soul/`; see [VENDORED.md](VENDORED.md) for the upstream
SHA, scrubs applied at vendor time, and the refresh procedure.

For the architecture, hash contract, and API reference, read the
upstream docs: [README.upstream.md](README.upstream.md),
[ARCH.md](ARCH.md), [PAPER.md](PAPER.md).

## Layout

```
apps/soul-service/
├── soul/                    # vendored package — do NOT edit (see VENDORED.md)
│   ├── __init__.py
│   ├── serve.py             # upstream FastAPI app (imported by pantheon_entry)
│   ├── storage.py           # dual-path Tier 0/1/2 store
│   ├── hashing.py, graph.py, tkhr.py, compression.py, prefetch.py
│   ├── local_buffer.py, gcp_config.py
│   └── tests/
├── pantheon_entry.py        # Pantheon wrapper: auth middleware + /health/* surfaces
├── Dockerfile               # Pantheon container build
├── Dockerfile.upstream      # upstream's Dockerfile, kept for reference only
├── README.md                # this file
├── README.upstream.md       # upstream README (auto-refreshed on vendor)
├── ARCH.md, PAPER.md        # upstream architecture + paper
├── LICENSE                  # Apache 2.0
└── VENDORED.md              # vendoring policy + refresh procedure
```

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/health` | none | Upstream `serve.py` health route |
| `GET` | `/health/live` | none | Pantheon-added liveness probe |
| `GET` | `/health/ready` | none | Pantheon-added readiness probe |
| `POST` | `/memory/write` | `X-Soul-Service-Key` | Write a memory record (dual-hashed, fan-out to Tier 0/1/2) |
| `GET` | `/memory/{session_id}` | `X-Soul-Service-Key` | Read recent memories for a session |
| `POST` | `/tkhr/lookup` | `X-Soul-Service-Key` | O(1) topic-keyed lookup (single or multi-topic) |
| `GET` | `/tkhr/top` | `X-Soul-Service-Key` | Top N topics by weight |
| `GET` | `/tkhr/stats` | `X-Soul-Service-Key` | TKHR index stats |
| `POST` | `/graph/integrity/{session_id}` | `X-Soul-Service-Key` | Recompute + verify dual hashes |

In production (`SOUL_ENV=production`), every non-health request must
carry `X-Soul-Service-Key: $SOUL_SERVICE_KEY`. The service refuses to
start if the key env var is missing — same fail-closed pattern as
[`memory-service`](../memory-service/README.md#auth).

## Configuration

| Env var | Required | Default | Purpose |
|---|---|---|---|
| `SOUL_SERVICE_KEY` | prod | — | Shared secret enforced by auth middleware |
| `SOUL_ENV` | no | `development` | `production` enables fail-closed boot |
| `SUPABASE_URL` | no | `''` | Tier 2 (cold) Supabase project URL |
| `SUPABASE_SERVICE_KEY` | no | `''` | Tier 2 service-role key |
| `SOUL_BUFFER_PATH` | no | `/app/data/active_kb.db` | Tier 0 SQLite path |
| `SOUL_BUFFER_MAX` | no | `200` | LRU eviction threshold per session |
| `ANTHROPIC_API_KEY` | optional | — | Required by compression layer |
| `PORT` | no | `8080` | uvicorn bind port |

## Local development

```bash
# Build the image
docker build -f apps/soul-service/Dockerfile -t soul-service:dev apps/soul-service/

# Run it (no auth required in dev)
docker run --rm -p 8080:8080 \
  -e SOUL_ENV=development \
  soul-service:dev

# Hit the health probe
curl http://localhost:8080/health/live   # -> {"status":"ok"}
```

## Production deployment

Deployed to `tiresias-prod` (namespace `pantheon`) by `.github/workflows/cd.yml`.
The Kubernetes manifest is `apps/platform-api/k8s/pantheon/soul-service-deployment.yaml`
and the ClusterIP Service entry lives in `services.yaml`. The service is
**internal-only** — there is no ingress route on `pantheon.saluca.com`.
Pantheon clients (portal, soulauth, platform-web) reach it in-cluster via
`http://soul-service:8080`.

### Self-hosters

Soul is local-first. Run the container alone and it will fall back to
the SQLite Tier 0 buffer (`~/.soul/active_kb.db` by default) when no
Supabase credentials are configured. Tier 2 writes will surface as
runtime errors on the relevant endpoints; everything else (TKHR,
hashing, integrity verification, hot cache) works without external
infrastructure.

## MCP exposure

Soul ships HTTP routes (see Endpoints above), not MCP-over-stdio. To
expose `mcp__soul__*` tool calls to Pantheon's portal a thin adapter is
needed that translates MCP tool calls to HTTP. That adapter is not part
of this wave — see the PR description for the deferral note.

## Refreshing the vendor

```bash
scripts/vendor-soul.sh                          # uses SOUL_UPSTREAM=Z:/soul
SOUL_UPSTREAM=/path/to/clone scripts/vendor-soul.sh
```

Then bump the recorded SHA in `VENDORED.md` and commit.

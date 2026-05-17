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

## Deferred features (and how to flip them on)

The MVP intentionally ships with several features turned off. Each one
below is a deliberate deferral, not an oversight — the wiring is in
place but disabled so production starts in the smallest defensible
configuration. Future maintainers (or Cristian) can flip any of them on
without re-architecting.

### 1. Tier 2 cold storage (Supabase)

**Today**: `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are commented out
in `apps/platform-api/k8s/pantheon/soul-service-deployment.yaml`. Tier 0
(per-pod SQLite) and Tier 1 (in-process dict cache) serve every read.
Writes that fan out to Tier 2 surface as runtime errors on the affected
endpoints (`/memory/write`, `/tkhr/lookup` against unindexed topics).

**Flip on**:

1. Provision a Supabase project for Soul. Capture the URL and the
   service-role key.
2. Add two new GCP Secret Manager entries (`pantheon-soul-supabase-url`
   and `pantheon-soul-supabase-key`), grant `pantheon-sa` the
   `secretmanager.secretAccessor` role on each (see RUNBOOK.md section
   7 for the canonical `gcloud secrets create` recipe).
3. Add the matching k8s keys to `scripts/provision-pantheon-secrets.sh`
   so they sync into `pantheon-secrets`:
   ```bash
   ["soul-supabase-url"]="pantheon-soul-supabase-url"
   ["soul-supabase-key"]="pantheon-soul-supabase-key"
   ```
4. Uncomment the `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` env blocks in
   `apps/platform-api/k8s/pantheon/soul-service-deployment.yaml`
   (lines 99-108).
5. Re-run `scripts/provision-pantheon-secrets.sh`, then cut a new tag
   to redeploy.

### 2. Compression layer (Anthropic)

**Today**: `ANTHROPIC_API_KEY` is commented out in the deployment.
Soul's compression endpoints (Level 1 single-session summarization,
Level 2 recursive Soul synthesis) will fail when called without it.
TKHR, hashing, storage, and integrity verification are unaffected.

**Flip on**:

1. The pantheon-secrets Secret may already carry an `anthropic-api-key`
   slot — check with `kubectl get secret pantheon-secrets -n pantheon
   -o json | jq '.data | keys'`. If not, add it to
   `scripts/provision-pantheon-secrets.sh` and the RUNBOOK secrets
   table, then provision via GCP Secret Manager.
2. Uncomment the `ANTHROPIC_API_KEY` env block in
   `apps/platform-api/k8s/pantheon/soul-service-deployment.yaml`
   (lines 112-116).
3. Cut a tag to redeploy.

### 3. Postgres cold tier (instead of Supabase)

**Today**: the vendored `soul/storage.py` only knows Supabase as a
Tier 2 backend. Pantheon already runs Cloud SQL Postgres for the rest
of the namespace and it would be cheaper to share that instance than
to stand up Supabase.

**Flip on** — this one is NOT a config flip, it's an upstream change:

1. Open a PR against `github.com/cristianxruvalcaba-coder/soul` adding
   a `PostgresAdapter` alongside the existing Supabase code (mirror
   the pattern that `@platform/memory` uses — see
   `apps/memory-service/src/server.ts` for the precedent: dual
   `SQLiteAdapter` / `PostgresAdapter`, backend selected by env var).
2. Once merged + released upstream, run `scripts/vendor-soul.sh` to
   refresh Pantheon's copy, bump the recorded SHA in `VENDORED.md`.
3. Add `SOUL_BACKEND=postgres` and reuse `pantheon-secrets/database-url-sync`
   in the deployment env. Add a cloud-sql-proxy sidecar (mirror
   `memory-service-deployment.yaml` lines 113-133). Add `port: 3307`
   to the soul-service NetworkPolicy egress (mirror
   `memory-service-netpol`).
4. Cut a tag to redeploy.

### 4. Replica count > 1

**Today**: `replicas: 1` in the Deployment. Soul's Tier 0 SQLite
buffer is per-pod, so two replicas would split a session's hot tier
across pods and break cold-start warm-up integrity assumptions.

**Flip on** — also requires architectural work, not just config:

1. Externalize Tier 0. Options: switch to Redis (add a Redis instance
   + adapter upstream — same upstream-PR flow as #3), OR shard at the
   Service layer (consistent-hash on `session_id`, requires a custom
   proxy or service-mesh policy).
2. Once Tier 0 is shared, bump `replicas` in the deployment and add a
   PodDisruptionBudget entry to `pdb.yaml` (mirror
   `memory-service-pdb`).
3. Remove or comment the inline "MVP single replica" note at the top
   of the deployment so future readers know the constraint lifted.

### 5. Public ingress route (`/v1/soul/*` on `pantheon.saluca.com`)

**Today**: soul-service is internal-only (ClusterIP, no path on
`pantheon.saluca.com`). Pantheon callers reach it as
`http://soul-service:8080` in-cluster. Same pattern as
`memory-service`.

**Flip on**:

1. Decide whether external clients hit the HTTP API directly or go
   through the MCP adapter (see #6 — they're linked).
2. Edit `apps/platform-api/k8s/pantheon/ingress.yaml`. Path order
   matters for GCE ingress (declaration order, not longest-prefix —
   see the invariant comment at line 22). Add the new rule BEFORE
   `/v1/*` (which routes to soulauth) because GCE is not
   longest-prefix:
   ```yaml
   - path: /v1/soul/*
     pathType: ImplementationSpecific
     backend:
       service:
         name: soul-service
         port:
           number: 8080
   ```
3. Update the soul-service `Service` in `services.yaml` to add a
   `beta.cloud.google.com/backend-config` annotation (mirror
   `soulauth` / `soulgate` entries) and add a matching
   `soul-service-backendconfig` to `backendconfigs.yaml` with
   appropriate timeouts.
4. Tighten the soul-service `NetworkPolicy` ingress: add the GCE
   health-prober CIDRs (`130.211.0.0/22`, `35.191.0.0/16`) to the
   `from` block so the LB can probe the pod (mirror `soulauth-netpol`
   lines 31-38).
5. SoulAuth (the gateway) must mint and validate the
   `X-Soul-Service-Key` on behalf of external clients, OR external
   clients must present their own key. Decide before exposing — a
   shared key on the public internet defeats the auth model.
6. Cut a tag to redeploy.

### 6. MCP adapter (`mcp__soul__*` tool calls)

**Today**: Soul ships HTTP routes (see Endpoints above), not
MCP-over-stdio. The `mcp__soul__*` tool surface (soul_session_init,
soul_memory_search/write, mesh_*, nexus_*, soul_transcript_capture)
has no backend in Pantheon yet.

**Flip on** — the design decision still needs Cristian's call. Three
options:

- **Portal-side adapter**: portal exposes the MCP server-over-stdio
  surface and proxies each tool call to soul-service via HTTP.
  Cheapest to ship; portal becomes the MCP boundary.
- **Separate `soul-mcp` microservice**: a small Node/Python service
  speaks MCP on one side and HTTP to soul-service on the other.
  Cleaner separation; one more pod.
- **Sidecar in the soul-service pod**: an MCP adapter container
  shares the pod and loops back to localhost:8080. Co-located,
  no cross-pod hop; binds MCP-over-stdio to a single pod which is
  fine while `replicas: 1` (see #4) is the constraint anyway.

Whichever path is chosen, the adapter implements the
`mcp__soul__*` tool schema and translates each tool call to a
`POST /memory/write` / `POST /tkhr/lookup` / etc., carrying the
`X-Soul-Service-Key` it gets from its env. Public exposure
follows #5.

## Refreshing the vendor

```bash
scripts/vendor-soul.sh                          # uses SOUL_UPSTREAM=Z:/soul
SOUL_UPSTREAM=/path/to/clone scripts/vendor-soul.sh
```

Then bump the recorded SHA in `VENDORED.md` and commit.

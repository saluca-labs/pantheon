# Container Gap Analysis

Documents containerization state before and after `platform/unification-v1`.

## Before

| Service | Containerized | Notes |
|---------|--------------|-------|
| `tiresias` (platform-api) | Yes | Had `Dockerfile`, multiple `cloudbuild-*.yaml`, own `docker-compose.yml` |
| `tiresias-web` (platform-web) | Yes | Had `Dockerfile` and `Dockerfile.dev` |
| `tiresias-app-proxy` | Yes | Had `Dockerfile` |
| `tiresias-sovereign` | No | No Dockerfile |
| `tiresias-grafana` | Yes | `docker-compose.lgtm.yaml` |
| `tiresias-pentest` | Yes | `docker-compose.pentest.yaml` |
| `tiresias-incident-controller` | Partial | No Dockerfile in root |
| `tiresias-enforcement` | Unknown | No Dockerfile found |
| `tiresias-monitor` | Unknown | No Dockerfile found |
| Root compose | No | Each app had its own compose |
| CI builds | GCP Cloud Build | `cloudbuild-*.yaml` files (now archived) |

## After

| Service | Containerized | Compose Profile | Notes |
|---------|--------------|-----------------|-------|
| `apps/platform-api` | Yes | `default`, `full` | Multi-stage `python:3.11-slim`, non-root uid 1001 |
| `apps/platform-web` | Yes | `default`, `full` | Multi-stage `node:22-alpine`, non-root uid 1001, Next.js standalone |
| `apps/platform-app-proxy` | Yes | `full` only | Existing Dockerfile, referenced in root compose |
| `apps/platform-sovereign` | Yes (NEW) | `full` only | New `Dockerfile` added |
| `infrastructure/grafana` | Yes | Separate compose | Unchanged |
| `infrastructure/pentest` | Yes | Separate compose | Unchanged |
| Root `docker-compose.yml` | — | `default` / `full` / `ci` | New: profile-based, single entry point |
| Postgres 16 | Yes | all | `healthcheck` with `pg_isready` |
| Mailhog | Yes | `default`, `full` | SMTP catch-all for dev |
| Redis 7 | Yes | `full` | Optional distributed rate limiting |
| Worker | Yes | `full` | Same API image, different CMD |
| CI builds | GitHub Actions | `.github/workflows/ci.yml` | Replaces Cloud Build |

## Gaps Remaining

1. ~~**Worker service**: `src.worker` module may not exist yet in platform-api~~ —
   **Closed in v3** (`apps/platform-api/src/worker.py`, see commit history on
   `platform/unification-v3`). Postgres-native jobs queue with handler
   registry, exponential-backoff retries, and a tiny built-in HTTP
   `/health/live` endpoint on `WORKER_HEALTH_PORT`.
2. ~~**platform-app-proxy health check**~~ — **Closed in v3**. Compose service
   now declares an HTTP healthcheck against the existing `/health` endpoint.
   Compose port also corrected from `8080:8080` to `8081:8081` to match the
   container's `EXPOSE 8081` and the Dockerfile `ENTRYPOINT`.
3. ~~**platform-sovereign**: Dockerfile added but `src/main.py` missing~~ —
   **Closed in v3**. `src/main.py` now exposes a FastAPI `app` with
   `/health/live`, `/health/ready`, `/v1/principles`, and `/v1/route`.
   Compose declares a corresponding healthcheck.
4. **Secret management**: Compose uses environment variables directly. The
   v3 work added `packages/secrets/python/platform_secrets/` — a pluggable
   resolver facade with backends for env (default), file, AWS Secrets
   Manager, and Vault. Production deployments should set
   `PLATFORM_SECRETS_BACKEND` and the corresponding backend env. Compose
   wiring of the AWS/Vault sidecars is still a follow-up.
5. ~~**Non-root user in proxy/sovereign**~~ — **Verified in v3**:
   - `apps/platform-app-proxy/Dockerfile` runs as `USER appproxy`.
   - `apps/platform-sovereign/Dockerfile` runs as `USER platform` (uid 1001).

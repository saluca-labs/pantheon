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

1. **Worker service**: `src.worker` module may not exist yet in platform-api — needs implementation.
2. **platform-app-proxy health check**: Not yet added to the service definition.
3. **platform-sovereign**: Dockerfile added but `src/main.py` may not expose FastAPI app as `app`.
4. **Secret management**: Compose uses environment variables directly. Production deployments should use Vault, AWS Secrets Manager, or GCP Secret Manager.
5. **Non-root user in proxy/sovereign**: Old Dockerfiles may run as root — verify and fix in follow-up.

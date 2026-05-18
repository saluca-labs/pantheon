# Container Deployment

## Local Container Stack

### Prerequisites

- Docker Desktop (or Docker Engine + Compose v2)
- `.env` file in repo root

### Start (default profile)

Starts: PostgreSQL, Mailhog, platform-api, platform-web.

```bash
pnpm docker:up
# Or directly:
docker compose up --build
```

### Start (full profile)

Adds: Redis, platform-app-proxy, platform-sovereign, worker.

```bash
docker compose --profile full up --build
```

### Stop and clean up

```bash
pnpm docker:down
# Or:
docker compose down -v   # -v removes volumes (db data)
```

### Service URLs

| Service | URL |
|---------|-----|
| platform-web | http://localhost:3000 |
| platform-api docs | http://localhost:8000/docs |
| platform-app-proxy | http://localhost:8080 |
| Mailhog UI | http://localhost:8025 |
| Agentic OS index | http://localhost:3000/dashboard/os |
| Cross-OS audit log | http://localhost:3000/dashboard/audit |
| Per-user OS settings | http://localhost:3000/dashboard/settings |

### Running migrations inside Docker

```bash
docker compose exec platform-api python -m alembic upgrade head
```

### Seeding admin user inside Docker

```bash
docker compose exec platform-web node /app/apps/platform-web/scripts/seed-admin.js
```

---

## Validating Compose Config

```bash
docker compose config   # validate compose file without starting
docker compose config --profiles full   # validate full profile
```

---

## CI (GitHub Actions)

The `ci` profile starts only PostgreSQL for migration and test runs:

```bash
docker compose --profile ci up -d
```

See `.github/workflows/ci.yml` for the full CI pipeline.

---

## Production Guidance

### Image Tags

Images are published to GHCR via the CD workflow on tag push:

```
ghcr.io/cristianxruvalcaba-coder/tiresias-web:{tag}
ghcr.io/cristianxruvalcaba-coder/tiresias-api:{tag}
ghcr.io/cristianxruvalcaba-coder/tiresias-app-proxy:{tag}
ghcr.io/cristianxruvalcaba-coder/tiresias-sovereign:{tag}
```

### Required Secrets

Set these in your container orchestrator (Kubernetes, ECS, etc.):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres connection string with credentials |
| `SESSION_SECRET` | Min 32 chars random secret |
| `WEB_PUBLIC_URL` | Public URL of platform-web |
| `API_PUBLIC_URL` | Public URL of platform-api |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_FROM` | Production mailer |
| `REDIS_URL` | Redis connection for distributed rate limiting |

### Agentic OS Configuration

The Agentic OS layer needs no extra environment variables — it shares `DATABASE_URL` with the rest of the platform and resolves feature flags server-side per request from `agos_feature_flags`. Two operational details to verify on every deploy:

1. **Migration chain through `0013`** — the `agos_audit` (introduced in `0003_agentic_os.py`) and `agos_feature_flags` (introduced in `0013_agos_feature_flags.py`) tables must exist before serving `/dashboard/os/*` traffic. Run `python -m alembic upgrade head` in the `platform-api` Alembic tree as part of the rollout job. See [docs/operations/alembic-branches.md](./alembic-branches.md).
2. **Staged rollout safety** — the audit/flags/summary BFF routes return 404 when the registry is empty or migrations haven't run yet. This is intentional. See [docs/operations/agentic-os-rollout.md](./agentic-os-rollout.md) for the rollout playbook.

No per-OS feature toggle env var exists — enable/disable is per user via the settings UI or direct SQL. See [docs/architecture/feature-flags.md](../architecture/feature-flags.md) and [ADR-007](../decisions/ADR-007-per-user-feature-flags.md).

### Health Checks

| Service | Liveness | Readiness |
|---------|----------|-----------|
| platform-api | `/health/live` | `/health/ready` (DB check) |
| platform-web | `/api/health/live` | `/api/health/ready` (DB check) |

### Non-Root Users

Both `platform-api` and `platform-web` containers run as uid 1001 (non-root) in production images.

### Multi-Stage Builds

All Dockerfiles use multi-stage builds:
1. `deps` / `builder` — full build toolchain
2. `runner` — minimal runtime image (no dev deps, no build tools)

This reduces attack surface and image size.

### Database Migrations in Production

Run migrations before rolling out new containers. Use a Kubernetes Job or an ECS task:

```bash
docker run --rm \
  -e DATABASE_URL=$DATABASE_URL \
  ghcr.io/cristianxruvalcaba-coder/tiresias-api:${TAG} \
  python -m alembic upgrade head
```

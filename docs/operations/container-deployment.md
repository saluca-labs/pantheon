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

# Deployment Walkthrough

> **Pantheon Administrator Guide — Drilldown**
> **Parent:** [`chapters/part1-getting-started.md`](../chapters/part1-getting-started.md)

The canonical Pantheon self-hoster deployment paths are documented at
the operations level:

- **[`docs/operations/quickstart.md`](../../../../docs/operations/quickstart.md)** — 15-minute clone-to-running
- **[`docs/operations/container-deployment.md`](../../../../docs/operations/container-deployment.md)** — docker compose deployment
- **[`docs/operations/local-development.md`](../../../../docs/operations/local-development.md)** — local dev (venv + pnpm)
- **[`apps/platform-api/deploy/INSTALL.md`](../../deploy/INSTALL.md)** — per-service install reference
- **[`apps/platform-api/deploy/TROUBLESHOOTING.md`](../../deploy/TROUBLESHOOTING.md)** — failure-mode reference

This drilldown adds the "deployment topology" view that the operations
docs intentionally skip.

---

## 1. Topology choices

Pantheon ships as a single docker compose stack out of the box.
Production-style deployments typically split the stack across three
topology tiers:

| Tier | Composition |
|---|---|
| **Single-host docker compose** (default) | All services in one compose file; volumes on local disk; single Postgres. |
| **Managed Postgres + container hosts** | Compose / Kubernetes on container hosts; Postgres on a managed service (RDS, Cloud SQL, Supabase). |
| **Full Kubernetes** | Per-service Deployments; Postgres on a managed service or StatefulSet; secrets in a Secret Manager. |

The compose stack is the supported path; the Kubernetes path is
demonstrated by `apps/platform-api/k8s/pantheon/` (which is Cristian's
internal GKE deploy reference and not a general-purpose self-host
template).

## 2. The seven container roles

| Service | Image | Port | Notes |
|---|---|---|---|
| `db` | `postgres:16` | 5432 (internal) | platform-api state + SoulAuth local-mode users |
| `platform-api` | local build | 8000 | FastAPI core; mounts agent + auth + audit |
| `platform-web` | local build | 3000 | Next.js dashboard + BFF |
| `soul-service` | local build | 8200 | Separate-process services (memory, sessions, mesh) |
| `tiresias-proxy` | local build | 8080 | App Proxy (kept Tiresias-branded by design) |
| `memory-service` | local build | 8210 | Vendored from saluca-labs/elysium |
| `matrix-bridge` | local build | (optional) | Synapse + appservice for Matrix integration |

The matrix-bridge service is **optional**; it ships in the same
compose file but won't start unless you opt in via a profile.

## 3. Pre-deployment checklist

| Item | Self-host minimum | Production-style |
|---|---|---|
| Docker | 24.0 + Compose v2.20 | 26.0 + Compose v2.27 |
| Disk | 20 GB | 100 GB+ (depends on retention) |
| RAM | 4 GB | 16 GB+ |
| TLS | Optional (localhost) | Required; terminate at reverse proxy |
| Reverse proxy | None | nginx / Caddy / Traefik in front |
| DNS | None | A record(s) for your hostname |
| Backups | Optional (manual) | Automated (`pg_dump` cron + offsite) |
| Secrets | `.env` file | Vault / GCP SM / AWS SM via `env://` ref |
| Monitoring | Dashboard's own pages | Prometheus + Grafana |
| Provider keys | None required at boot | Per-tenant BYOK after first login |

There is **no license key**. Pantheon is local-first OSS.

## 4. First-boot walkthrough

```bash
# 1. Clone
git clone https://github.com/salucallc/pantheon.git
cd pantheon

# 2. Configure
cp .env.example .env
$EDITOR .env
# Set SESSION_SECRET (openssl rand -base64 48)
# Set POSTGRES_PASSWORD

# 3. Bootstrap (installs deps, runs migrations, seeds admin)
pnpm bootstrap

# 4. Bring stack up
pnpm docker:up

# 5. Verify
curl http://localhost:8000/health
open http://localhost:3000

# 6. Sign in with seeded admin (creds printed by step 3)

# 7. Add a provider key from the dashboard
#    /dashboard/settings → Provider Keys → New Key
```

## 5. Reverse proxy notes

For production, terminate TLS at a reverse proxy:

```
                       │
            ┌──────────┴──────────┐
   TLS  →   │  nginx / Caddy      │   →  upstream Pantheon
   :443     └─────────┬───────────┘
                      │
              ┌───────┴───────┐
              ▼               ▼
       platform-web      platform-api
         :3000              :8000
```

Set `WEB_PUBLIC_URL` and `API_PUBLIC_URL` to the externally-visible
HTTPS URLs (e.g. `https://pantheon.example.com` and
`https://pantheon-api.example.com`); the BFF uses these to construct
CORS + cookie domain rules.

## 6. Upgrades

```bash
git pull
pnpm install
pnpm migrate    # runs Alembic + drizzle migrations
docker compose build
docker compose up -d
```

Migration topology:
[`docs/operations/alembic-branches.md`](../../../../docs/operations/alembic-branches.md).

## See also

- [`docs/operations/quickstart.md`](../../../../docs/operations/quickstart.md)
- [`docs/operations/container-deployment.md`](../../../../docs/operations/container-deployment.md)
- [`apps/platform-api/deploy/INSTALL.md`](../../deploy/INSTALL.md)
- [`apps/platform-api/deploy/TROUBLESHOOTING.md`](../../deploy/TROUBLESHOOTING.md)
- [`troubleshooting-flowcharts.md`](troubleshooting-flowcharts.md) — decision-tree variant

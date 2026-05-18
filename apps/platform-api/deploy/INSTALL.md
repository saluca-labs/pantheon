# Pantheon Self-Host Install

A reference for installing Pantheon on a single host using docker
compose. Pantheon is local-first OSS — there are no license keys, no
private container registry, and no tier gating. If you want the
canonical 15-minute path use
[`docs/operations/quickstart.md`](../../../docs/operations/quickstart.md);
this document is the longer reference for operators standing up a
durable environment.

For the production-leaning container topology see
[`docs/operations/container-deployment.md`](../../../docs/operations/container-deployment.md).

## Prerequisites

### Hardware

| Resource | Minimum | Recommended |
|---|---|---|
| RAM | 4 GB | 8 GB |
| CPU | 2 cores | 4 cores |
| Disk | 20 GB | 50 GB (more if you keep audit history) |

### Software

- **Docker Engine 24+** with the Compose v2 plugin (bundled in Docker
  Desktop; `docker compose version` should report `v2.x`).
- **Linux, macOS, or Windows with WSL2.** Native Windows shells are
  not supported.
- **git** to clone the repo.

Verify your install:

```bash
docker --version              # Docker version 24.x or later
docker compose version        # Docker Compose version v2.x
```

### Network

The default stack only needs **outbound** HTTPS:

| Destination | Purpose |
|---|---|
| `github.com` | Clone the repo |
| `registry-1.docker.io`, `ghcr.io` | Pull `postgres:16-alpine`, `mailhog`, etc. |
| Per-tenant LLM providers (anthropic, openai, gemini, …) | Only if you configure BYOK keys |

No inbound ports need to be exposed to the public internet unless you
choose to publish the dashboard.

### What you do NOT need

- A license key. There isn't one.
- A Docker Hub pull token. Images are public.
- A Tenant ID issued by Saluca. You manage your own tenants.
- A KEK / JWT signing key from a vendor. The bootstrap generates
  development defaults; you replace them when you go production.

## Step 1 — Clone

```bash
git clone https://github.com/salucallc/pantheon.git
cd pantheon
```

## Step 2 — Configure environment

```bash
cp .env.example .env
```

Edit `.env`. At minimum, set strong values for:

| Variable | Purpose |
|---|---|
| `POSTGRES_PASSWORD` | Internal Postgres password (default `platform` for dev — change for anything beyond local). |
| `SESSION_SECRET` | Signs session cookies. Must be at least 32 characters. Generate with `openssl rand -base64 48`. |
| `WEB_PUBLIC_URL` | Public URL of platform-web (e.g. `http://localhost:3000`). |
| `API_PUBLIC_URL` | Public URL of platform-api (e.g. `http://localhost:8000`). |

The full authoritative list of environment variables lives in
[`.env.example`](../../../.env.example) at the repo root. Every
service-level prefix (`SOULAUTH_*`, `SOULGATE_*`, the in-process
`@platform/auth` settings, the agent platform BYOK secrets) is
documented inline there.

## Step 3 — Start the stack

```bash
# Default profile: postgres + mailhog + platform-api + platform-web + memory-service
pnpm docker:up

# Or, if you don't have pnpm installed on the host:
docker compose up -d
```

Expected output (your service set may differ based on which profile
you select):

```
[+] Running 5/5
 ✔ Container pantheon-db-1              Started
 ✔ Container pantheon-mailhog-1         Started
 ✔ Container pantheon-memory-service-1  Started
 ✔ Container pantheon-platform-api-1    Started
 ✔ Container pantheon-platform-web-1    Started
```

First boot takes 30–60 seconds. The Postgres init runs alembic
migrations against both the `packages/database` tree (local-auth
schema) and the `apps/platform-api` tree (agent-platform schema). See
[`docs/operations/alembic-branches.md`](../../../docs/operations/alembic-branches.md)
for the dual-tree topology.

## Step 4 — Verify

```bash
# platform-api health
curl -s http://localhost:8000/health | jq .

# platform-web (dashboard)
curl -sI http://localhost:3000 | head -1
# → HTTP/1.1 200 OK

# Container status
docker compose ps
```

All containers should be `Up (healthy)`. Anything else: see
[`TROUBLESHOOTING.md`](TROUBLESHOOTING.md).

## Step 5 — First login

The `pnpm docker:up` flow runs the admin seed inside `platform-web` on
first boot. The seeded credentials are written to the container logs:

```bash
docker compose logs platform-web | grep -i "seeded admin"
```

Open the dashboard at `http://localhost:3000`, log in with those
credentials, and **change the password immediately** via Settings →
Account.

The dashboard URL structure (post-rename, see PR #139):

| Surface | Path |
|---|---|
| Per-OS landing pages | `http://localhost:3000/dashboard/<slug>` |
| Cross-OS audit log | `http://localhost:3000/dashboard/audit` |
| Per-user feature flags | `http://localhost:3000/dashboard/settings` |
| Agents / Prompts | `http://localhost:3000/dashboard/settings` (Agents + Prompts panes) |
| Provider keys (BYOK) | `http://localhost:3000/dashboard/settings` (Provider Keys pane) |

## Step 6 — Configure per-tenant BYOK keys

If your agents will call commercial LLM providers, register a BYOK
provider key per tenant. Step-by-step:
[`docs/operations/byok-provider-keys.md`](../../../docs/operations/byok-provider-keys.md).

Quick form:

```bash
export SOULKEY="sk_agent_…"     # mint via the portal or via seed-admin output
curl -X POST http://localhost:8000/v1/provider-keys \
  -H "X-SoulKey: $SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "anthropic",
    "secret_ref": "env://TENANT_ANTHROPIC_KEY",
    "status": "active"
  }'
```

The secret value never appears in any wire response — only the URI
ref (`env://TENANT_ANTHROPIC_KEY`) is stored, and resolution happens
at call time. Reserved schemes (`vault://`, `gcpsm://`, `awssm://`,
`enc://`) validate at write time but return a structured 400 until
implemented.

## Step 7 — Import your first agent

Pantheon's Wave-H agent platform ingests a unified `agent.yaml`
schema. Operator walkthrough:
[`docs/operations/agents-platform-quickstart.md`](../../../docs/operations/agents-platform-quickstart.md).
Schema reference:
[`../src/agents/agent_yaml_schema.md`](../src/agents/agent_yaml_schema.md).

## Going beyond local

Once the local stack is healthy:

- **Persistent data** — the `db_data` named volume holds Postgres
  state. Back it up before upgrades:
  ```bash
  docker run --rm -v pantheon_db_data:/data -v $(pwd):/backup \
    alpine tar czf /backup/pg-$(date +%F).tar.gz -C /data .
  ```
- **Upgrade** — `git pull && pnpm docker:up`. Migrations run
  automatically on boot.
- **Production-leaning container topology** —
  [`docs/operations/container-deployment.md`](../../../docs/operations/container-deployment.md)
  covers the `full` profile (adds Redis, platform-app-proxy,
  platform-sovereign, worker).
- **Federated auth** — the dashboard logs users in via SoulAuth
  (separate Python service, bcrypt). For local dev the bootstrap admin
  is sufficient; if you need to wire an LDAP / OIDC IdP, see
  [`docs/operations/soulauth-integration.md`](../../../docs/operations/soulauth-integration.md).
- **Agents store adapter** — by default the agent platform writes to
  the local Postgres. To point it at a managed Supabase project:
  [`docs/operations/store-adapter-config.md`](../../../docs/operations/store-adapter-config.md).

## Uninstall

```bash
# Stop services (keeps data)
docker compose down

# Stop + delete all data (irreversible)
docker compose down -v

# Also remove pulled images
docker compose down -v --rmi all
```

## Appendix — port reference

| Port | Service | Notes |
|---|---|---|
| 3000 | platform-web | Dashboard |
| 8000 | platform-api | FastAPI core + `/docs` |
| 8025 | mailhog | Web UI (dev SMTP capture) |
| 1025 | mailhog | SMTP |
| 5432 | postgres | Bound to host for dev convenience; firewall in prod |
| 8910 | memory-service | Memory sidecar |
| 8080 | tiresias-proxy (full profile) | App proxy with Cedar policy enforcement |

# platform-api Quickstart

A focused get-running path for the FastAPI core. For the full-repo
clone-to-running path (Postgres, platform-web, and friends) see
[`docs/operations/quickstart.md`](../../docs/operations/quickstart.md).

> **Windows users: WSL2 only.** Native Windows shells aren't supported
> for local development.

## Option A — docker compose (recommended)

The fastest path: bring up platform-api alongside its dependencies via
the repo-root compose stack. No license keys, no Docker Hub
authentication — Pantheon is local-first OSS.

```bash
# From the repo root
cp .env.example .env       # defaults work for local dev
pnpm docker:up             # postgres + mailhog + platform-api + platform-web

# Verify
curl http://localhost:8000/health
# → {"status":"healthy", ...}

# OpenAPI / interactive docs
open http://localhost:8000/docs

# Tail the API logs
docker compose logs -f platform-api
```

Full container-stack reference:
[`docs/operations/container-deployment.md`](../../docs/operations/container-deployment.md).

## Option B — bare metal (for iteration)

If you want hot reload + access to a Python REPL:

```bash
# From the repo root, one-time setup
pnpm bootstrap             # creates .venv, installs deps, runs migrations,
                           # seeds an admin user

# Start postgres separately
docker compose up -d db

# Activate the venv and run uvicorn
source .venv/bin/activate
cd apps/platform-api
python -m uvicorn src.main:app --reload --port 8000
```

You should now see the same `/docs` page on `http://localhost:8000`.

Full local-dev reference (alembic, seeding, troubleshooting):
[`docs/operations/local-development.md`](../../docs/operations/local-development.md).

## Verify it's working

### 1. Health

```bash
curl http://localhost:8000/health
# → {"status":"healthy","service":"platform-api","version":"…"}
```

### 2. Authenticate as the seeded admin (federated via SoulAuth)

Portal logins federate through SoulAuth (a separate Python service).
For raw API calls, mint a SoulKey from the portal at
`http://localhost:3000/dashboard/settings` (Settings → Agents) or use
the seeded admin SoulKey written to `.local/seed-admin.out` after
`pnpm bootstrap`.

```bash
export SOULKEY="sk_agent_…"
curl http://localhost:8000/v1/auth/whoami -H "X-SoulKey: $SOULKEY"
```

The SoulAuth vs `@platform/auth` distinction confuses people coming
from older Tiresias-era docs — see
[`docs/operations/soulauth-integration.md`](../../docs/operations/soulauth-integration.md)
for the full picture.

### 3. Import an agent from YAML

The Wave-H agent platform accepts a unified `agent.yaml` bulk import
format. Canonical schema:
[`src/agents/agent_yaml_schema.md`](src/agents/agent_yaml_schema.md).

```bash
cat > /tmp/research-coach.yaml <<'EOF'
metadata:
  persona: research-coach
  name: Research Coach
  description: Helps with literature reviews
  tags: [research]

spec:
  prompt:
    name: research-coach-prompt
    body: |
      You are a research coach. Help the user with literature reviews.
    status: active

  provider_overrides:
    - provider: anthropic
      secret_ref: env://TENANT_ANTHROPIC_KEY
      status: active
EOF

curl -X POST http://localhost:8000/v1/agents/import \
  -H "X-SoulKey: $SOULKEY" \
  -H "Content-Type: text/yaml" \
  --data-binary @/tmp/research-coach.yaml
```

Operator-level walkthrough (curl + portal):
[`docs/operations/agents-platform-quickstart.md`](../../docs/operations/agents-platform-quickstart.md).

### 4. Hit the OpenAPI surface

`http://localhost:8000/docs` lists every router with try-it-out forms.
Notable mount points:

| Path | Auth | Purpose |
|---|---|---|
| `/v1/auth/whoami` | `X-SoulKey` | Resolve caller identity + permission summary |
| `/v1/agents` | `agents:read/write` | CRUD over tenant agents |
| `/v1/prompts` | `prompts:read/write` | Versioned prompt bodies |
| `/v1/agents/import` | `agents:write` | Bulk import (YAML / JSON / multipart) |
| `/v1/provider-keys` | `providers:read/write` | Per-tenant BYOK provider keys |
| `/v1/agents-store/config` | `policy:read` | Switch agents store between LocalPg and Supabase |

## Where to look when things break

| Symptom | First place to look |
|---|---|
| `platform-api` won't start | [`deploy/TROUBLESHOOTING.md`](deploy/TROUBLESHOOTING.md) → "platform-api won't start" |
| `alembic` errors | [`docs/operations/alembic-branches.md`](../../docs/operations/alembic-branches.md) |
| `agent.yaml import` returns validation errors | [`src/agents/agent_yaml_schema.md`](src/agents/agent_yaml_schema.md) error reference |
| BYOK provider key fails its probe | [`docs/operations/byok-provider-keys.md`](../../docs/operations/byok-provider-keys.md) → "Resolution failures" |
| Login works in portal but `X-SoulKey` calls 401 | [`docs/operations/soulauth-integration.md`](../../docs/operations/soulauth-integration.md) — federated vs SoulKey are different paths |
| Agents-store flip fails | [`docs/operations/store-adapter-config.md`](../../docs/operations/store-adapter-config.md) |
| Container logs | `docker compose logs -f platform-api` |

## Next steps

- [README](README.md) — what platform-api is and how it fits with the rest of Pantheon
- [Self-host install reference](deploy/INSTALL.md)
- [Architecture overview](../../docs/architecture/system-overview.md)
- [`agent.yaml` schema](src/agents/agent_yaml_schema.md)

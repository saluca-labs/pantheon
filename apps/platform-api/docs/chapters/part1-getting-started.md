# Part I: Getting Started

> **Pantheon Administrator Guide — Chapter**
> **Audience:** Self-hosters bringing up Pantheon for the first time

For a fast 15-minute path see
[`docs/operations/quickstart.md`](../../../../docs/operations/quickstart.md);
this chapter is the in-depth admin-guide version of the same flow,
covering the choices you'll make during setup.

---

## 1.1 Prerequisites

| Component | Minimum | Notes |
|---|---|---|
| Docker Engine | 24.0 | Compose v2.20+ ships with it. |
| Docker Compose plugin | v2.20 | `docker compose version` |
| pnpm | 9.0 | `corepack enable && corepack prepare pnpm@9 --activate` |
| Node.js | 20 LTS | Required for the platform-web BFF tooling. |
| Python | 3.12 | Optional locally — only needed if you skip docker for platform-api dev. |
| Disk | 20 GB | Postgres volume + image cache. |
| RAM | 4 GB | 8 GB recommended for comfortable dev. |

You do not need a license key, a paid plan, or any external SaaS
account. Pantheon is local-first by default.

## 1.2 Clone and bootstrap

```bash
git clone https://github.com/salucallc/pantheon.git
cd pantheon
cp .env.example .env
```

Edit `.env`:

- `SESSION_SECRET` — must be at least 32 chars. Generate with
  `openssl rand -base64 48`.
- `POSTGRES_PASSWORD` — pick something reasonable.
- Provider keys are **optional** at this stage. Leave them unset; you
  can add per-tenant BYOK keys from the dashboard later (see
  [BYOK provider keys](../../../../docs/operations/byok-provider-keys.md)).

Bootstrap and bring the stack up:

```bash
pnpm bootstrap
pnpm docker:up
```

Bootstrap installs JS dependencies, sets up the Python venv, runs the
database migrations against the freshly-started Postgres, and seeds an
admin user. The seeded admin credentials are printed at the end of
`pnpm bootstrap`.

## 1.3 First login

After ~60 seconds:

- platform-api: `http://localhost:8000` — `/health`, `/docs` (Swagger)
- platform-web: `http://localhost:3000` — login form

Sign in with the seeded admin credentials. You land on `/dashboard`.
Tour the shell per [`USER_GUIDE.md`](../USER_GUIDE.md).

## 1.4 Configure your first provider key

Pantheon ships with no provider keys configured. To run any agent
backed by a hosted LLM:

1. Set a secret in `.env`, e.g. `TENANT_ANTHROPIC_KEY=sk-ant-…`.
2. Forward it into the platform-api container — either by editing
   `docker-compose.override.yml` (gitignored) to include
   `environment: { TENANT_ANTHROPIC_KEY: ${TENANT_ANTHROPIC_KEY} }`,
   or by adding it to the `.env` file the compose service already reads.
3. `docker compose up -d platform-api` so the new env is loaded.
4. In the dashboard, go to `/dashboard/settings` → Provider Keys →
   New Key. Pick `anthropic`, paste `env://TENANT_ANTHROPIC_KEY` as
   the secret-ref, hit Save, then Test.

Full reference:
[`docs/operations/byok-provider-keys.md`](../../../../docs/operations/byok-provider-keys.md).

## 1.5 Import your first agent

The agent platform accepts YAML imports for bulk creation:

```bash
export SOULKEY="sk_agent_…"  # from the seed-admin output

cat > /tmp/coach.yaml <<'EOF'
metadata:
  persona: research-coach
  name: Research Coach
spec:
  prompt:
    name: research-coach-prompt
    body: |
      You are a research coach. Help the user write better literature
      reviews. Cite sources.
EOF

curl -X POST http://localhost:8000/v1/agents/import \
  -H "X-SoulKey: $SOULKEY" \
  -H "Content-Type: text/yaml" \
  --data-binary @/tmp/coach.yaml
```

Or use the dashboard: `/dashboard/settings` → Agents → paste YAML →
Preview → Commit. Full reference:
[`docs/operations/agents-platform-quickstart.md`](../../../../docs/operations/agents-platform-quickstart.md).

## 1.6 Where to go next

- [`USER_GUIDE.md`](../USER_GUIDE.md) — dashboard tour
- [`AGENTS_GUIDE.md`](../AGENTS_GUIDE.md) — Agents + Prompts deep-dive
- [`AGENTIC_OS_TOUR.md`](../AGENTIC_OS_TOUR.md) — the nine OS modules
- Part 2 → `part2-auth-access.md` — auth and access control
- Part 3 → `part3-agent-security.md` — agent platform details
- Part 6 → `part6-observability.md` — observability surfaces
- Part 10 → `part10-reference.md` — env var + endpoint reference

# platform-api

FastAPI core for Pantheon. Hosts SoulKey agent authentication, the
Wave-H agent platform (`/v1/agents`, `/v1/prompts`, `/v1/agents/import`,
per-tenant BYOK provider keys), the policy decision point, and the
audit log.

> Historical note: this codebase shipped previously as "Tiresias
> Platform v3.x" with an enterprise-SaaS framing (license keys, partner
> program, tier gating). The repo has been renamed to Pantheon and
> reoriented around local-first OSS deployment. The `tiresias`
> code namespace (`apps/platform-app-proxy/`, `apps/platform-api/src/tiresias/`,
> the `tiresias-proxy` service) stays Tiresias-branded by design — see
> [`apps/platform-app-proxy/README.md`](../platform-app-proxy/README.md).

## What this service does

- **SoulKey agent auth** — `X-SoulKey` header, SHA-512 hashed credentials,
  per-tenant scoping. Code in [`src/auth/soulkey.py`](src/auth/soulkey.py).
- **Agent platform (Wave H)** — CRUD over agents and prompts,
  `agent.yaml` bulk import, per-tenant BYOK provider keys, configurable
  agents store adapter. See:
  - [`src/agents/agent_yaml_schema.md`](src/agents/agent_yaml_schema.md)
    — canonical schema for `POST /v1/agents/import`
  - [`docs/operations/agents-platform-quickstart.md`](../../docs/operations/agents-platform-quickstart.md)
    — operator walkthrough
- **Policy decision point** — YAML policy evaluation, capability tokens
  (short-lived ES256 JWTs), JIT scopes.
- **Audit log** — `audit_events` table for auth/compliance,
  [`docs/security/audit-trail.md`](../../docs/security/audit-trail.md)
  for the boundary with the per-OS `agos_audit` stream.
- **Federated identity** — SoulAuth (a separate Python service with its
  own bcrypt-backed user DB) federates portal logins into platform-api;
  see [`docs/operations/soulauth-integration.md`](../../docs/operations/soulauth-integration.md).

## Endpoint surfaces

| Surface | Mount | Auth | Notes |
|---|---|---|---|
| Agent identity / PDP | `/v1/auth/*` | `X-SoulKey` | `whoami`, `evaluate`, `escalate`, `delegate` |
| Agents CRUD | `/v1/agents/*` | `agents:read` / `agents:write` | List, create, patch, soft-delete |
| Prompts CRUD | `/v1/prompts/*` | `prompts:read` / `prompts:write` | Append-only versioning, resolve-by-name |
| Bulk import | `POST /v1/agents/import` | `agents:write` | YAML / JSON / multipart; per-agent atomic |
| BYOK provider keys | `/v1/provider-keys/*` | `providers:read` / `providers:write` | Anthropic / OpenAI / Gemini / Groq / Ollama |
| Agents store config | `/v1/agents-store/*` | `policy:read` | LocalPg or Supabase adapter |
| OpenAPI docs | `/docs` | none | Swagger UI |
| Health | `/health` | none | `?detail=true` for component health |

## Run it (self-host)

This service ships inside the Pantheon docker compose stack. The
authoritative path for a fresh checkout is the repo-root
[`docs/operations/quickstart.md`](../../docs/operations/quickstart.md);
the per-service quickstart is [`QUICKSTART.md`](QUICKSTART.md) in this
directory.

```bash
# From the repo root
cp .env.example .env
pnpm docker:up
# platform-api is now on http://localhost:8000
curl http://localhost:8000/health
open http://localhost:8000/docs
```

Run the test suite:

```bash
source .venv/bin/activate
cd apps/platform-api
pytest
```

## Agents store adapter

The agent + prompt store is **adapter-pluggable**. Two adapters ship:

- **LocalPg** (default) — writes to the same Postgres instance that
  hosts the rest of platform-api. Zero extra setup.
- **Supabase** — writes to a managed Supabase project via the
  service-role key. The key is referenced via `env://VAR_NAME` (never
  stored inline).

The selection lives in `_pantheon_config` and is editable from the
portal at `/dashboard/settings` (Agents Store) or via `POST
/v1/agents-store/config`. Full walk-through:
[`docs/operations/store-adapter-config.md`](../../docs/operations/store-adapter-config.md).

## Per-tenant BYOK

Each tenant supplies its own provider API keys via `POST
/v1/provider-keys` (or via `spec.provider_overrides` inside an
`agent.yaml` bulk import). Pantheon supports `env://VAR_NAME` secret
refs out of the box; `vault://`, `gcpsm://`, `awssm://`, and `enc://`
are reserved schemes that validate but are not yet implemented (they
return a structured 400 with the path of the offending field). Full
operator guide:
[`docs/operations/byok-provider-keys.md`](../../docs/operations/byok-provider-keys.md).

## Code layout

```
apps/platform-api/
├── src/
│   ├── main.py            FastAPI app factory + router wiring
│   ├── agents/            Wave-H agent platform (CRUD, import, BYOK, store factory)
│   ├── auth/              SoulKey verification, RBAC, federated SoulAuth client
│   ├── policy/            PDP, YAML loader, capability tokens
│   ├── audit/             audit_events writer
│   ├── tiresias/          Tiresias app-proxy adapter (legacy-branded by design)
│   └── …
├── alembic/               Migrations for platform-api's own schema
├── deploy/
│   ├── docker-compose.production.yml
│   ├── INSTALL.md         Self-host install reference
│   └── TROUBLESHOOTING.md Failure-mode reference
├── tests/                 pytest suite
├── README.md              this file
├── QUICKSTART.md          self-host quickstart
├── CHANGELOG.md
├── SECURITY.md            vuln disclosure policy
└── pyproject.toml
```

## Documentation

**Self-host operations (start here):**
- [Quickstart (15-min)](../../docs/operations/quickstart.md)
- [Local development](../../docs/operations/local-development.md)
- [Container deployment](../../docs/operations/container-deployment.md)
- [Agents platform quickstart](../../docs/operations/agents-platform-quickstart.md)
- [BYOK provider keys](../../docs/operations/byok-provider-keys.md)
- [Agents store adapter config](../../docs/operations/store-adapter-config.md)
- [SoulAuth federated integration](../../docs/operations/soulauth-integration.md)

**Architecture:**
- [System overview](../../docs/architecture/system-overview.md)
- [Module boundaries](../../docs/architecture/module-boundaries.md)
- [Alembic dual-tree topology](../../docs/operations/alembic-branches.md)
- [Cross-OS audit log](../../docs/architecture/audit-log.md)

**Reference:**
- [`agent.yaml` schema](src/agents/agent_yaml_schema.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

## License

See [LICENSE](LICENSE).

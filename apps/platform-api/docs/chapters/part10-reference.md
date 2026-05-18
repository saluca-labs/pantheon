# Part X: Reference

> **Pantheon Administrator Guide — Reference Appendix**
> **Audience:** Self-hosters; tab-complete reference for env vars and endpoints

The reference appendix. For prose chapters see Parts I–VI; for
end-user views see [`USER_GUIDE.md`](../USER_GUIDE.md) and
[`AGENTS_GUIDE.md`](../AGENTS_GUIDE.md).

---

## X.1 Environment variables

Tables below cover variables that ship in `.env.example`. Per-service
defaults live alongside the service's own settings module — see
`apps/platform-api/src/config.py` (et al.) for code-level defaults.

### Core platform-api

| Variable | Type | Default | Notes |
|---|---|---|---|
| `POSTGRES_HOST` | string | `db` | docker compose service name |
| `POSTGRES_PORT` | int | `5432` | |
| `POSTGRES_USER` | string | `pantheon` | |
| `POSTGRES_PASSWORD` | string | _(required)_ | Set in `.env` |
| `POSTGRES_DB` | string | `pantheon` | |
| `DATABASE_URL` | string | _(derived)_ | Overrides the above if set |
| `SESSION_SECRET` | string | _(required)_ | 32+ chars; `openssl rand -base64 48` |
| `API_PUBLIC_URL` | string | `http://localhost:8000` | External URL for platform-api |
| `WEB_PUBLIC_URL` | string | `http://localhost:3000` | External URL for platform-web |
| `PANTHEON_ENV` | string | `dev` | `dev` / `production` |
| `LOG_LEVEL` | string | `info` | `debug`, `info`, `warning`, `error` |
| `LOG_FORMAT` | string | `json` | `json` or `text` |

### SoulAuth (auth service inside platform-api)

| Variable | Type | Default | Notes |
|---|---|---|---|
| `SOULAUTH_JWT_ALGORITHM` | string | `ES256` | EC P-256 |
| `SOULAUTH_JWT_ISSUER` | string | `pantheon` | |
| `SOULAUTH_CAPABILITY_TOKEN_TTL_SEC` | int | `600` | 300–900 range |
| `SOULAUTH_LDAP_ENABLED` | bool | `false` | |
| `SOULAUTH_LDAP_URL` | string | _(none)_ | e.g. `ldaps://ad.example.com:636` |
| `SOULAUTH_LDAP_BIND_DN` | string | _(none)_ | |
| `SOULAUTH_LDAP_BIND_PASSWORD` | string | _(none)_ | |
| `SOULAUTH_LDAP_USER_BASE_DN` | string | _(none)_ | |
| `SOULAUTH_LDAP_USER_FILTER` | string | `(uid={username})` | |
| `SOULAUTH_OIDC_ENABLED` | bool | `false` | Per-IdP config via `/v1/idp/` |
| `SOULAUTH_SESSION_COOKIE_NAME` | string | `pantheon_session` | |
| `SOULAUTH_SESSION_COOKIE_SECURE` | bool | `true` in production | |

### Agents store adapter

| Variable | Type | Default | Notes |
|---|---|---|---|
| `AGENTS_STORE_ADAPTER` | string | `local_pg` | Override; usually set via portal |
| `AGENTS_STORE_SUPABASE_URL` | string | _(none)_ | Required when adapter = supabase |
| `AGENTS_STORE_SUPABASE_SERVICE_KEY` | string | _(none)_ | `env://VAR_NAME` ref preferred |

Full mechanics: [`docs/operations/store-adapter-config.md`](../../../../docs/operations/store-adapter-config.md).

### BYOK provider keys (operator-supplied per-tenant)

These are not platform-api env vars per se — they are the secrets
referenced by `env://VAR_NAME` from `_tenant_provider_keys` rows.
By convention:

| Variable | Provider |
|---|---|
| `TENANT_ANTHROPIC_KEY` | anthropic |
| `TENANT_OPENAI_KEY` | openai |
| `TENANT_GEMINI_KEY` | gemini |
| `TENANT_GROQ_KEY` | groq |

Multi-tenant deployments typically use per-tenant variable names
(e.g. `TENANT_<UUID>_ANTHROPIC_KEY`). The schema validator does not
enforce the naming convention; it only resolves the URI you give it.

Full reference: [`docs/operations/byok-provider-keys.md`](../../../../docs/operations/byok-provider-keys.md).

### platform-web

| Variable | Type | Default | Notes |
|---|---|---|---|
| `NEXTAUTH_SECRET` | string | _(required)_ | Used by the BFF auth helpers |
| `INTERNAL_API_KEY` | string | _(required)_ | platform-web → platform-api |
| `NEXT_PUBLIC_API_URL` | string | `http://localhost:8000` | Client-side API base |

## X.2 Endpoint reference (platform-api)

The authoritative reference is Swagger at `http://localhost:8000/docs`.
A non-exhaustive index of the surfaces that ship today:

### Auth surface (`/v1/auth/*`, `/v1/soulauth/*`)

| Method | Path | Notes |
|---|---|---|
| `POST` | `/v1/auth/local/login` | Email/password |
| `POST` | `/v1/auth/local/reset-password` | Self-service reset |
| `POST` | `/v1/auth/ldap/login` | LDAP / AD |
| `GET` | `/v1/auth/oidc/authorize` | OIDC redirect |
| `GET` | `/v1/auth/oidc/callback` | OIDC callback |
| `GET` | `/v1/auth/whoami` | Resolve identity |
| `POST` | `/v1/auth/evaluate` | PDP evaluate |
| `POST` | `/v1/auth/escalate` | Delegated escalation request |
| `POST` | `/v1/soulauth/admin/keys` | Issue SoulKey |
| `PATCH` | `/v1/soulauth/admin/keys/{id}` | Suspend / rotate / revoke |
| `POST` | `/v1/idp/` | Configure OIDC IdP |

### Agent platform (W-H)

See Part 3 (`part3-agent-security.md`) for the full table.

### Tenant / user / team

| Method | Path | Permission |
|---|---|---|
| `GET` | `/v1/tenants` | `tenants:read` |
| `POST` | `/v1/tenants` | `tenants:create` |
| `GET` | `/v1/users` | `users:read` |
| `POST` | `/v1/users/invite` | `users:create` |
| `GET` | `/v1/teams` | `teams:read` |
| `POST` | `/v1/teams` | `teams:create` |

### Audit + observability

| Method | Path | Permission |
|---|---|---|
| `GET` | `/v1/audit/events` | `audit:read` |
| `GET` | `/v1/agos/audit` | `audit:read` |
| `GET` | `/health` | none |
| `GET` | `/metrics` | none (Prometheus exposition) |
| `GET` | `/docs` | none (Swagger) |

## X.3 Database schema map

Top-level tables and what they hold. Detailed Alembic chain is in
[`docs/operations/alembic-branches.md`](../../../../docs/operations/alembic-branches.md).

| Table | Owner |
|---|---|
| `_soul_tenants` | SoulAuth |
| `_soulauth_users` | SoulAuth |
| `_soulauth_sessions` | SoulAuth |
| `_soulauth_soulkeys` | SoulAuth |
| `_soulauth_idp` | SoulAuth |
| `audit_events` | platform-api core |
| `_agos_*` | per-OS schemas (auditing, plus per-OS tables) |
| `_agos_agents` | agent platform |
| `_agos_prompts` | agent platform |
| `_tenant_provider_keys` | agent platform |
| `_pantheon_config` | platform-api core (store adapter config) |
| `_role_permissions` | RBAC overrides (extends defaults) |

## X.4 Deprecation history

| Surface | Status | Notes |
|---|---|---|
| `@platform/auth` Argon2id local-auth | **Live (OSS / fallback path)** | Co-exists with SoulAuth federated. SoulAuth is the primary path when configured; `@platform/auth` is the OSS default and the no-cookie fallback. See `docs/security/auth-model.md` for the dual-track posture. |
| Tier-gating (`TierGate`, `feature_gate`) | **Removed from OSS surface** | All features available in every deployment. |
| `TIRESIAS_LICENSE_KEY` | **Removed** | Pantheon does not require a license. |
| RSA JWT signing | **Replaced by ES256** | EC P-256 keys via `SOULAUTH_JWT_ALGORITHM=ES256` |
| Tiresias partner / MSSP layer | **Removed from OSS** | Code archived. |
| `SOULAUTH_MODE=local` SQLite | **Not supported** | docker compose runs Postgres by default. SQLite was a Tiresias-era dev-mode toggle. |

## See also

- [`docs/operations/quickstart.md`](../../../../docs/operations/quickstart.md)
- [`docs/operations/local-development.md`](../../../../docs/operations/local-development.md)
- [`docs/operations/container-deployment.md`](../../../../docs/operations/container-deployment.md)
- [`docs/architecture/system-overview.md`](../../../../docs/architecture/system-overview.md)
- Swagger UI: `http://localhost:8000/docs`

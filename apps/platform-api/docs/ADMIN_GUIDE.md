# Pantheon Administrator Guide

For a local-first OSS deployment, "administrator" is usually the same
person who runs `pnpm bootstrap`. This guide collapses the historical
11-chapter SaaS admin guide into the five things a self-hoster
actually does: get the platform up, manage users, watch it run, back
it up, and fix it when it breaks.

> **Audience.** Self-hosters running Pantheon on their own
> infrastructure (laptop, homelab, single-tenant VPS, GKE). For
> dashboard tours aimed at end users see [`USER_GUIDE.md`](USER_GUIDE.md);
> for the agent + prompt surfaces see [`AGENTS_GUIDE.md`](AGENTS_GUIDE.md).

## 1. Setup

The authoritative path for a fresh checkout is
[`docs/operations/quickstart.md`](../../../docs/operations/quickstart.md).
At its core:

```bash
git clone https://github.com/salucallc/pantheon.git
cd pantheon
cp .env.example .env
# edit .env — SESSION_SECRET must be 32+ chars, openssl rand -base64 48
pnpm bootstrap
pnpm docker:up
```

After ~60 seconds:

- platform-api on `http://localhost:8000` (`/docs` for Swagger)
- platform-web on `http://localhost:3000`
- seeded admin user (email + password printed by `pnpm bootstrap`)

For deeper deployment topics, see
[`docs/operations/container-deployment.md`](../../../docs/operations/container-deployment.md)
and the per-service install reference in
[`apps/platform-api/deploy/INSTALL.md`](../deploy/INSTALL.md).

There is no license key, no tier gate, no required external service.
Supabase is supported as one of two store adapters but never required;
the LocalPg adapter (default) writes to the same Postgres that hosts
the rest of platform-api.

## 2. User management

Production user auth is **SoulAuth federated**. The single-page
explainer is
[`docs/operations/soulauth-integration.md`](../../../docs/operations/soulauth-integration.md);
for this admin guide, what you need to know is:

- The dashboard's login form authenticates against SoulAuth.
- SoulAuth supports local accounts (email + password, bcrypt), LDAP /
  Active Directory, and OIDC (Google or generic). Federated users are
  JIT-provisioned on first successful login.
- platform-api validates session cookies by calling SoulAuth and pins
  the resolved user + tenant into the request context.
- Agents (machine callers) skip user auth entirely and present
  `X-SoulKey: sk_agent_…` directly.

### Adding more local users

For a single self-hoster, the seeded admin is enough. To add more
local users:

1. Sign in as the admin.
2. Open `/dashboard/settings` (Users tab).
3. Send an invite (email-based). The invitee sets their own password
   on first login.

Both user-auth paths are live: SoulAuth uses **bcrypt** for the
federated path described above; `@platform/auth` Argon2id is the
OSS / fallback path that fires when no SoulAuth session is present.
See [`docs/security/auth-model.md`](../../../docs/security/auth-model.md)
for the full posture.

### Enabling federated IdPs (LDAP / OIDC)

Set environment variables on the platform-api container, then restart:

```
SOULAUTH_LDAP_ENABLED=true
SOULAUTH_LDAP_URL=ldaps://ad.example.com:636
SOULAUTH_LDAP_BIND_DN=cn=ldap-service,…
SOULAUTH_LDAP_BIND_PASSWORD=…
SOULAUTH_LDAP_USER_BASE_DN=ou=people,…
SOULAUTH_LDAP_USER_FILTER=(uid={username})
```

For OIDC, set `SOULAUTH_OIDC_ENABLED=true` and configure the IdP via
the `/v1/idp/` management endpoints. The full reference is in
[`soulauth-integration.md`](../../../docs/operations/soulauth-integration.md).

### RBAC

Pantheon ships a 5-role RBAC model wired through the SoulKey: `owner`,
`admin`, `operator`, `viewer`, `auditor`. The permission set per role
is defined in [`apps/platform-api/src/auth/rbac.py`](../src/auth/rbac.py);
the per-permission breakdown for the agent / prompt / provider
surfaces is in [`drilldowns/rbac-permission-matrix.md`](drilldowns/rbac-permission-matrix.md).

## 3. Observability

Pantheon ships three observability surfaces:

| Surface | What it shows | Where |
|---|---|---|
| `audit_events` | Auth + compliance trail (logins, key issuance, RBAC changes). | `/dashboard/audit` |
| `agos_audit` | Per-OS user-attributable side effects (writes, deploys, exports). | `/dashboard/cyber` and per-OS audit panes |
| Prometheus `/metrics` | Per-service request counts, latencies, error rates. | scrape from `platform-api:8000/metrics` |

The boundary between `audit_events` and `agos_audit` is documented in
[`docs/security/audit-trail.md`](../../../docs/security/audit-trail.md).

A working baseline scrape job (Prometheus + Grafana) ships in
`infrastructure/grafana/` for self-hosters who want a dashboard
without writing one. The default Pantheon dashboard pages render the
same data without any extra setup.

For the per-OS health surface in CI, see
[`docs/operations/smoke-matrix.md`](../../../docs/operations/smoke-matrix.md).

## 4. Backup and restore

Pantheon's state lives in one Postgres database (plus the SoulAuth
federated user DB, if you've split that out — by default it
co-locates in the same Postgres).

### What to back up

| Data | Tables | Notes |
|---|---|---|
| platform-api | most | All `_agos_*`, `_soulauth_*`, `audit_events`, `_agos_audit`, `_tenant_provider_keys`, `_soul_tenants`. Single `pg_dump` covers it. |
| Secrets | none (file-based) | `.env` is gitignored; back it up out of band. Same for `docker-compose.override.yml`. |
| Uploaded artifacts | filesystem | Anything written to a docker volume (e.g. plan PDFs, exports). |

### Daily nightly dump

```bash
docker compose exec -T db \
  pg_dump -U pantheon pantheon \
  | gzip > backups/pantheon-$(date -u +%Y%m%d).sql.gz
```

### Restore

```bash
gunzip -c backups/pantheon-20260517.sql.gz \
  | docker compose exec -T db psql -U pantheon pantheon
```

For deployments that have flipped the Agents Store to the Supabase
adapter, the `_agos_agents`, `_agos_prompts`, and related tables live
in Supabase; back them up via Supabase's own snapshot mechanism. The
canonical config of which adapter is active is in `_pantheon_config`
in the LocalPg side. Full mechanics:
[`docs/operations/store-adapter-config.md`](../../../docs/operations/store-adapter-config.md).

## 5. Troubleshooting

The canonical failure-mode reference is
[`apps/platform-api/deploy/TROUBLESHOOTING.md`](../deploy/TROUBLESHOOTING.md)
(refreshed in Wave I.1). It covers:

- platform-web won't start (env, native modules, BFF connection)
- platform-api migrations / startup
- SoulAuth federated auth confusion (the single most common
  contributor question)
- `agent.yaml` import error catalog
- Provider key resolution failures
- Store adapter config issues

For a flow-chart-style approach to the same problems, see
[`drilldowns/troubleshooting-flowcharts.md`](drilldowns/troubleshooting-flowcharts.md).

## See also

- [`USER_GUIDE.md`](USER_GUIDE.md) — end-user dashboard tour
- [`AGENTS_GUIDE.md`](AGENTS_GUIDE.md) — Agents + Prompts surface
- [`AGENTIC_OS_TOUR.md`](AGENTIC_OS_TOUR.md) — what each OS module does
- [`PLATFORM_OVERVIEW.md`](PLATFORM_OVERVIEW.md) — one-page overview
- [`chapters/`](chapters/) — longer-form per-area chapters
- [`drilldowns/`](drilldowns/) — operator drill-downs (deployment, RBAC, troubleshooting)
- [`docs/operations/`](../../../docs/operations/) — self-host operational guides

# SoulAuth Federated Integration

Pantheon has **two distinct authentication paths**, and the
distinction matters for self-hosters. This doc clarifies which one is
production, which one is legacy, and what to do when the docs
disagree.

> **TL;DR.** Production user auth is **SoulAuth federated** (separate
> Python service, separate Cloud SQL database, bcrypt password
> hashes). The `@platform/auth` Argon2id layer in platform-web is
> **legacy / dead code** that predates the federated split. If you see
> docs that say "Argon2id is the production password hash", treat them
> as stale.

## The two auth paths, side by side

|  | SoulAuth federated (production) | `@platform/auth` (legacy / dead) |
|---|---|---|
| **Service** | Separate Python service. | In-process inside platform-web (Next.js BFF) and a Python sibling in `packages/auth/python`. |
| **User DB** | Separate Postgres DB; tables prefixed `_soulauth_*` (`_soulauth_users`, `_soulauth_sessions`, `_soulauth_idp`). | Pantheon's main Postgres; tables `users`, `password_credentials`, `sessions`. |
| **Password hash** | bcrypt. | Argon2id (parameters in [`docs/security/auth-model.md`](../security/auth-model.md)). |
| **Token surface** | Session cookies for users + SoulKeys for agents (ES256 JWT capability tokens for short-lived per-resource grants). | Session cookies only (CSRF via double-submit, see auth-model.md). |
| **Federated IdP support** | LDAP / Active Directory, OIDC (Google, generic), JIT provisioning. | None — local accounts only. |
| **Status** | **Production.** This is what runs in `pantheon.saluca.com` and what self-hosters should configure. | **Legacy.** Code path exists; tables exist; not the live path. Treat as a reference implementation that predates the federated split. |

The dead-code status of `@platform/auth` is the most common source of
confusion for new contributors and self-hosters. The argon2 reference
in `README.md` and in `docs/security/auth-model.md` describes the
in-platform-web layer — which is **not** the path your portal users
take. Until `auth-model.md` is rewritten under Wave I.3, treat that
document as historical.

## Posture for self-hosters

For local docker compose deployments, SoulAuth runs in the same
compose stack as the rest of Pantheon. The seeded admin from
`pnpm bootstrap` lands in SoulAuth's user table; the dashboard's login
form authenticates against SoulAuth, which then federates identity
into platform-api's request context (via a session cookie that
platform-api validates by calling SoulAuth).

You do not need to provision an external IdP for local use. To enable
LDAP or OIDC for a production self-host, see "Enabling federated
identity providers" below.

## Where SoulAuth lives in the repo

| Path | Notes |
|---|---|
| `apps/platform-api/src/auth/soulauth.py` | The SoulAuth client used by platform-api to validate session cookies and resolve user identity. |
| `apps/platform-api/src/auth/soulkey.py` | SoulKey (agent credential) verification. Separate from federated user auth. |
| `apps/platform-api/alembic/versions/0001_*.py` onwards | `_soulauth_*` table migrations. |
| `apps/platform-web/src/lib/auth/` | Next.js BFF auth helpers — includes the legacy `@platform/auth` integration. The production flow uses SoulAuth's session cookie, not the local one. |
| `packages/auth/` | The legacy `@platform/auth` package (TypeScript + Python halves). Still imported but not the production path. |

A separate SoulAuth service exists outside the repo for Cristian's
production GCP deployment; for OSS self-hosting, the relevant code is
the SoulAuth router mounted inside platform-api, which exposes the
federated auth endpoints under `/v1/auth/*`.

## Federated auth in the request path

```
┌──────────┐  1. login form     ┌──────────────┐ 2. POST /v1/auth/local/login
│  Browser │ ──────────────────▶│ platform-web │ ─────────────────────────┐
└──────────┘                    └──────────────┘                          │
      ▲                                ▲                                  │
      │ 5. session cookie set          │ 4. session cookie returned       ▼
      │                                │                          ┌──────────────┐
      │                                └──────────────────────────│  SoulAuth    │
      │                                                           │ (in platform │
      │                                                           │  -api / sep- │
      │ 6. next request w/ cookie                                 │  arate svc)  │
      └─▶┌──────────────┐  7. /api/* call w/ cookie               └──────────────┘
         │ platform-web │ ─────────────────────────▶┌──────────────┐
         └──────────────┘                           │ platform-api │
                                                    │ validates    │
                                                    │ via SoulAuth │
                                                    └──────────────┘
```

Key facts:

- The session cookie is **SoulAuth's**, not the legacy
  `@platform/auth` one.
- Every `/api/*` BFF route on platform-web forwards the cookie to
  platform-api.
- platform-api validates the cookie by calling SoulAuth, and pins the
  resolved user + tenant into `request.state` for the duration of the
  request.
- Agents (machine callers) skip this entirely and present
  `X-SoulKey: sk_agent_…` directly to platform-api. See
  [`agents-platform-quickstart.md`](agents-platform-quickstart.md).

## Common confusions

### "I logged in successfully but my API call returns 401"

You're authenticated as a **user** (SoulAuth session cookie) but the
API call uses `X-SoulKey`, which is the **agent** auth path. Mint a
SoulKey via Settings → Agents → New SoulKey, or via:

```bash
curl -X POST http://localhost:8000/v1/soulauth/admin/keys \
  -H "Cookie: $SOULAUTH_SESSION_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "<your-tenant-uuid>",
    "persona_id": "operator",
    "label": "operator key",
    "metadata": {"role": "agent"}
  }'
```

User-session and agent-SoulKey auth are **different surfaces**. Don't
expect either to convert into the other.

### "The docs say argon2 — is that what I configure?"

No. `@platform/auth` Argon2id is the legacy layer. SoulAuth is bcrypt.
You do not configure password hashing for SoulAuth — it's a default,
not a knob. If you need to change it, the change happens inside the
SoulAuth service, not via environment variables on the Pantheon
container.

### "Can I disable SoulAuth and use just `@platform/auth`?"

Not supported. The dashboard's auth flow assumes SoulAuth session
cookies and platform-api's request context assumes SoulAuth-resolved
identity. Running Pantheon against `@platform/auth` alone would
require code changes across both platform-web BFF routes and
platform-api middleware.

### "My federated SoulAuth user can log in but has no organization"

The federated user wasn't mapped to a tenant in `_soul_tenants`. For
local dev, re-run the admin seed:

```bash
docker compose exec platform-api python scripts/seed-admin.py
```

For production, the mapping happens via JIT provisioning during the
federated login flow — verify that your IdP provider is wired to
issue group/tenant claims that SoulAuth understands.

## Enabling federated identity providers

The SoulAuth router exposes endpoints for LDAP / Active Directory and
OIDC (Google, generic):

```
POST   /v1/auth/local/login           Email/password (default)
POST   /v1/auth/local/reset-password  Self-service password reset
POST   /v1/auth/ldap/login            LDAP / AD
GET    /v1/auth/oidc/authorize        OIDC authorization redirect
GET    /v1/auth/oidc/callback         OIDC callback handler
```

### LDAP / Active Directory

Set on the platform-api container:

```
SOULAUTH_LDAP_ENABLED=true
SOULAUTH_LDAP_URL=ldaps://ad.example.com:636
SOULAUTH_LDAP_BIND_DN=cn=ldap-service,ou=service,dc=example,dc=com
SOULAUTH_LDAP_BIND_PASSWORD=…
SOULAUTH_LDAP_USER_BASE_DN=ou=people,dc=example,dc=com
SOULAUTH_LDAP_USER_FILTER=(uid={username})
```

Restart platform-api. The portal login form will accept LDAP
credentials; users are JIT-provisioned on first successful bind.
Self-signed LDAPS certs are accepted.

### OIDC (Google / generic)

```
SOULAUTH_OIDC_ENABLED=true
```

Then configure the IdP details via the `/v1/idp/` management API
(`POST /v1/idp/` with the IdP's client ID, client secret, discovery
URL, and tenant mapping). PKCE is enabled by default; JIT
provisioning maps the OIDC `email` claim to a SoulAuth user and the
configured `groups` claim to tenant membership.

Full IdP configuration is out of scope for this self-hoster doc;
the [SoulAuth API endpoints in `/docs`](http://localhost:8000/docs)
are the authoritative reference once you're up.

## See also

- [`docs/security/auth-model.md`](../security/auth-model.md) —
  current write-up of the `@platform/auth` legacy layer. Read with
  the disclaimer that it describes the dead path, not production.
- [`docs/security/audit-trail.md`](../security/audit-trail.md) —
  `audit_events` vs `agos_audit` boundary; both are populated by
  the SoulAuth-validated request context.
- [`agents-platform-quickstart.md`](agents-platform-quickstart.md)
  — agent auth (SoulKey), the other half of Pantheon's auth surface
- [`apps/platform-api/deploy/TROUBLESHOOTING.md`](../../apps/platform-api/deploy/TROUBLESHOOTING.md#soulauth-federated-auth-confusion)
  — failure-mode reference

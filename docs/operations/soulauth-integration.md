# SoulAuth Federated Integration

Pantheon has **two distinct authentication paths**, and the
distinction matters for self-hosters. This doc clarifies which one is
production, which one is legacy, and what to do when the docs
disagree.

> **TL;DR.** Pantheon supports two user-auth paths and both are live.
> **SoulAuth federated** (separate Python service, bcrypt, IdP support
> via LDAP / OIDC) is the **primary** path — it's what
> `pantheon.saluca.com` runs and what self-hosters who want federated
> identity should configure. **`@platform/auth` Argon2id** (in-process
> inside platform-web, local accounts only) is the **OSS / fallback**
> path — it's what runs when neither cookie is present (see
> `apps/platform-web/src/middleware.ts` fallback) and what OSS
> self-hosters who don't want to stand up SoulAuth can rely on. Both
> paths share the same `audit_events` table for compliance logging.

## The two auth paths, side by side

|  | SoulAuth federated (primary) | `@platform/auth` (OSS / fallback) |
|---|---|---|
| **Service** | Separate Python service. | In-process inside platform-web (Next.js BFF) and a Python sibling in `packages/auth/python`. |
| **User DB** | Separate Postgres DB; tables prefixed `_soulauth_*` (`_soulauth_users`, `_soulauth_sessions`, `_soulauth_idp`). | Pantheon's main Postgres; tables `users`, `password_credentials`, `sessions`. |
| **Password hash** | bcrypt. | Argon2id (parameters in [`docs/security/auth-model.md`](../security/auth-model.md)). |
| **Token surface** | Session cookies (`tiresias_session`) for users + SoulKeys for agents (ES256 JWT capability tokens for short-lived per-resource grants). | Session cookies (`platform_session`) only (CSRF via double-submit, see auth-model.md). |
| **Federated IdP support** | LDAP / Active Directory, OIDC (Google, generic), JIT provisioning. | None — local accounts only. |
| **When it fires** | Browser arrives carrying `tiresias_session` (SoulAuth-issued); middleware accepts it directly. If only `tiresias_session` is present but no `platform_session`, middleware redirects through `/api/auth/exchange` to mint a `platform_session`. | Browser has neither cookie → middleware redirects to `/login` → user submits credentials → server action queries `users` JOIN `password_credentials` and verifies Argon2id. |

Both cookie names coexist by design: SoulAuth issues `tiresias_session`,
`@platform/auth` issues `platform_session`. The middleware in
`apps/platform-web/src/middleware.ts` handles all three states (both
cookies / `tiresias_session` only / no cookies) and routes
accordingly.

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
| `apps/platform-web/src/lib/auth/` | Next.js BFF auth helpers — wires both SoulAuth's `tiresias_session` validation and `@platform/auth`'s `platform_session` issuance / validation. Used by the dashboard layout, the tiresias proxy, and the RBAC routes. |
| `packages/auth/` | The `@platform/auth` package (TypeScript + Python halves). Owns the OSS / fallback login path AND general-purpose session-cookie / CSRF utilities that the BFF uses regardless of which login path issued the cookie. |

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

Depends on which path is fielding your logins. `@platform/auth`
uses Argon2id (64 MiB / 3 iterations / 4 lanes) — see
[`docs/security/auth-model.md`](../security/auth-model.md) for the
parameter set. SoulAuth uses bcrypt and the cost factor is set
inside the SoulAuth service, not via environment variables on the
Pantheon container. If you've stood up SoulAuth and your users
authenticate through it, the Argon2id parameters don't matter for
your deployment.

### "Can I disable SoulAuth and use just `@platform/auth`?"

Yes — that's the OSS / fallback posture, supported by design. If
you don't configure SoulAuth, the middleware in
`apps/platform-web/src/middleware.ts` routes sessionless requests
to `/login`, which exercises the `@platform/auth` Argon2id path
against `users` + `password_credentials` tables. The dashboard,
the tiresias proxy, the RBAC routes, and the agentic-os session
helpers all accept either cookie type. The trade-off vs. running
SoulAuth: no LDAP / OIDC / JIT provisioning, local accounts only.

### "Can I run both?"

Yes — that's the default. The middleware handles all three cookie
states (both present / `tiresias_session` only / neither) and
routes accordingly. A user can hold a `tiresias_session` from
SoulAuth and a `platform_session` from `@platform/auth`
simultaneously; the BFF helpers accept either.

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
  full write-up of both paths (SoulAuth primary, `@platform/auth`
  OSS / fallback) with schema and request-flow detail.
- [`docs/security/audit-trail.md`](../security/audit-trail.md) —
  `audit_events` vs `agos_audit` boundary; both are populated by
  the SoulAuth-validated request context.
- [`agents-platform-quickstart.md`](agents-platform-quickstart.md)
  — agent auth (SoulKey), the other half of Pantheon's auth surface
- [`apps/platform-api/deploy/TROUBLESHOOTING.md`](../../apps/platform-api/deploy/TROUBLESHOOTING.md#soulauth-federated-auth-confusion)
  — failure-mode reference

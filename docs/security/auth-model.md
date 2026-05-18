# Auth Model

Documents Pantheon's user-authentication posture. Pantheon has **two
distinct authentication code paths** and the distinction is
load-bearing for anyone reading the code, configuring a self-host, or
writing security documentation.

> **TL;DR.** Both user-auth paths are live and supported. **SoulAuth
> federated** (separate Python service, **bcrypt**, IdP support) is
> the primary path for any deployment that wants federated identity
> — it's what `pantheon.saluca.com` runs. **`@platform/auth` Argon2id**
> (in-process inside platform-web, local accounts only) is the OSS /
> fallback path — it fires when no SoulAuth session is present and
> is what self-hosters who don't stand up SoulAuth rely on for login.
> Agent auth — SoulKey — is independent of both and remains unchanged.

For an operator-facing version of the same posture, see
[`docs/operations/soulauth-integration.md`](../operations/soulauth-integration.md).
For the formal decision record, see
[`docs/decisions/ADR-012-soulauth-federated.md`](../decisions/ADR-012-soulauth-federated.md)
which supersedes
[`ADR-002`](../decisions/ADR-002-local-auth-default.md).

---

## The two paths, side by side

|  | **SoulAuth federated (primary)** | **`@platform/auth` (OSS / fallback)** |
|---|---|---|
| Service | Separate Python service. In OSS self-hosting it runs inside the platform-api container; in Cristian's GCP deployment it is its own service. | In-process: TypeScript inside platform-web, plus a Python sibling in `packages/auth/python`. |
| User DB | Separate logical database; tables prefixed `_soulauth_*` (`_soulauth_users`, `_soulauth_sessions`, `_soulauth_idp`). | Pantheon's main Postgres; tables `users`, `password_credentials`, `sessions`. |
| Password hash | **bcrypt** | Argon2id (64 MiB / 3 iterations / 4 lanes) |
| Session cookie | `tiresias_session` — issued by SoulAuth; validated by platform-api on every request via a SoulAuth client. | `platform_session` — issued by `@platform/auth`'s `createSession`; validated against the `sessions` table. |
| Federated IdP | LDAP / Active Directory, OIDC (Google, generic), JIT provisioning. | None — local accounts only. |
| Agent auth | Out of scope — SoulKey handles agent auth, see "Agent auth" below. | Same — `@platform/auth` is user-only. |
| When it fires | Browser arrives carrying `tiresias_session`. If only `tiresias_session` is present but no `platform_session`, middleware redirects through `/api/auth/exchange` to mint a `platform_session`. | No cookie of either type → middleware redirects to `/login` → server action verifies Argon2id against `password_credentials`. Used by OSS deployments that don't stand up SoulAuth, and as the fallback whenever a SoulAuth session isn't available. |

Both cookie names coexist; the BFF helpers accept either. The choice
of which path is "your" production path depends on whether you need
federated identity (IdP support) — if yes, configure SoulAuth and
direct your users at it; if no, the Argon2id fallback works
out-of-box.

---

## SoulAuth federated — production path

### What it owns

- The `_soulauth_*` table family in its own logical database
- The login / register / forgot-password endpoints under `/v1/auth/*`
- Federated IdP plumbing (LDAP, AD, OIDC providers)
- Password hashing (bcrypt) and verification
- Session issuance (httpOnly, secure, sameSite=lax cookie)
- JIT provisioning of users on first federated login

### What it does NOT own

- Agent credentials (SoulKey) — separate subsystem
- Per-OS UI session helpers (see "Agentic OS session helpers" below)
- The `audit_events` table — emitted from `@platform/auth` and shared across both login paths; see "Audit duality" below

### Request flow (SoulAuth)

```
1. User submits login form at /login
2. platform-web POSTs credentials to platform-api: POST /v1/auth/local/login
3. SoulAuth router verifies password against _soulauth_users (bcrypt)
4. On success, SoulAuth issues a session cookie (httpOnly, secure, sameSite=lax)
5. Cookie is returned through platform-web to the browser
6. Subsequent requests carry the cookie
7. platform-api validates the cookie on each request via the SoulAuth client
8. Validated user identity is attached to request context
```

### Federated IdP variant

Replace step 2 with the federated handshake (LDAP bind / OIDC code
exchange). SoulAuth then JIT-provisions a `_soulauth_users` row on
first login, links it to the IdP identity, and from step 4 onward the
flow is identical to the local case.

For per-self-hoster IdP configuration, see
[`docs/operations/soulauth-integration.md`](../operations/soulauth-integration.md)
("Enabling federated identity providers").

### Where SoulAuth lives in the repo

| Path | Notes |
|---|---|
| `apps/platform-api/src/auth/soulauth.py` | SoulAuth client used by platform-api to validate session cookies and resolve user identity. |
| `apps/platform-api/src/auth/soulkey.py` | SoulKey (agent credential) verification — separate from federated user auth. |
| `apps/platform-api/alembic/versions/0001_*.py` and successors | `_soulauth_*` table migrations. |
| `apps/platform-api/src/auth/router.py` | The `/v1/auth/*` HTTP surface. |

A standalone SoulAuth service binary also exists outside the OSS repo
for Cristian's production GCP deployment. For self-hosters, the
relevant code is the SoulAuth router mounted inside platform-api,
which exposes the same endpoints under `/v1/auth/*`.

---

## `@platform/auth` — OSS / fallback path

The `@platform/auth` package (`packages/auth/`) was Pantheon's first
local-auth implementation, designed when the platform was still a
single monolith. SoulAuth was added later when multi-IdP and a
separate auth-data boundary became requirements — but `@platform/auth`
was kept live as the OSS / fallback path so deployments without a
federated identity provider still have a working login.

### What it owns

- The Argon2id password-hashing flow and the `users` /
  `password_credentials` / `sessions` / `password_reset_tokens` tables.
- The login / register / forgot-password server actions under
  `apps/platform-web/src/app/(auth)/...` and `/api/auth/...`.
- General-purpose cookie + CSRF + session-validation utilities
  (`cookies.ts`, `csrf.ts`, `session.ts`, `tiresias-session.ts`) that
  the BFF uses regardless of which login path issued the cookie. The
  RBAC routes, the tiresias proxy, the dashboard layout, and the
  agentic-os session helpers all depend on these utilities to
  resolve `platform_session` cookies.
- The `audit_events` emitter (shared with SoulAuth-issued sessions —
  same table, see "Audit duality" below).

### When you'd configure it as your primary

- You're running Pantheon OSS without standing up SoulAuth.
- You don't need LDAP / OIDC / JIT provisioning; local accounts are
  fine.
- You want a single binary to operate; no auxiliary auth service.

Once SoulAuth is configured, it becomes the primary path and the
Argon2id fallback only fires when no SoulAuth cookie is present
(e.g. brand-new browser, or SoulAuth temporarily unreachable).

### What you should still NOT do

- Do not advertise `@platform/auth` as having federated IdP support —
  it doesn't, and never will. Use SoulAuth for that.
- Do not migrate sessions between the two paths in either direction
  programmatically. They issue different cookie names and back
  different table families.
- Do not configure both `@platform/auth`'s Argon2id and SoulAuth's
  bcrypt for the SAME user account — choose per-user (a user belongs
  to exactly one of `users` or `_soulauth_users`).

### Cookie / CSRF helpers (still usable)

The non-auth helpers in `packages/auth/src/cookies.ts` and
`packages/auth/src/csrf.ts` are still imported for general session
cookie / CSRF needs. They are not the auth path themselves; they are
utility code. Cookie attributes that they emit:

| Attribute | Value |
|-----------|-------|
| `HttpOnly` | true |
| `Secure` | true in production |
| `SameSite` | lax |
| `Path` | / |
| `Domain` | `COOKIE_DOMAIN` env if set |

### CSRF double-submit (still usable)

`packages/auth/src/csrf.ts` implements the double-submit cookie
pattern. SoulAuth-mounted routes that do mutating writes through the
BFF use this helper. The double-submit token is set in a
non-`HttpOnly` cookie, echoed back in the `x-csrf-token` header, and
compared with `crypto.timingSafeEqual`.

---

## Audit duality

Pantheon has **two** audit log tables with intentionally different
ownership and retention. Neither lives in SoulAuth — both live in
the main Pantheon database.

| Table | Owner | Purpose | Lifetime |
|---|---|---|---|
| `audit_events` | `packages/auth` emitter (shared across both login paths) | Auth + session compliance log | Long retention, immutable |
| `agos_audit` | `apps/platform-web` (Agentic OS layer) | Per-OS product event stream surfaced in `/dashboard/audit` | Product-tier retention, see [audit-trail.md](./audit-trail.md) |

When instrumenting a new event, pick by audience:

- **Auth, session, password, anything an auditor would ask for** → `audit_events`
- **User action inside a per-OS surface (Maker, Filmmaker, Cyber, ...)** → `agos_audit` via the per-OS BFF route

Full boundary discussion: [docs/security/audit-trail.md](./audit-trail.md).
Schema and retention: [docs/architecture/audit-log.md](../architecture/audit-log.md).
Decision record: [ADR-006](../decisions/ADR-006-cross-os-audit-log.md).

---

## Agentic OS session helpers

The Agentic OS BFF routes need a `getCurrent<Slug>User()` helper to
attach the authenticated user to per-OS requests. These helpers are
real and they ARE the runtime user-identity attachment for
per-OS surfaces — but they ultimately resolve session cookies issued
by SoulAuth.

- **Canonical**: `getCurrentHealthUser` / `getHealthPool` in
  `apps/platform-web/src/lib/agentic-os/health/session.ts` — the
  original session-validation + pool plumbing.
- **Per-OS aliases**: each per-OS `session.ts` re-exports the
  canonical helpers under OS-specific names. For example:
  - `apps/platform-web/src/lib/agentic-os/audit/session.ts` exports `getCurrentAuditUser`
  - `apps/platform-web/src/lib/agentic-os/maker/session.ts` exports `getCurrentMakerUser`

The aliases exist so per-OS routes can be searched by usage
(`grep getCurrentMakerUser`) without leaking that everything
ultimately resolves to Health OS plumbing.

The validation path itself reads the SoulAuth session cookie and
calls the SoulAuth client to resolve the user. It does **not** read
from `packages/auth/src/sessions.ts`. When adding a new OS module,
follow the same pattern: create `lib/agentic-os/<slug>/session.ts`
that re-exports from `../health/session` under `getCurrent<Slug>User`.

---

## Agent auth (SoulKey, unchanged)

SoulKey-based agent authentication is a separate subsystem that has
existed since the pre-Pantheon Tiresias era and is **not** affected by
any of the above. It is handled by
`apps/platform-api/src/auth/soulkey.py` and resolves the `X-Soulkey`
header to an agent identity / SoulPair / tenant context.

Agent auth and user auth share zero code paths in the request
hot-path. A request either carries an `X-Soulkey` (agent) or a
session cookie (user) — never both.

For the agent-side surface, see
[`apps/platform-api/docs/AGENTS_GUIDE.md`](../../apps/platform-api/docs/AGENTS_GUIDE.md)
and
[`apps/platform-api/src/agents/agent_yaml_schema.md`](../../apps/platform-api/src/agents/agent_yaml_schema.md).

---

## Schema (`@platform/auth` reference)

For completeness, the `@platform/auth` schema in the main Pantheon
DB. These tables are live whenever the OSS / fallback login path is
in use:

| Table | Purpose |
|---|---|
| `users` | Local user accounts (Argon2id login path) |
| `password_credentials` | Argon2id hashes, 1:1 with users |
| `sessions` | Active and invalidated `platform_session` cookies |
| `password_reset_tokens` | Time-limited reset tokens |
| `audit_events` | Auth / session compliance log (shared with SoulAuth-issued sessions) |
| `organizations` | Tenant organizations |
| `memberships` | User ↔ organization role assignments |

SoulAuth's `_soulauth_*` tables live in a separate logical DB and are
managed by SoulAuth's own migrations. They are not documented here;
see SoulAuth's own schema reference.

# ADR-012: SoulAuth Federated Auth (Extends ADR-002)

**Status:** Accepted  
**Date:** 2026-05-17  
**Deciders:** Cristian (sole maintainer at decision time)  
**Relationship to ADR-002:** Extends, not supersedes — see "Status update" below.

## Status update (2026-05-18)

The original text of this ADR (preserved unchanged below) framed
`@platform/auth` as "reclassified as legacy / dead code." That framing
turned out to be inaccurate in practice: the `@platform/auth` Argon2id
login path is the OSS / fallback path that fires when no SoulAuth
session is present, per the middleware in
`apps/platform-web/src/middleware.ts`. Both auth paths are live and
intentionally so:

- **SoulAuth federated (primary)** — for deployments that want LDAP /
  OIDC / JIT-provisioned identity.
- **`@platform/auth` Argon2id (OSS / fallback)** — for deployments
  that don't stand up SoulAuth, and as the no-cookie fallback in any
  deployment.

ADR-002's local-auth decision therefore remains in force for the OSS /
fallback case; ADR-012 adds the federated path on top, it doesn't
replace it. See [`docs/security/auth-model.md`](../security/auth-model.md)
for the current write-up of both paths. The body of this ADR below is
the original historical text.

---

## Context

[ADR-002](./ADR-002-local-auth-default.md) decided to replace WorkOS
AuthKit with a local-auth implementation in the `@platform/auth`
package: Argon2id password hashes, sessions stored in a
`password_credentials` / `sessions` table family in Pantheon's main
Postgres, in-process inside the platform-web Next.js BFF and a Python
sibling in `packages/auth/python`.

That decision held for one cycle. Two subsequent forces pushed user
auth out of the platform-web / platform-api shared codepath:

1. **Federated IdP requirement.** Users on the production GCP
   deployment needed LDAP / Active Directory and OIDC (Google, generic
   OIDC providers) with JIT provisioning. Bolting that into
   `@platform/auth` would have mixed a federated-identity service
   into a package whose tested code path was strictly local auth.
2. **Data-boundary requirement.** Auth data is intentionally a
   different blast radius from product data. Mixing the user table
   into the main Pantheon Postgres put auth data inside every
   migration and every backup that touched the main DB. A separate
   logical database for auth tables (and ideally a separate physical
   service for the auth code that talks to that database) cleanly
   isolates the blast radius.

The response was **SoulAuth**: a separate Python service that owns
the `_soulauth_*` table family in its own logical database, uses
**bcrypt** password hashing, issues session cookies the rest of
Pantheon validates by calling SoulAuth, and exposes pluggable IdP
backends (local, LDAP, OIDC) behind a uniform `/v1/auth/*` interface.

SoulAuth shipped during the W-H cycle. It runs inside the platform-api
container for OSS self-hosters and as a separate service in Cristian's
production GCP deployment. By the time Wave I started, SoulAuth was
the production user-auth path — but the docs, the README, and a
couple of architecture diagrams still described `@platform/auth` as
the production path. That mismatch is what this ADR resolves.

## Decision

1. **SoulAuth federated is the production user-auth path** for
   Pantheon, in both OSS self-host and production GCP deployments.
   Password hashing is bcrypt. User tables live in a separate logical
   database under the `_soulauth_*` prefix. Federated identity
   providers (LDAP, AD, OIDC) plug in through SoulAuth's IdP backend
   abstraction with JIT user provisioning on first federated login.

2. **The login form posts to SoulAuth.** `platform-web` sends user
   credentials to `POST /v1/auth/local/login` on platform-api, which
   the SoulAuth router handles. SoulAuth issues the session cookie
   (`HttpOnly`, `Secure`, `SameSite=lax`). `platform-api` validates
   the cookie on every request via a SoulAuth client.

3. **`@platform/auth` is reclassified as legacy / dead code.** The
   package still ships, the schema is still migrated, the imports
   compile. The runtime auth path bypasses it. Some non-auth helpers
   in `packages/auth/src/` (cookies, CSRF token helpers, audit event
   emitter) remain in use as utility code. The Argon2id
   `password_credentials` table is not the live login path.

4. **Agent auth (SoulKey) is unaffected.** SoulKey continues to live
   in `apps/platform-api/src/auth/soulkey.py` and resolves the
   `X-Soulkey` header to an agent identity. Agent auth and user auth
   share zero code in the request hot-path.

5. **Audit duality stays as ADR-006 set it.** Pantheon retains two
   audit tables — `audit_events` (legacy emitter, still used
   opportunistically for compliance-grade auth events) and
   `agos_audit` (per-OS product event stream). Neither lives in
   SoulAuth's database.

## Consequences

**Positive:**

- Federated identity providers (LDAP / AD / OIDC) work out of the
  box for production self-hosts.
- Auth-data blast radius is isolated from product-data blast radius:
  a migration that touches Pantheon's main DB cannot accidentally
  corrupt the auth tables.
- The story for "where does user authentication live" is single-path
  again: SoulAuth. The dead-code status of `@platform/auth` is now
  documented in [`docs/security/auth-model.md`](../security/auth-model.md).

**Negative / trade-offs:**

- Two database connections per platform-api process (main + SoulAuth)
  is operationally heavier than one. For OSS self-hosters running
  everything in a single compose stack this is a non-issue; for
  production deployments it adds a Cloud SQL bill line.
- `@platform/auth` remains in the tree as dead code. Removing it is
  a future migration that has not been prioritized — it would require
  walking through every consumer of `users`, `password_credentials`,
  and `sessions` tables to confirm nothing depends on them. Until
  then, every contributor reading the auth surface will see two
  apparent code paths and have to know which one is real.
- Documents that referenced ADR-002 as authoritative on
  password-hashing parameters are now stale on that detail —
  bcrypt parameters live on the SoulAuth side, not in
  [`auth-model.md`](../security/auth-model.md).

## Implementation pointers

- `apps/platform-api/src/auth/soulauth.py` — SoulAuth client used by
  platform-api to validate session cookies and resolve user identity.
- `apps/platform-api/src/auth/router.py` — the `/v1/auth/*` HTTP
  surface mounted into platform-api.
- `apps/platform-api/alembic/versions/0001_*.py` and successors —
  `_soulauth_*` table migrations.
- [`docs/operations/soulauth-integration.md`](../operations/soulauth-integration.md)
  — operator-facing dual-track explainer (Wave I.1).
- [`docs/security/auth-model.md`](../security/auth-model.md) —
  contributor-facing dual-track explainer (Wave I.3).

## What this ADR explicitly does NOT do

- Does not retire `@platform/auth`. Removal is future work.
- Does not change SoulKey or any agent auth behavior.
- Does not change the audit duality (`audit_events` vs `agos_audit`).
- Does not specify SoulAuth's internal schema beyond the `_soulauth_*`
  table prefix — that lives in SoulAuth's own migrations and is out of
  scope for ADRs in this repo.

# Module Boundaries

Defines what each component owns and what it must NOT reach into.

## apps/platform-web

**Owns:**
- User-facing UI (Dashboard, login, register, forgot-password)
- BFF API routes (`/api/tiresias/*`) — proxy to platform-api
- Session cookie management
- Client-side RBAC gate rendering
- **Agentic OS layer** — see the dedicated section below

**May call:**
- `@platform/auth` — session management
- `@platform/config` — env validation
- `@platform/types` — shared domain types
- `@platform/memory` — agent memory (TypeScript only)
- `apps/platform-api` — via HTTP (BFF proxy)
- The shared Postgres database (Agentic OS tables only — `agos_*`)

**Must NOT:**
- Directly access platform-api-owned tables (`_soul_*`, billing, etc.) —
  use the API
- Modify Cedar policies (`infrastructure/rules`)
- Bypass `validateSession` to serve dashboard content
- Import from Python packages

---

## apps/platform-web → Agentic OS layer

Lives at [`apps/platform-web/src/lib/agentic-os/`](../../apps/platform-web/src/lib/agentic-os/)
plus the matching routes/components. See
[`docs/architecture/agentic-os.md`](agentic-os.md) for the full
architecture.

**Owns:**
- The module registry (`registry.ts`) — single source of truth for
  module metadata (ADR-005)
- All `agos_*` tables in the shared Postgres database
- The cross-OS audit log (`agos_audit`, ADR-006)
- Per-user feature flags (`agos_feature_flags`, ADR-007)
- BFF routes under `/api/tiresias/agentic-os/...`
- Feature pages under `/dashboard/os/...`
- Per-OS plan content at `apps/platform-web/content/agentic-os/<slug>.md`

**Must NOT:**
- Add a new OS without a registry entry — the registry is canonical
- Skip `recordAudit` on write paths — audit completeness is contractual
- Use feature flags as a security boundary — they are UX-only (see ADR-007)
- Import from `apps/platform-api` source (HTTP only via the BFF proxy)
- Cross-join `agos_*` tables with platform-api tables in SQL

**Per-OS conventions:**
- Each OS owns its own `repo.ts`, `session.ts`, BFF routes, feature
  pages, and components
- Cross-OS schema joins are forbidden — talk through BFF routes if
  modules need to share data
- New OSes default to `enabled = true` for all existing users (opt-out
  feature-flag default)

---

## apps/platform-api

**Owns:**
- Agent identity (SoulKey) resolution
- Cedar policy evaluation (PDP)
- Billing, usage metering
- Portal, sales, support endpoints
- SoulWatch anomaly detection
- RBAC storage for organizations/memberships

**May call:**
- `platform-auth` (Python) — local auth helpers
- `platform-config` (Python) — env validation
- `packages/database` Alembic migrations

**Must NOT:**
- Call `apps/platform-web` (no upstream dependency)
- Be modified to proxy requests to external auth providers (WorkOS, Auth0) — local auth is the default

---

## apps/platform-app-proxy

**Owns:**
- Agent request interception and policy enforcement
- Plugin/integration host for agent capabilities

**May call:**
- `apps/platform-api` — for identity resolution and PDP
- `infrastructure/rules` — Cedar policies (read-only)

**Must NOT:**
- Modify Cedar policy files
- Bypass the PDP for policy decisions
- Store persistent state outside its own scope

---

## packages/auth

> **Auth dual-track note.** `@platform/auth` is the **OSS / fallback**
> local-auth path: Argon2id, in-process inside platform-web, local
> accounts only. It fires whenever no SoulAuth session cookie is
> present, per the middleware in `apps/platform-web/src/middleware.ts`.
> For deployments that want federated identity (LDAP, OIDC, JIT
> provisioning), **SoulAuth federated** runs alongside as the primary
> path — a separate Python service that hashes with **bcrypt** and
> stores users in its own database. Both are supported; see
> [`docs/operations/soulauth-integration.md`](../operations/soulauth-integration.md)
> and [`docs/security/auth-model.md`](../security/auth-model.md) for
> the full dual-track explainer.

**Owns:**
- Argon2id password hashing for the OSS / fallback login path
- Session lifecycle for `platform_session` cookies: create, validate, invalidate
- Cookie helpers (httpOnly, secure, sameSite) — used by both auth paths
- CSRF double-submit token — used by both auth paths
- In-memory rate limiter
- Audit event emitter — shared across both paths via `audit_events`

**Must NOT:**
- Implement OAuth/OIDC flows (that's SoulAuth's responsibility)
- Store secrets in memory beyond the immediate request
- Import from `apps/platform-web` or `apps/platform-api`
- Try to validate SoulAuth-issued `tiresias_session` cookies (those go through `apps/platform-api/src/auth/soulauth.py`)

---

## packages/memory

**Owns:**
- Agent memory storage (topic index, FTS, hybrid search, temporal decay)
- SQLite and PostgreSQL adapters

**Must NOT:**
- Be published to npm (private package)
- Be modified to re-add `@saluca/asphodel` publish config
- Be imported from Python services in this pass (follow-up work)

---

## packages/config

**Owns:**
- Environment variable schema and validation (single source of truth)

**Must NOT:**
- Contain business logic
- Import from other `@platform/*` packages

---

## packages/types

**Owns:**
- Shared TypeScript types: `User`, `Session`, `Role`, `AuditEvent`, `Organization`, `Membership`

**Must NOT:**
- Contain runtime logic (types only)
- Have runtime dependencies

---

## infrastructure/rules

**Owns:**
- Cedar policy files (`.cedar`)
- Playbooks

**Must NOT:**
- Be modified as part of auth refactoring
- Have any TypeScript or Python logic
- Be imported directly by `apps/platform-web`

---

## Cross-Cutting Constraints

1. **No circular dependencies** between packages or apps.
2. **Python apps** are not pnpm workspace members — managed via `uv`/pip separately.
3. **`packages/memory`** is TypeScript-to-TypeScript only in v1. Python access requires a separate service or HTTP bridge.
4. **Cedar policies** are consumed by `platform-app-proxy` and `platform-api`; never modified by auth changes.
5. **Agentic OS tables** (`agos_*`) live in the same Postgres database as
   `@platform/auth` tables but are owned by `apps/platform-web`. They
   migrate via `packages/database/alembic/` (the `auth` branch chain) —
   not via `apps/platform-api/alembic/`. See
   [`docs/operations/alembic-branches.md`](../operations/alembic-branches.md).
6. **Audit duality**: the `audit_events` table (`@platform/auth`) is a
   compliance-grade chained log; `agos_audit` is the product-side
   user-visible log. They serve different audiences and never cross-join.

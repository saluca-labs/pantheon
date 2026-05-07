# Module Boundaries

Defines what each component owns and what it must NOT reach into.

## apps/platform-web

**Owns:**
- User-facing UI (Dashboard, login, register, forgot-password)
- BFF API routes (`/api/tiresias/*`) — proxy to platform-api
- Session cookie management
- Client-side RBAC gate rendering

**May call:**
- `@platform/auth` — session management
- `@platform/config` — env validation
- `@platform/types` — shared domain types
- `@platform/memory` — agent memory (TypeScript only)
- `apps/platform-api` — via HTTP (BFF proxy)

**Must NOT:**
- Directly access the `platform-api` Postgres database (use the API)
- Modify Cedar policies (`infrastructure/rules`)
- Bypass `validateSession` to serve dashboard content
- Import from Python packages

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

**Owns:**
- Password hashing (Argon2id only — no bcrypt, no scrypt)
- Session lifecycle: create, validate, invalidate
- Cookie helpers (httpOnly, secure, sameSite)
- CSRF double-submit token
- In-memory rate limiter
- Audit event emitter

**Must NOT:**
- Implement OAuth/OIDC flows (that's a future `packages/auth/oidc` extension)
- Store secrets in memory beyond the immediate request
- Import from `apps/platform-web` or `apps/platform-api`

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

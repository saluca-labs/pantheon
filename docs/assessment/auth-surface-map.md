# Auth Surface Map

Documents every authentication and authorization enforcement point before and after the `platform/unification-v1` consolidation.

## Before (WorkOS AuthKit)

| Location | Mechanism | Notes |
|----------|-----------|-------|
| `apps/platform-web/src/app/(auth)/login/page.tsx` | `getSignInUrl()` from `@workos-inc/authkit-nextjs` | Redirected to WorkOS hosted login |
| `apps/platform-web/src/app/(auth)/callback/route.ts` | WorkOS OAuth callback handler | Processed auth code, set session |
| `apps/platform-web/src/app/auth/signout/route.ts` | WorkOS `signOut()` | Invalidated WorkOS session |
| `apps/platform-web/src/app/(dashboard)/layout.tsx` | `withAuth()` + `AuthKitProvider` | Server-side session check, client provider |
| `apps/platform-web/src/components/layout/topbar.tsx` | `useAuth()` from AuthKitProvider | Read user from WorkOS context |
| `apps/platform-web/src/app/api/tiresias/rbac/*` | `withAuth()` + JWT decode | WorkOS JWT for permission checks |
| `apps/platform-api/src/auth/*` | SoulKey (`X-Soulkey` header) | Agent-to-API auth — unchanged |

## After (Local Auth Default)

| Location | Mechanism | Notes |
|----------|-----------|-------|
| `apps/platform-web/src/middleware.ts` | Cookie presence check | Fast path: redirect to /login if no session cookie |
| `apps/platform-web/src/app/(auth)/login/page.tsx` | Server Action → `verifyPassword` + `createSession` | Argon2id verify, Postgres session creation |
| `apps/platform-web/src/app/(auth)/register/page.tsx` | Server Action → `hashPassword` + `createSession` | Argon2id hash, Postgres session creation |
| `apps/platform-web/src/app/(auth)/forgot-password/page.tsx` | Server Action → token in `password_reset_tokens` | Token-based reset, logs URL in dev |
| `apps/platform-web/src/app/auth/signout/route.ts` | `invalidateSession` + `clearSessionCookie` | Sets `invalidated_at` in DB, clears cookie |
| `apps/platform-web/src/app/(dashboard)/layout.tsx` | `validateSession` (DB lookup) | Full session validation on every dashboard render |
| `apps/platform-web/src/components/layout/topbar.tsx` | Props from server component | No client-side auth state |
| `apps/platform-web/src/app/api/tiresias/rbac/*` | `validateSession` + `extractRoleFromLocalSession` | Local session + DB-backed permission overrides |
| `apps/platform-api/src/auth/*` | SoulKey (`X-Soulkey` header) | Agent-to-API auth — **unchanged** |
| `packages/auth/src/rate-limit.ts` | In-memory rate limiter (10 attempts / 15 min) | Keyed by email; replaceable with Redis |
| `packages/auth/src/audit.ts` | Writes to `audit_events` table | Login, logout, failed attempts |
| `packages/auth/src/csrf.ts` | Double-submit cookie pattern | `x-csrf-token` header vs `csrf_token` cookie |

## Authentication Flow Diagram

```
Browser → GET /dashboard
    ↓
middleware.ts: has platform_session cookie?
    No → redirect /login
    Yes → pass through

Browser → POST /login (Server Action)
    ↓
verifyPassword(hash, plain) — Argon2id
    Fail → redirect /login?error=invalid
    Pass ↓
createSession(userId, db) — writes sessions table
    ↓
setSessionCookie(cookies, token) — httpOnly, secure in prod, sameSite=lax
    ↓
redirect /dashboard

Browser → GET /dashboard (with cookie)
    ↓
(dashboard)/layout.tsx: validateSession(token, db)
    Expired/invalid → redirect /login
    Valid → render with user identity
```

## Unchanged Auth Surfaces

The following are **not modified** by this consolidation (per spec constraints):

- `apps/platform-api/src/auth/` — SoulKey-based agent identity system
- `apps/platform-api/src/auth/pdp.py` — Cedar PDP evaluation
- `apps/platform-api/src/auth/soulkey.py` — SoulKey resolution
- `infrastructure/rules/` — Cedar policies
- `infrastructure/enforcement/` — Policy enforcement point

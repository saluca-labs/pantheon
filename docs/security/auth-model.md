# Auth Model

Documents the security model for local-auth-default in `platform/unification-v1`.

## Overview

Authentication is now handled entirely within the platform, without any dependency on external auth providers (WorkOS, Auth0, etc.). The local-auth implementation lives in `packages/auth` (TypeScript + Python halves).

## Password Hashing — Argon2id

All passwords are hashed using **Argon2id**, the winner of the 2015 Password Hashing Competition (PHC).

**Parameters (as of v1):**

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Algorithm | Argon2id | Hybrid of Argon2i (side-channel resistance) and Argon2d (GPU resistance) |
| Memory cost | 65,536 KiB (64 MiB) | OWASP minimum recommendation for Argon2id |
| Time cost | 3 | 3 passes over memory |
| Parallelism | 4 | 4 parallel lanes |
| Hash length | 32 bytes | Output hash size |
| Salt length | 16 bytes | Auto-generated per hash |

**Libraries:**
- TypeScript: `argon2` npm package (Node.js native bindings to libargon2)
- Python: `argon2-cffi` (CFFI bindings to libargon2)

**Upgrading parameters:** When parameters are updated, existing hashes remain valid. The `needs_rehash()` helper (Python) checks if a stored hash uses outdated params and triggers re-hashing on next successful login.

## Session Management

Sessions are stored in the `sessions` Postgres table (see `packages/auth/src/schema.sql`).

### Session Lifecycle

```
createSession(userId, db) → insert row, return {id, token, expiresAt}
validateSession(token, db) → SELECT + expiry + invalidated_at check → {user, session} | null
invalidateSession(token, db) → UPDATE sessions SET invalidated_at = NOW()
```

**Token generation:** `crypto.randomBytes(32).toString('base64url')` — 256 bits of entropy.

**TTL:** 30 days (rolling, not sliding in v1 — follow-up: extend `expires_at` on activity).

**Invalidation:** Soft-delete via `invalidated_at` column. Old sessions are not purged automatically (add a cron job to delete sessions where `invalidated_at < NOW() - INTERVAL '30 days'`).

## Cookies

| Attribute | Value | Rationale |
|-----------|-------|-----------|
| `HttpOnly` | true | Prevents XSS token theft |
| `Secure` | true in production | HTTPS-only transmission |
| `SameSite` | lax | CSRF protection for navigation |
| `Path` | / | Available to all routes |
| `MaxAge` | 30 days | Matches session TTL |
| `Domain` | `COOKIE_DOMAIN` env if set | Optional subdomain sharing |

## CSRF Protection

`packages/auth/src/csrf.ts` implements the **double-submit cookie** pattern:

1. Server generates a random CSRF token.
2. Token is set in a non-httpOnly `csrf_token` cookie (readable by JavaScript).
3. Client JavaScript reads the cookie and sends it as `x-csrf-token` header on all mutating requests.
4. Server validates that `header === cookie` using `crypto.timingSafeEqual`.

This protects against CSRF because an attacker's cross-origin site cannot read the cookie value.

## Rate Limiting

`packages/auth/src/rate-limit.ts` implements in-memory rate limiting on login attempts:

| Setting | Value |
|---------|-------|
| Max attempts | 10 per window |
| Window | 15 minutes |
| Key | `login:${email}` |
| Cleanup | Expired buckets purged every 15 minutes |

**Limitation:** In-memory — does not share state across multiple instances. For production multi-replica deployments, replace with a Redis-backed limiter. The interface (`checkLoginRateLimit`, `resetLoginRateLimit`) is designed to be a drop-in replacement.

## Audit Events

All auth events are written to the `audit_events` table via `packages/auth/src/audit.ts`:

| Action | Trigger |
|--------|---------|
| `auth.login` | Successful login |
| `auth.login_failed` | Invalid password |
| `auth.logout` | Session invalidated |
| `auth.register` | New user registration |
| `auth.password_reset_request` | Reset email requested |
| `auth.password_reset_complete` | Password changed via reset token |
| `session.created` | New session created |
| `session.invalidated` | Session invalidated |

Audit events are non-blocking — failures are logged to stderr but do not interrupt the auth flow.

## Schema

See `packages/auth/src/schema.sql` for the canonical DDL, and `packages/database/alembic/versions/0001_local_auth.py` for the Alembic migration.

Key tables:
- `users` — human user accounts
- `password_credentials` — Argon2id hashes (1:1 with users, via FK)
- `sessions` — active and invalidated sessions
- `password_reset_tokens` — time-limited reset tokens (1 hour TTL)
- `audit_events` — immutable auth event log
- `organizations` — tenant organizations
- `memberships` — user ↔ organization role assignments

## Password Reset Flow

1. User submits email at `/forgot-password`.
2. Server looks up user (non-revealing: always returns success page).
3. If user exists: insert `password_reset_tokens` row (32-byte URL-safe token, 1-hour TTL).
4. In dev: reset URL logged to stdout and sent via Mailhog.
5. In prod: send via SMTP transactional mailer (SMTP_HOST/PORT/FROM env vars).
6. User follows link → `/reset-password?token=...`.
7. Server validates token (not used, not expired).
8. Update `password_credentials.hash` with new Argon2id hash.
9. Mark token as used (`used_at = NOW()`).
10. Invalidate all existing sessions for the user.

## Agent Auth (Unchanged)

The SoulKey-based agent authentication system in `apps/platform-api` is **not modified** by this consolidation. It uses a separate token issuance and verification mechanism. See `apps/platform-api/src/auth/soulkey.py`.

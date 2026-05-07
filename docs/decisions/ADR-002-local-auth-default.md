# ADR-002: Local Auth Default — Replace WorkOS AuthKit

**Status:** Accepted  
**Date:** 2026-01  
**Deciders:** Platform team  

## Context

`apps/platform-web` used `@workos-inc/authkit-nextjs` for human user authentication, redirecting users to WorkOS-hosted login pages and receiving JWTs. This created:

1. **External vendor dependency** for a core security function
2. **Network dependency** on WorkOS APIs for every login
3. **Opacity**: auth behavior tied to WorkOS JWT format and hosted UI
4. **Cost exposure**: WorkOS charges per MAU
5. **Spec requirement**: Consolidation spec mandates local auth with Argon2id

## Decision

**Replace WorkOS AuthKit with local-auth-default** using:
- **Argon2id** password hashing (64 MiB / 3 iterations / 4 lanes)
- **Postgres sessions** (token in `sessions` table, signed cookie)
- **No adapter layer**: direct replacement, not a wrapper over WorkOS
- **`packages/auth`**: shared TS + Python implementation for both web and API

The decision is to **not** build an adapter layer that could call WorkOS as a fallback. This simplifies the codebase and avoids the cognitive overhead of two auth paths.

## Consequences

**Positive:**
- Zero external auth dependencies in the critical login path
- Full control over session behavior, token format, and cookie attributes
- Argon2id is memory-hard and resistant to GPU/ASIC attacks
- Works entirely offline (dev/CI/on-prem)
- GDPR-friendly: user credentials never leave the platform

**Negative / Tradeoffs:**
- Must implement our own: password reset, email verification, MFA (follow-up)
- Responsible for own security hardening (rate limiting, CSRF, audit)
- Social login (Google, GitHub) is not available in v1

## OIDC Follow-Up

The `AUTH_MODE` env var supports `local` (default) and `oidc` (future). When `AUTH_MODE=oidc`, a future phase can add an OIDC provider integration without changing the session management layer.

## Rollback Plan

1. Add `@workos-inc/authkit-nextjs` back to `apps/platform-web/package.json`
2. Restore `apps/platform-web/src/app/(auth)/callback/route.ts` from git history (`git show HEAD~2:apps/platform-web/src/app/(auth)/callback/route.ts`)
3. Restore `apps/platform-web/src/app/(dashboard)/layout.tsx` from git
4. Set `WORKOS_CLIENT_ID` and `WORKOS_API_KEY` env vars

The local-auth schema changes are additive — they add new tables (`users`, `sessions`, etc.) but do not drop WorkOS JWT validation.

## Security Considerations

- `SESSION_SECRET` must be ≥ 32 characters (enforced by `@platform/config` validation at startup)
- All session tokens are 256-bit random (`crypto.randomBytes(32)`)
- Rate limiting: 10 failed attempts per 15 minutes per email
- All login/logout events written to `audit_events`
- Password reset tokens expire after 1 hour
- Tokens are single-use (marked with `used_at`)

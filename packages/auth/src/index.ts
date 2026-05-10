/**
 * @platform/auth — Local-auth default with Argon2id + Postgres sessions.
 *
 * Exports:
 *   - hashPassword / verifyPassword (Argon2id)
 *   - createSession / validateSession / invalidateSession
 *   - requireSession / requireRole (Next.js middleware helpers)
 */

export { hashPassword, verifyPassword } from './password.js';
export { createSession, validateSession, invalidateSession } from './session.js';
export { requireSession, requireRole } from './middleware.js';
export { setSessionCookie, clearSessionCookie, getSessionToken } from './cookies.js';
export { generateCsrfToken, validateCsrfToken } from './csrf.js';
export { checkLoginRateLimit, resetLoginRateLimit } from './rate-limit.js';
export { emitAuditEvent } from './audit.js';
export { verifyTiresiasSession } from './tiresias-session.js';

export type { Session, User } from './types.js';
export type { TiresiasIdentity } from './tiresias-session.js';

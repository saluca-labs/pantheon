/**
 * Double-submit CSRF token helpers.
 *
 * Pattern: generate a random token, store it in a non-httpOnly cookie,
 * and require it as a header on all mutating requests. The server validates
 * that header matches the cookie.
 */

import crypto from 'node:crypto';

export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Generate a new CSRF token.
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Validate that the CSRF token in the request header matches the cookie.
 *
 * @param headerToken - value from request header x-csrf-token
 * @param cookieToken - value from the csrf_token cookie
 * @returns true if tokens match and are non-empty
 */
export function validateCsrfToken(
  headerToken: string | null | undefined,
  cookieToken: string | null | undefined
): boolean {
  if (!headerToken || !cookieToken) return false;
  if (headerToken.length !== cookieToken.length) return false;

  // Constant-time comparison to prevent timing attacks
  const a = Buffer.from(headerToken);
  const b = Buffer.from(cookieToken);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Secure cookie helpers for session token management.
 *
 * Structural types — no hard dependency on next/server. Any cookie store
 * that exposes `get(name)` and `set(name, value, options)` works (Next.js
 * ResponseCookies and ReadonlyRequestCookies both satisfy these shapes).
 */

export const SESSION_COOKIE = 'platform_session';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Whether to mark the session cookie Secure (HTTPS-only).
 *
 * Default: only when NODE_ENV=production AND PLATFORM_INSECURE_COOKIES is
 * unset. The override exists so production-built containers can still be
 * exercised end-to-end over plain HTTP (smoke tests, local docker
 * compose, etc.) without the Secure flag silently dropping the cookie.
 */
function shouldUseSecureCookie(): boolean {
  if (process.env['PLATFORM_INSECURE_COOKIES'] === '1') return false;
  return process.env['NODE_ENV'] === 'production';
}

export interface CookieSetOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  maxAge?: number;
  path?: string;
  domain?: string;
}

export interface MutableCookieStore {
  set(name: string, value: string, options: CookieSetOptions): unknown;
}

export interface ReadableCookieStore {
  get(name: string): { name: string; value: string } | undefined;
}

/**
 * Set the session cookie on a mutable cookie store (e.g. Next.js ResponseCookies).
 */
export function setSessionCookie(
  cookies: MutableCookieStore,
  token: string,
  domain?: string
): void {
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: 'lax',
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
    ...(domain ? { domain } : {}),
  });
}

/**
 * Clear the session cookie (logout).
 */
export function clearSessionCookie(cookies: MutableCookieStore): void {
  cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}

/**
 * Extract the session token from a readable cookie store.
 */
export function getSessionToken(
  cookies: ReadableCookieStore
): string | undefined {
  return cookies.get(SESSION_COOKIE)?.value;
}

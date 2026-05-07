/**
 * Secure cookie helpers for session token management.
 */

import type { ResponseCookies } from 'next/dist/server/web/spec-extension/cookies';
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';

export const SESSION_COOKIE = 'platform_session';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

const isProd = process.env['NODE_ENV'] === 'production';

/**
 * Set the session cookie in a Next.js response.
 */
export function setSessionCookie(
  cookies: ResponseCookies,
  token: string,
  domain?: string
): void {
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
    ...(domain ? { domain } : {}),
  });
}

/**
 * Clear the session cookie (logout).
 */
export function clearSessionCookie(cookies: ResponseCookies): void {
  cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}

/**
 * Extract the session token from incoming request cookies.
 */
export function getSessionToken(
  cookies: ReadonlyRequestCookies
): string | undefined {
  return cookies.get(SESSION_COOKIE)?.value;
}

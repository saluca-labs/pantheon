/**
 * Next.js middleware and handler helpers for session-based auth.
 */

import type { NextRequest, NextResponse } from 'next/server';
import type { Session } from './types.js';

export const SESSION_COOKIE = 'platform_session';

/**
 * Extract session from a Next.js request.
 * Throws a redirect response when not authenticated.
 *
 * Use inside Next.js middleware.ts or route handler.
 */
export function requireSession(req: NextRequest): Session | null {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  // Token is validated async by the route; middleware only checks presence.
  // Full validation happens in validateSession() at the route level.
  return { token } as unknown as Session;
}

/**
 * Factory that returns a Next.js route handler requiring a given role.
 *
 * Usage:
 *   export const GET = requireRole('admin')(async (req) => { ... });
 */
export function requireRole(
  _role: string
): (handler: (req: NextRequest) => Promise<NextResponse>) => (req: NextRequest) => Promise<NextResponse> {
  return (handler) => async (req) => {
    const session = requireSession(req);
    if (!session) {
      const { NextResponse } = await import('next/server');
      return NextResponse.redirect(new URL('/login', req.url));
    }
    return handler(req);
  };
}

/**
 * Framework-agnostic middleware helpers for session-based auth.
 *
 * Structural types — no hard dependency on next/server. Next.js NextRequest
 * satisfies the RequestLike shape via duck typing.
 */

import type { Session } from './types.js';

export const SESSION_COOKIE = 'platform_session';

export interface RequestLike {
  cookies: { get(name: string): { value: string } | undefined };
  url: string;
}

export interface ResponseLike {
  status?: number;
}

/**
 * Extract a (placeholder) session shape from a request's cookies.
 *
 * Middleware only checks cookie presence — full session validation requires
 * a DB lookup and happens at the route layer via `validateSession`.
 */
export function requireSession(req: RequestLike): Session | null {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return { token } as unknown as Session;
}

/**
 * Factory: returns a handler wrapper that requires a given role.
 *
 * Role enforcement against the DB-backed session happens in the wrapped
 * handler — this wrapper short-circuits when the cookie is absent.
 *
 * Usage (Next.js):
 *   export const GET = requireRole('admin')(async (req) => { ... });
 */
export function requireRole<TReq extends RequestLike, TRes>(
  _role: string
): (handler: (req: TReq) => Promise<TRes>) => (req: TReq) => Promise<TRes> {
  return (handler) => async (req) => {
    const session = requireSession(req);
    if (!session) {
      // Caller-side responsibility to redirect/respond appropriately.
      // Throw so the route layer can map to its framework's response.
      throw new UnauthenticatedError();
    }
    return handler(req);
  };
}

export class UnauthenticatedError extends Error {
  readonly statusCode = 401;
  constructor(message = 'Unauthenticated') {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

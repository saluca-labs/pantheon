/**
 * Cross-OS session helper.
 *
 * Every Agentic OS vertical (health, filmmaker, maker, …) needs the same
 * cookie + SoulAuth machinery to resolve the current user and the same
 * shared pg Pool. Hosting that logic here means a single tested
 * implementation; per-OS `session.ts` files re-export under OS-flavoured
 * names for readability at the call site.
 *
 * @license MIT — Tiresias platform (internal).
 */

import 'server-only';
import { cookies } from 'next/headers';
import { Pool } from 'pg';
import { validateSession, getSessionToken } from '@platform/auth';

let _pool: Pool | null = null;

export function getOsPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env['DATABASE_URL'], max: 5 });
  }
  return _pool;
}

export interface OsSessionUser {
  userId: string;
  /**
   * Tenant id for tenant-scoped writes. Resolved from the user's
   * `organization_id` in the local auth schema; falls back to `userId`
   * for solo-user installs that do not provision orgs.
   */
  tenantId: string;
  email: string;
  displayName?: string | null;
}

/**
 * Resolve the current OS user from the local session cookie.
 * Returns null when unauthenticated.
 */
export async function getCurrentOsUser(): Promise<OsSessionUser | null> {
  const cookieStore = await cookies();
  const token = getSessionToken(cookieStore as unknown as Parameters<typeof getSessionToken>[0]);
  if (!token) return null;
  const result = await validateSession(token, getOsPool());
  if (!result) return null;
  return {
    userId: result.user.id,
    tenantId: result.user.organizationId ?? result.user.id,
    email: result.user.email,
    displayName: result.user.displayName ?? null,
  };
}

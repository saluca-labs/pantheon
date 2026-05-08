import 'server-only';
import { cookies } from 'next/headers';
import { Pool } from 'pg';
import { validateSession, getSessionToken } from '@platform/auth';

let _pool: Pool | null = null;

export function getHealthPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env['DATABASE_URL'], max: 5 });
  }
  return _pool;
}

export interface HealthSessionUser {
  userId: string;
  email: string;
  displayName?: string | null;
}

/**
 * Resolve the current Health OS user from the local session cookie.
 * Returns null when unauthenticated.
 */
export async function getCurrentHealthUser(): Promise<HealthSessionUser | null> {
  const cookieStore = await cookies();
  const token = getSessionToken(cookieStore as any);
  if (!token) return null;
  const result = await validateSession(token, getHealthPool());
  if (!result) return null;
  return {
    userId: result.user.id,
    email: result.user.email,
    displayName: result.user.displayName ?? null,
  };
}

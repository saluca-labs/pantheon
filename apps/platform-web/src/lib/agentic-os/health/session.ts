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
  /**
   * Tenant id for tenant-scoped writes (`agos_mh_profile`,
   * `agos_health_consent`, `agos_health_risk_flag`). Resolved from the
   * user's `organization_id` in the local auth schema; falls back to
   * `userId` for solo-user installs that do not provision orgs.
   */
  tenantId: string;
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
    tenantId: result.user.organizationId ?? result.user.id,
    email: result.user.email,
    displayName: result.user.displayName ?? null,
  };
}

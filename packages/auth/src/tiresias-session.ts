/**
 * Tiresias session verification — federation helper.
 *
 * Verifies an opaque `tiresias_session` token (issued by SoulAuth via the
 * portal /v1/auth/local/login flow) against SoulAuth's session-verify
 * endpoint. Returns the canonical user identity so platform-web can mint a
 * local `platform_session` of its own.
 *
 * SoulAuth endpoint: GET /v1/auth/local/session/verify
 *   Auth: Authorization: Bearer <opaque-tiresias-session-token>
 *   200 {
 *     valid: boolean,
 *     user_id: string,    // SoulAuth user UUID (subject)
 *     tenant_id: string,
 *     email: string,
 *     admin_role: string  // "viewer" | "operator" | "admin" | "owner"
 *   }
 *   On invalid token, the endpoint still returns 200 with { valid: false }.
 *
 * This module is server-only — it dials SoulAuth over the cluster network
 * via SOULAUTH_INTERNAL_URL, the same env var the portal uses.
 */

export interface TiresiasIdentity {
  /** SoulAuth user UUID (the federated subject). */
  subject: string;
  /** Email from SoulAuth — canonical identity key on platform-web. */
  email: string;
  /** SoulAuth tenant UUID. */
  tenantId: string;
  /** Admin role string ("viewer" | "operator" | "admin" | "owner"). */
  adminRole: string;
}

interface VerifyResponse {
  valid: boolean;
  user_id?: string;
  tenant_id?: string;
  email?: string;
  admin_role?: string;
  reason?: string;
}

function getSoulAuthUrl(): string {
  return (
    process.env['SOULAUTH_INTERNAL_URL'] ||
    'http://soulauth.tiresias.svc.cluster.local'
  );
}

/**
 * Verify an opaque tiresias_session token against SoulAuth.
 *
 * Returns null on:
 *   - empty/missing token
 *   - non-2xx response
 *   - { valid: false } from SoulAuth
 *   - network failure
 *
 * Never throws — federation must fail closed but quietly so the caller can
 * fall back to the unauthenticated path (e.g. redirect to /login).
 */
export async function verifyTiresiasSession(
  token: string
): Promise<TiresiasIdentity | null> {
  if (!token) return null;

  const url = `${getSoulAuthUrl()}/v1/auth/local/session/verify`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  let body: VerifyResponse;
  try {
    body = (await res.json()) as VerifyResponse;
  } catch {
    return null;
  }

  if (
    !body.valid ||
    !body.user_id ||
    !body.tenant_id ||
    !body.email
  ) {
    return null;
  }

  return {
    subject: body.user_id,
    email: body.email,
    tenantId: body.tenant_id,
    adminRole: body.admin_role ?? 'viewer',
  };
}

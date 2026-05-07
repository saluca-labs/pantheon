import 'server-only';

import { Role, Permission, hasPermission } from './permissions';

/**
 * Identity extracted from a WorkOS session JWT.
 */
export interface SessionIdentity {
  userId: string;
  role: Role;
  orgId: string;
  teamId: string;
  permissions: string[];
}

/**
 * Extract role and identity from a WorkOS session access token.
 *
 * Decodes the JWT payload from base64url (WorkOS middleware has already
 * verified the signature, so we only need to read claims).
 * Defaults role to 'viewer' if missing from the JWT (Pitfall 1 from research).
 */
export function extractRoleFromSession(session: {
  accessToken: string;
}): SessionIdentity {
  const parts = session.accessToken.split('.');
  if (parts.length < 2) {
    return {
      userId: '',
      role: Role.VIEWER,
      orgId: '',
      teamId: '',
      permissions: [],
    };
  }

  // Decode base64url JWT payload
  const payloadB64 = parts[1]
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const payloadJson = Buffer.from(payloadB64, 'base64').toString('utf-8');

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return {
      userId: '',
      role: Role.VIEWER,
      orgId: '',
      teamId: '',
      permissions: [],
    };
  }

  const rawRole = typeof payload.role === 'string' ? payload.role : '';
  const role = Object.values(Role).includes(rawRole as Role)
    ? (rawRole as Role)
    : Role.VIEWER;

  return {
    userId: typeof payload.sub === 'string' ? payload.sub : '',
    role,
    orgId: typeof payload.org_id === 'string' ? payload.org_id : '',
    teamId: typeof payload.team_id === 'string' ? payload.team_id : '',
    permissions: Array.isArray(payload.permissions)
      ? (payload.permissions as string[])
      : [],
  };
}

/**
 * Check if the session has the required permission.
 * Returns identity info alongside the authorization result.
 */
export function checkPermission(
  session: { accessToken: string },
  requiredPermission: Permission,
): {
  allowed: boolean;
  userId: string;
  role: Role;
  orgId: string;
  teamId: string;
} {
  const identity = extractRoleFromSession(session);
  const allowed = hasPermission(identity.role, requiredPermission);

  return {
    allowed,
    userId: identity.userId,
    role: identity.role,
    orgId: identity.orgId,
    teamId: identity.teamId,
  };
}

import 'server-only';

import { Role, Permission, hasPermission } from './permissions';

/**
 * Identity extracted from a local session user record.
 */
export interface SessionIdentity {
  userId: string;
  role: Role;
  orgId: string;
  teamId: string;
  permissions: string[];
}

/**
 * Extract role and identity from a local-auth session user.
 *
 * Roles are stored in a memberships table. For this pass, we read from the
 * user record directly. Role defaults to 'viewer' when not set.
 */
export function extractRoleFromLocalSession(user: {
  id: string;
  email: string;
  organizationId?: string | null;
  roles?: string[];
}): SessionIdentity {
  const rawRole = user.roles?.[0] ?? '';
  const role = Object.values(Role).includes(rawRole as Role)
    ? (rawRole as Role)
    : Role.VIEWER;

  return {
    userId: user.id,
    role,
    orgId: user.organizationId ?? '',
    teamId: '',
    permissions: [],
  };
}

/**
 * @deprecated Use extractRoleFromLocalSession instead.
 * Kept for backwards compatibility with existing code that passes an accessToken.
 */
export function extractRoleFromSession(session: {
  accessToken: string;
}): SessionIdentity {
  const parts = session.accessToken.split('.');
  if (parts.length < 2) {
    return { userId: '', role: Role.VIEWER, orgId: '', teamId: '', permissions: [] };
  }

  const payloadB64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
  const payloadJson = Buffer.from(payloadB64, 'base64').toString('utf-8');

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return { userId: '', role: Role.VIEWER, orgId: '', teamId: '', permissions: [] };
  }

  const rawRole = typeof payload['role'] === 'string' ? payload['role'] : '';
  const role = Object.values(Role).includes(rawRole as Role)
    ? (rawRole as Role)
    : Role.VIEWER;

  return {
    userId: typeof payload['sub'] === 'string' ? payload['sub'] : '',
    role,
    orgId: typeof payload['org_id'] === 'string' ? payload['org_id'] : '',
    teamId: typeof payload['team_id'] === 'string' ? payload['team_id'] : '',
    permissions: Array.isArray(payload['permissions'])
      ? (payload['permissions'] as string[])
      : [],
  };
}

/**
 * Check if the session has the required permission.
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
  return { allowed, userId: identity.userId, role: identity.role, orgId: identity.orgId, teamId: identity.teamId };
}

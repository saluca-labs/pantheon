import 'server-only';

import { Role, Permission, hasPermission as _hasPermission } from './permissions';

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
 * Re-export hasPermission so callers don't have to import from two places.
 */
export const hasPermission = _hasPermission;

/**
 * Extract role and identity from a local-auth session user.
 *
 * Roles are stored on the user record (and, in a future phase, on memberships).
 * Defaults to viewer when role is missing or invalid.
 */
export function extractRoleFromLocalSession(user: {
  id: string;
  email: string;
  organizationId?: string | null;
  teamId?: string | null;
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
    teamId: user.teamId ?? '',
    permissions: [],
  };
}

/**
 * Check if a local session user has the required permission.
 */
export function checkPermission(
  user: {
    id: string;
    email: string;
    organizationId?: string | null;
    teamId?: string | null;
    roles?: string[];
  },
  requiredPermission: Permission,
): {
  allowed: boolean;
  userId: string;
  role: Role;
  orgId: string;
  teamId: string;
} {
  const identity = extractRoleFromLocalSession(user);
  const allowed = _hasPermission(identity.role, requiredPermission);
  return {
    allowed,
    userId: identity.userId,
    role: identity.role,
    orgId: identity.orgId,
    teamId: identity.teamId,
  };
}

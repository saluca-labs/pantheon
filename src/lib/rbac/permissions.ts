/**
 * RBAC Permission System
 *
 * Defines roles, permissions, and default role-to-permission mappings
 * for the Tiresias dashboard. Used by both server-side BFF route handlers
 * and client-side RBAC context.
 */

export enum Role {
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

export enum Permission {
  POLICIES_CREATE = 'policies:create',
  POLICIES_DELETE = 'policies:delete',
  POLICIES_EDIT = 'policies:edit',
  KEYS_ROTATE = 'keys:rotate',
  KEYS_REVOKE = 'keys:revoke',
  MEMBERS_INVITE = 'members:invite',
  MEMBERS_MANAGE = 'members:manage',
  SETTINGS_MANAGE = 'settings:manage',
  SESSIONS_VIEW = 'sessions:view',
  COST_VIEW = 'cost:view',
}

/**
 * Default role-to-permission mapping.
 * Admin: all permissions
 * Member: create/edit policies, rotate keys, view sessions/cost
 * Viewer: read-only (sessions + cost) per D-03 and RBAC-02
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.ADMIN]: Object.values(Permission),
  [Role.MEMBER]: [
    Permission.POLICIES_CREATE,
    Permission.POLICIES_EDIT,
    Permission.KEYS_ROTATE,
    Permission.SESSIONS_VIEW,
    Permission.COST_VIEW,
  ],
  [Role.VIEWER]: [
    Permission.SESSIONS_VIEW,
    Permission.COST_VIEW,
  ],
};

/** Role hierarchy for comparison: admin > member > viewer */
const ROLE_HIERARCHY: Record<Role, number> = {
  [Role.ADMIN]: 3,
  [Role.MEMBER]: 2,
  [Role.VIEWER]: 1,
};

/**
 * Check if a role has a specific permission.
 * Supports optional overrides for configurable RBAC (D-03).
 */
export function hasPermission(
  role: Role,
  permission: Permission,
  overrides?: Record<Role, Permission[]>,
): boolean {
  const mapping = overrides ?? DEFAULT_ROLE_PERMISSIONS;
  const permissions = mapping[role];
  if (!permissions) return false;
  return permissions.includes(permission);
}

/**
 * Check if a role meets the minimum role threshold.
 * Role hierarchy: admin > member > viewer.
 */
export function isAtLeastRole(role: Role, minimumRole: Role): boolean {
  return (ROLE_HIERARCHY[role] ?? 0) >= (ROLE_HIERARCHY[minimumRole] ?? 0);
}

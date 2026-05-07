import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  isAtLeastRole,
  Role,
  Permission,
  DEFAULT_ROLE_PERMISSIONS,
} from '@/lib/rbac/permissions';

describe('hasPermission', () => {
  it('admin has policies:create permission', () => {
    expect(hasPermission(Role.ADMIN, Permission.POLICIES_CREATE)).toBe(true);
  });

  it('viewer does not have policies:create permission', () => {
    expect(hasPermission(Role.VIEWER, Permission.POLICIES_CREATE)).toBe(false);
  });

  it('member has policies:create permission', () => {
    expect(hasPermission(Role.MEMBER, Permission.POLICIES_CREATE)).toBe(true);
  });

  it('viewer has sessions:view permission (read-only access)', () => {
    expect(hasPermission(Role.VIEWER, Permission.SESSIONS_VIEW)).toBe(true);
  });

  it('admin has all permissions', () => {
    for (const perm of Object.values(Permission)) {
      expect(hasPermission(Role.ADMIN, perm)).toBe(true);
    }
  });

  it('viewer cannot manage members', () => {
    expect(hasPermission(Role.VIEWER, Permission.MEMBERS_MANAGE)).toBe(false);
  });

  // Configurable permissions override (D-03)
  it('supports configurable override: viewer granted policies:create', () => {
    const overrides: Record<Role, Permission[]> = {
      [Role.ADMIN]: Object.values(Permission),
      [Role.MEMBER]: [Permission.SESSIONS_VIEW],
      [Role.VIEWER]: [Permission.POLICIES_CREATE, Permission.SESSIONS_VIEW],
    };
    expect(hasPermission(Role.VIEWER, Permission.POLICIES_CREATE, overrides)).toBe(true);
  });

  it('supports configurable override: member losing keys:rotate', () => {
    const overrides: Record<Role, Permission[]> = {
      [Role.ADMIN]: Object.values(Permission),
      [Role.MEMBER]: [Permission.SESSIONS_VIEW, Permission.COST_VIEW],
      [Role.VIEWER]: [Permission.SESSIONS_VIEW],
    };
    expect(hasPermission(Role.MEMBER, Permission.KEYS_ROTATE, overrides)).toBe(false);
  });
});

describe('isAtLeastRole', () => {
  it('admin is at least member', () => {
    expect(isAtLeastRole(Role.ADMIN, Role.MEMBER)).toBe(true);
  });

  it('viewer is not at least member', () => {
    expect(isAtLeastRole(Role.VIEWER, Role.MEMBER)).toBe(false);
  });

  it('member is at least member', () => {
    expect(isAtLeastRole(Role.MEMBER, Role.MEMBER)).toBe(true);
  });

  it('admin is at least admin', () => {
    expect(isAtLeastRole(Role.ADMIN, Role.ADMIN)).toBe(true);
  });

  it('member is not at least admin', () => {
    expect(isAtLeastRole(Role.MEMBER, Role.ADMIN)).toBe(false);
  });
});

describe('DEFAULT_ROLE_PERMISSIONS', () => {
  it('has entries for all three roles', () => {
    expect(DEFAULT_ROLE_PERMISSIONS[Role.ADMIN]).toBeDefined();
    expect(DEFAULT_ROLE_PERMISSIONS[Role.MEMBER]).toBeDefined();
    expect(DEFAULT_ROLE_PERMISSIONS[Role.VIEWER]).toBeDefined();
  });

  it('admin has more permissions than member', () => {
    expect(DEFAULT_ROLE_PERMISSIONS[Role.ADMIN].length).toBeGreaterThan(
      DEFAULT_ROLE_PERMISSIONS[Role.MEMBER].length,
    );
  });

  it('member has more permissions than viewer', () => {
    expect(DEFAULT_ROLE_PERMISSIONS[Role.MEMBER].length).toBeGreaterThan(
      DEFAULT_ROLE_PERMISSIONS[Role.VIEWER].length,
    );
  });
});

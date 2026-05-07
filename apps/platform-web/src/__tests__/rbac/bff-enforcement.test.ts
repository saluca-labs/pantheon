import { describe, it, expect } from 'vitest';
import {
  checkPermission,
  extractRoleFromLocalSession,
} from '@/lib/rbac/check';
import { Role, Permission } from '@/lib/rbac/permissions';

/**
 * Helper: build a local session user shape consistent with @platform/auth's
 * validateSession() return value.
 */
function user(overrides: Partial<{
  id: string;
  email: string;
  organizationId: string | null;
  teamId: string | null;
  roles: string[];
}> = {}) {
  return {
    id: overrides.id ?? 'user_admin',
    email: overrides.email ?? 'admin@local',
    organizationId: overrides.organizationId ?? 'org_123',
    teamId: overrides.teamId ?? 'team_456',
    roles: overrides.roles ?? ['admin'],
  };
}

describe('BFF RBAC Enforcement (local-auth)', () => {
  describe('checkPermission', () => {
    it('admin returns allowed: true for MEMBERS_MANAGE', () => {
      const result = checkPermission(
        user({ id: 'user_admin', roles: ['admin'] }),
        Permission.MEMBERS_MANAGE,
      );
      expect(result.allowed).toBe(true);
      expect(result.role).toBe(Role.ADMIN);
      expect(result.userId).toBe('user_admin');
    });

    it('viewer returns allowed: false for MEMBERS_MANAGE', () => {
      const result = checkPermission(
        user({ id: 'user_viewer', roles: ['viewer'] }),
        Permission.MEMBERS_MANAGE,
      );
      expect(result.allowed).toBe(false);
      expect(result.role).toBe(Role.VIEWER);
    });

    it('member returns allowed: false for MEMBERS_MANAGE (admins only by default)', () => {
      const result = checkPermission(
        user({ id: 'user_member', roles: ['member'] }),
        Permission.MEMBERS_MANAGE,
      );
      expect(result.allowed).toBe(false);
      expect(result.role).toBe(Role.MEMBER);
    });

    it('admin can manage settings (SETTINGS_MANAGE)', () => {
      const result = checkPermission(
        user({ id: 'user_admin', roles: ['admin'] }),
        Permission.SETTINGS_MANAGE,
      );
      expect(result.allowed).toBe(true);
    });

    it('viewer cannot manage settings (SETTINGS_MANAGE)', () => {
      const result = checkPermission(
        user({ id: 'user_viewer', roles: ['viewer'] }),
        Permission.SETTINGS_MANAGE,
      );
      expect(result.allowed).toBe(false);
    });
  });

  describe('extractRoleFromLocalSession', () => {
    it('extracts admin identity correctly from a local session user', () => {
      const identity = extractRoleFromLocalSession(
        user({
          id: 'user_123',
          organizationId: 'org_456',
          teamId: 'team_789',
          roles: ['admin'],
        }),
      );
      expect(identity.userId).toBe('user_123');
      expect(identity.role).toBe(Role.ADMIN);
      expect(identity.orgId).toBe('org_456');
      expect(identity.teamId).toBe('team_789');
    });

    it('defaults to viewer when user has no role', () => {
      const identity = extractRoleFromLocalSession({
        id: 'user_no_role',
        email: 'norole@local',
        organizationId: 'org_456',
        teamId: 'team_789',
      });
      expect(identity.role).toBe(Role.VIEWER);
      expect(identity.userId).toBe('user_no_role');
    });

    it('defaults to viewer for an invalid role value', () => {
      const identity = extractRoleFromLocalSession({
        id: 'user_bad_role',
        email: 'bad@local',
        organizationId: 'org_456',
        roles: ['superadmin'],
      });
      expect(identity.role).toBe(Role.VIEWER);
    });

    it('handles a missing organizationId/teamId gracefully', () => {
      const identity = extractRoleFromLocalSession({
        id: 'user_no_org',
        email: 'noorg@local',
        roles: ['admin'],
      });
      expect(identity.role).toBe(Role.ADMIN);
      expect(identity.orgId).toBe('');
      expect(identity.teamId).toBe('');
    });
  });
});

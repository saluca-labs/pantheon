import { describe, it, expect } from 'vitest';
import {
  checkPermission,
  extractRoleFromSession,
} from '@/lib/rbac/check';
import { Role, Permission } from '@/lib/rbac/permissions';

/**
 * Helper: creates a mock JWT access token from a payload object.
 * WorkOS middleware verifies the signature; we only need to decode claims,
 * so we use a fake header/signature and a real base64url-encoded payload.
 */
function mockAccessToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = 'fake-signature';
  return `${header}.${body}.${signature}`;
}

describe('BFF RBAC Enforcement', () => {
  describe('checkPermission', () => {
    it('admin session returns allowed: true for MEMBERS_MANAGE', () => {
      const session = {
        accessToken: mockAccessToken({
          sub: 'user_admin',
          role: 'admin',
          org_id: 'org_123',
          team_id: 'team_456',
          permissions: ['members:manage'],
        }),
      };
      const result = checkPermission(session, Permission.MEMBERS_MANAGE);
      expect(result.allowed).toBe(true);
      expect(result.role).toBe(Role.ADMIN);
      expect(result.userId).toBe('user_admin');
    });

    it('viewer session returns allowed: false for MEMBERS_MANAGE', () => {
      const session = {
        accessToken: mockAccessToken({
          sub: 'user_viewer',
          role: 'viewer',
          org_id: 'org_123',
          team_id: 'team_456',
          permissions: ['sessions:view'],
        }),
      };
      const result = checkPermission(session, Permission.MEMBERS_MANAGE);
      expect(result.allowed).toBe(false);
      expect(result.role).toBe(Role.VIEWER);
    });

    it('member session returns allowed: false for MEMBERS_MANAGE (only admins manage members by default)', () => {
      const session = {
        accessToken: mockAccessToken({
          sub: 'user_member',
          role: 'member',
          org_id: 'org_123',
          team_id: 'team_456',
          permissions: ['policies:create'],
        }),
      };
      const result = checkPermission(session, Permission.MEMBERS_MANAGE);
      expect(result.allowed).toBe(false);
      expect(result.role).toBe(Role.MEMBER);
    });

    it('admin can manage settings (SETTINGS_MANAGE)', () => {
      const session = {
        accessToken: mockAccessToken({
          sub: 'user_admin',
          role: 'admin',
          org_id: 'org_123',
          team_id: 'team_456',
          permissions: [],
        }),
      };
      const result = checkPermission(session, Permission.SETTINGS_MANAGE);
      expect(result.allowed).toBe(true);
    });

    it('viewer cannot manage settings (SETTINGS_MANAGE)', () => {
      const session = {
        accessToken: mockAccessToken({
          sub: 'user_viewer',
          role: 'viewer',
          org_id: 'org_123',
          team_id: 'team_456',
          permissions: [],
        }),
      };
      const result = checkPermission(session, Permission.SETTINGS_MANAGE);
      expect(result.allowed).toBe(false);
    });
  });

  describe('extractRoleFromSession', () => {
    it('extracts admin identity correctly from JWT', () => {
      const session = {
        accessToken: mockAccessToken({
          sub: 'user_123',
          role: 'admin',
          org_id: 'org_456',
          team_id: 'team_789',
          permissions: ['policies:create', 'members:manage'],
        }),
      };
      const identity = extractRoleFromSession(session);
      expect(identity.userId).toBe('user_123');
      expect(identity.role).toBe(Role.ADMIN);
      expect(identity.orgId).toBe('org_456');
      expect(identity.teamId).toBe('team_789');
      expect(identity.permissions).toEqual(['policies:create', 'members:manage']);
    });

    it('defaults to viewer when JWT has no role field', () => {
      const session = {
        accessToken: mockAccessToken({
          sub: 'user_no_role',
          org_id: 'org_456',
          team_id: 'team_789',
        }),
      };
      const identity = extractRoleFromSession(session);
      expect(identity.role).toBe(Role.VIEWER);
      expect(identity.userId).toBe('user_no_role');
    });

    it('defaults to viewer for invalid role value', () => {
      const session = {
        accessToken: mockAccessToken({
          sub: 'user_bad_role',
          role: 'superadmin',
          org_id: 'org_456',
        }),
      };
      const identity = extractRoleFromSession(session);
      expect(identity.role).toBe(Role.VIEWER);
    });

    it('handles malformed JWT gracefully', () => {
      const session = { accessToken: 'not-a-jwt' };
      const identity = extractRoleFromSession(session);
      expect(identity.role).toBe(Role.VIEWER);
      expect(identity.userId).toBe('');
      expect(identity.orgId).toBe('');
    });
  });
});

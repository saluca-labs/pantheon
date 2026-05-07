import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoleGate } from '@/components/rbac/role-gate';
import { RBACProvider } from '@/lib/rbac/context';
import { Role, Permission } from '@/lib/rbac/permissions';

function renderWithRBAC(
  ui: React.ReactElement,
  role: Role,
  permissions: Permission[] = [],
) {
  return render(
    <RBACProvider role={role} permissions={permissions} userId="user_123">
      {ui}
    </RBACProvider>,
  );
}

describe('RoleGate', () => {
  it('renders children when user has an allowed role (admin)', () => {
    renderWithRBAC(
      <RoleGate allowedRoles={[Role.ADMIN]}>
        <span>Admin Content</span>
      </RoleGate>,
      Role.ADMIN,
    );
    expect(screen.getByText('Admin Content')).toBeDefined();
  });

  it('renders fallback when user does not have an allowed role (viewer for admin-only)', () => {
    renderWithRBAC(
      <RoleGate allowedRoles={[Role.ADMIN]} fallback={<span>Access Denied</span>}>
        <span>Admin Content</span>
      </RoleGate>,
      Role.VIEWER,
    );
    expect(screen.queryByText('Admin Content')).toBeNull();
    expect(screen.getByText('Access Denied')).toBeDefined();
  });

  it('renders children when user has one of multiple allowed roles (member)', () => {
    renderWithRBAC(
      <RoleGate allowedRoles={[Role.ADMIN, Role.MEMBER]}>
        <span>Member Content</span>
      </RoleGate>,
      Role.MEMBER,
    );
    expect(screen.getByText('Member Content')).toBeDefined();
  });

  it('renders nothing (no fallback) when user lacks role and no fallback provided', () => {
    const { container } = renderWithRBAC(
      <RoleGate allowedRoles={[Role.ADMIN]}>
        <span>Admin Only</span>
      </RoleGate>,
      Role.VIEWER,
    );
    expect(screen.queryByText('Admin Only')).toBeNull();
    // Container should have empty content besides the provider wrapper
    expect(container.textContent).toBe('');
  });
});

'use client';

import { useRBAC } from '@/lib/rbac/context';
import { Role } from '@/lib/rbac/permissions';

interface RoleGateProps {
  allowedRoles: Role[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Conditionally renders children based on the current user's role.
 * Used throughout the dashboard to gate admin-only or member-only sections.
 * Per RBAC-02/03/04: declarative access control at the UI layer.
 */
export function RoleGate({ allowedRoles, children, fallback = null }: RoleGateProps) {
  const { role } = useRBAC();
  if (!allowedRoles.includes(role)) return <>{fallback}</>;
  return <>{children}</>;
}

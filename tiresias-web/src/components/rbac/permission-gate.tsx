'use client';

import { useRBAC } from '@/lib/rbac/context';
import { Permission } from '@/lib/rbac/permissions';

interface PermissionGateProps {
  requiredPermission: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Conditionally renders children based on the current user's permissions.
 * More granular than RoleGate -- checks specific permission slugs rather
 * than role identity. Supports configurable RBAC (D-03) since permissions
 * are derived from the RBAC context which can reflect overrides.
 */
export function PermissionGate({ requiredPermission, children, fallback = null }: PermissionGateProps) {
  const { permissions } = useRBAC();
  if (!permissions.includes(requiredPermission)) return <>{fallback}</>;
  return <>{children}</>;
}

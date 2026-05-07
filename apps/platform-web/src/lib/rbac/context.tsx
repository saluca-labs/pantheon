'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Role, Permission } from './permissions';

interface RBACContextValue {
  role: Role;
  permissions: Permission[];
  userId: string;
}

const RBACContext = createContext<RBACContextValue | null>(null);

/**
 * Provides RBAC role and permission data to client components.
 * Populated by the dashboard layout from server-side session data
 * (per RBAC-02, RBAC-03, RBAC-04).
 */
export function RBACProvider({
  role,
  permissions,
  userId,
  children,
}: RBACContextValue & { children: ReactNode }) {
  return (
    <RBACContext.Provider value={{ role, permissions, userId }}>
      {children}
    </RBACContext.Provider>
  );
}

/**
 * Access RBAC context from client components.
 * Throws if used outside of RBACProvider.
 */
export function useRBAC(): RBACContextValue {
  const ctx = useContext(RBACContext);
  if (!ctx) {
    throw new Error('useRBAC must be used within an RBACProvider');
  }
  return ctx;
}

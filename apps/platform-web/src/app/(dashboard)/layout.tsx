import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { validateSession } from '@platform/auth';
import { getSessionToken } from '@platform/auth/cookies';
import type { ReadableCookieStore } from '@platform/auth/cookies';
import DashboardSidebar from '@/components/layout/dashboard-sidebar';
import DashboardHeader from '@/components/layout/dashboard-header';
import { QueryProvider } from '@/lib/providers/query-provider';
import { RBACProvider } from '@/lib/rbac/context';
import { extractRoleFromLocalSession } from '@/lib/rbac/check';
import { DEFAULT_ROLE_PERMISSIONS } from '@/lib/rbac/permissions';
import { Pool } from 'pg';
import { getFlags } from '@/lib/agentic-os/flags/repo';
import { AGENTIC_OS_MODULES } from '@/lib/agentic-os/registry';

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env['DATABASE_URL'], max: 5 });
  }
  return _pool;
}

/**
 * Dashboard layout — unified shell across portal + platform-web (W-G.shell).
 *
 * Renders portal's `DashboardSidebar` + `DashboardHeader` (copied into
 * `components/layout/`) on top of platform-web's existing auth gate +
 * Query/RBAC providers. The auth gate, flag-loading, and RBAC plumbing are
 * preserved as-is — only the visible chrome swapped.
 *
 * `enabledSlugs` is still resolved server-side for future per-tenant Pantheon
 * group filtering; the current shell renders all nine OS items unconditionally
 * (per "no tier gating by default" directive).
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = getSessionToken(cookieStore as unknown as ReadableCookieStore);

  if (!token) {
    redirect('/login');
  }

  const result = await validateSession(token, getPool());

  if (!result) {
    redirect('/login');
  }

  // Extract role and identity from the local session
  const identity = extractRoleFromLocalSession(result.user);

  // Use default role permissions as the canonical permission set
  const permissions = DEFAULT_ROLE_PERMISSIONS[identity.role] ?? [];

  // Resolve per-user feature flags server-side so a future filtered nav can
  // gate items without a client-side DB call. Today the shell renders all
  // items unconditionally, but the resolved set stays available for per-tenant
  // filtering when we add it back.
  let enabledSlugs: string[] = AGENTIC_OS_MODULES.map((m) => m.slug);
  try {
    const flags = await getFlags(identity.userId);
    enabledSlugs = AGENTIC_OS_MODULES.filter(
      (m) => flags[m.slug] !== false,
    ).map((m) => m.slug);
  } catch {
    // Table may not exist yet on a fresh DB before 0013 has been applied;
    // fall back to "everything enabled" so the dashboard still renders.
  }
  void enabledSlugs; // reserved for future per-tenant gating

  return (
    <QueryProvider>
      <RBACProvider
        role={identity.role}
        permissions={permissions}
        userId={identity.userId}
      >
        <div className="flex h-screen overflow-hidden">
          <DashboardSidebar />
          <div className="flex-1 flex flex-col overflow-hidden">
            <DashboardHeader />
            <main className="flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>
        </div>
      </RBACProvider>
    </QueryProvider>
  );
}

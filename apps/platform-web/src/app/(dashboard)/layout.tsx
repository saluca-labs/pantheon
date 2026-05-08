import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { validateSession } from '@platform/auth';
import { getSessionToken } from '@platform/auth/cookies';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { MobileNav } from '@/components/layout/mobile-nav';
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

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = getSessionToken(cookieStore as any);

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

  // Resolve per-user feature flags server-side so the sidebar (client
  // component) receives only a plain string[] — no DB calls in client land.
  // Failures here are non-fatal: missing flags rows default to all enabled.
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

  return (
    <QueryProvider>
      <RBACProvider
        role={identity.role}
        permissions={permissions}
        userId={identity.userId}
      >
        <div className="flex h-screen overflow-hidden">
          <Sidebar enabledSlugs={enabledSlugs} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Topbar userEmail={result.user.email} displayName={result.user.displayName} />
            <div className="md:hidden px-4 py-2 border-b border-[#2a2d3e] bg-[#1a1d27]">
              <MobileNav enabledSlugs={enabledSlugs} />
            </div>
            <main className="flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>
        </div>
      </RBACProvider>
    </QueryProvider>
  );
}

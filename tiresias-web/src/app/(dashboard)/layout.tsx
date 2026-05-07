import { withAuth } from '@workos-inc/authkit-nextjs';
import { redirect } from 'next/navigation';
import { AuthKitProvider } from '@workos-inc/authkit-nextjs/components';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { MobileNav } from '@/components/layout/mobile-nav';
import { QueryProvider } from '@/lib/providers/query-provider';
import { RBACProvider } from '@/lib/rbac/context';
import { extractRoleFromSession } from '@/lib/rbac/check';
import { DEFAULT_ROLE_PERMISSIONS } from '@/lib/rbac/permissions';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await withAuth();

  if (!session.user) {
    redirect('/login');
  }

  // Extract role and identity from the WorkOS JWT access token
  const identity = extractRoleFromSession(session);

  // Use default role permissions as the canonical permission set
  // (JWT permissions may be a subset; defaults are the source of truth)
  const permissions = DEFAULT_ROLE_PERMISSIONS[identity.role] ?? [];

  return (
    <AuthKitProvider>
      <QueryProvider>
        <RBACProvider
          role={identity.role}
          permissions={permissions}
          userId={identity.userId}
        >
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
              <Topbar />
              <div className="md:hidden px-4 py-2 border-b border-[#2a2d3e] bg-[#1a1d27]">
                <MobileNav />
              </div>
              <main className="flex-1 overflow-y-auto p-6">
                {children}
              </main>
            </div>
          </div>
        </RBACProvider>
      </QueryProvider>
    </AuthKitProvider>
  );
}

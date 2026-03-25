import { withAuth } from '@workos-inc/authkit-nextjs';
import { redirect } from 'next/navigation';
import { AuthKitProvider } from '@workos-inc/authkit-nextjs/components';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { MobileNav } from '@/components/layout/mobile-nav';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await withAuth();

  if (!session.user) {
    redirect('/login');
  }

  return (
    <AuthKitProvider>
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
    </AuthKitProvider>
  );
}

import type { Metadata } from "next";
import Navbar from "@/components/layout/Navbar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";

export const metadata: Metadata = {
  title: "Dashboard | Tiresias",
  description: "Tiresias enterprise dashboard -- monitor agents, policies, and security events.",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-of-background">
      <Navbar />
      <div className="flex pt-16">
        <DashboardSidebar />
        <main className="flex-1 overflow-y-auto min-h-[calc(100vh-4rem)] p-6 lg:p-8 relative"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(90,218,206,0.012) 1px, transparent 0)`,
            backgroundSize: "24px 24px",
          }}
        >
          {/* Subtle top fade for depth */}
          <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-of-background/50 to-transparent pointer-events-none z-0" />
          <div className="relative z-10">
            {children}
          </div>
        </main>
      </div>
      {/* Custom scrollbar styling */}
      <style>{`
        main::-webkit-scrollbar {
          width: 6px;
        }
        main::-webkit-scrollbar-track {
          background: transparent;
        }
        main::-webkit-scrollbar-thumb {
          background: rgba(90,218,206,0.08);
          border-radius: 3px;
        }
        main::-webkit-scrollbar-thumb:hover {
          background: rgba(90,218,206,0.14);
        }
        .scrollbar-thin::-webkit-scrollbar {
          width: 4px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(90,218,206,0.06);
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
}

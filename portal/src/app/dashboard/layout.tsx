import type { Metadata } from "next";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import ChatWidget from "@/components/dashboard/ChatWidget";

export const metadata: Metadata = {

/** Dashboard shell layout -- renders header, sidebar, and scrollable content area. */
  title: "Dashboard | Tiresias",
  description: "Tiresias enterprise dashboard -- monitor agents, policies, and security events.",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-of-background flex flex-col">
      <DashboardHeader />
      <div className="flex flex-1 overflow-hidden">
        <DashboardSidebar />
        <main className="flex-1 overflow-y-auto p-6 md:p-8 relative"
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
      {/* Floating support chatbot — visible across all dashboard pages */}
      <ChatWidget />
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

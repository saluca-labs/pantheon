
"use client";

import { usePathname } from "next/navigation";
import { Search, Bell, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/overview": "Overview",
  "/dashboard/traces": "Traces",
  "/dashboard/sessions": "Sessions",
  "/dashboard/providers": "Providers",
  "/dashboard/costs": "Costs",
  "/dashboard/playground": "Playground",
  "/dashboard/agents": "Agents",
  "/dashboard/policies": "Policies",
  "/dashboard/audit": "Audit Trail",
  "/dashboard/detection": "Detection Feed",
  "/dashboard/detection/prh": "Prompt Risk Heuristic",
  "/dashboard/detection/siem": "SIEM Configuration",
  "/dashboard/detection/rules": "Rule Editor",
  "/dashboard/detection/playbooks": "Response Playbooks",
  "/dashboard/quarantine": "Quarantine",
  "/dashboard/analytics": "Analytics",
  "/dashboard/settings": "Settings",
  // MSSP routes (Phase 13)
  "/dashboard/mssp": "MSSP Overview",
  "/dashboard/mssp/detection": "Cross-Tenant Detection",
  "/dashboard/mssp/saas": "SaaS Admin",
};

// Tiers that get a badge in the header (DTIER-04)
// community, starter, pro, enterprise do NOT get a badge
const BADGE_TIERS: Record<string, { label: string; className: string }> = {
  mssp: {
    label: "MSSP",
    className:
      "bg-of-primary/15 border border-of-primary/30 text-of-primary",
  },
  saas: {
    label: "SaaS",
    className:
      "bg-purple-500/15 border border-purple-500/30 text-purple-400",
  },
};

export default function DashboardHeader() {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? "Dashboard";
  const { session } = useAuth();
  const badge = session?.tier ? BADGE_TIERS[session.tier] : undefined;

  return (
    <header className="h-16 sticky top-0 z-40 bg-of-surface-container-low/80 backdrop-blur-md border-b border-of-outline-variant/10 flex items-center justify-between px-8 shrink-0">
      {/* Left: tier badge (only mssp/saas) + page title */}
      <div className="flex items-center gap-3">
        {badge && (
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase ${badge.className}`}
          >
            {badge.label}
          </span>
        )}
        <h2 className="text-lg font-black text-of-primary tracking-tight">
          {title}
        </h2>
      </div>

      {/* Right: search + actions */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-of-on-surface-variant" />
          <input
            type="text"
            placeholder="Search..."
            className="h-8 pl-9 pr-4 rounded-lg bg-of-surface-container border border-of-outline-variant/20 text-sm text-of-on-surface placeholder:text-of-on-surface-variant/50 focus:outline-none focus:border-of-primary/40 w-48 transition-colors"
          />
        </div>

        {/* Notification bell */}
        <button className="h-8 w-8 rounded-lg flex items-center justify-center text-of-on-surface-variant hover:text-of-on-surface hover:bg-of-surface-container transition-colors">
          <Bell className="h-4 w-4" />
        </button>

        {/* Settings */}
        <button className="h-8 w-8 rounded-lg flex items-center justify-center text-of-on-surface-variant hover:text-of-on-surface hover:bg-of-surface-container transition-colors">
          <Settings className="h-4 w-4" />
        </button>

        {/* User avatar */}
        <div className="h-8 w-8 rounded-full bg-of-primary/20 border border-of-primary/30 flex items-center justify-center">
          <span className="text-xs font-bold text-of-primary">
            {session?.tenant_name?.slice(0, 1).toUpperCase() ?? "T"}
          </span>
        </div>
      </div>
    </header>
  );
}

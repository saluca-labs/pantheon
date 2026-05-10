/**
 * @module DashboardHeader
 *
 * Dashboard header bar displayed at the top of every dashboard page.
 *
 * Features:
 *  - **Aletheia status indicator** (enterprise+ only): polls `/v1/aletheia/cot/chain`
 *    every 60s and shows a green dot when the CoT hash chain is healthy.
 *  - **Dynamic document title & favicon**: updates `document.title` and the
 *    favicon link element based on `branding.company_name` / `branding.favicon_url`
 *    for white-label tenants (WL-05).
 *  - **Tier badge**: renders MSSP / SaaS badge for elevated tiers (DTIER-04).
 *  - **Navigation breadcrumbs**: resolves the current pathname to a human-readable
 *    page title from the `PAGE_TITLES` map.
 */
"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Search, Bell, Settings, LogOut, User, ArrowLeftRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { tierMeets } from "@/components/dashboard/TierGate";
import { useWidgetData } from "@/lib/useWidgetData";
import { useBranding } from "@/lib/branding";

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
  // SoulWatch routes
  "/dashboard/soulwatch": "SoulWatch",
  "/dashboard/soulwatch/anomalies": "Anomalies",
  "/dashboard/soulwatch/rules": "SoulWatch Rules",
  "/dashboard/soulwatch/integrations": "Integrations",
  "/dashboard/soulwatch/quarantines": "SoulWatch Quarantines",
  "/dashboard/soulwatch/reports": "SoulWatch Reports",
  // SoulGate routes
  "/dashboard/soulgate": "SoulGate",
  "/dashboard/soulgate/upstreams": "Upstreams",
  "/dashboard/soulgate/rate-limits": "Rate Limits",
  "/dashboard/soulgate/access": "Access Rules",
  "/dashboard/soulgate/keys": "API Keys",
  "/dashboard/soulgate/audit": "SoulGate Audit Log",
  "/dashboard/analytics": "Analytics",
  "/dashboard/settings": "Settings",
  "/dashboard/support": "Support",
  // Aletheia routes (Phase 17)
  "/dashboard/aletheia": "Aletheia Overview",
  "/dashboard/aletheia/cot-audit": "CoT Audit",
  "/dashboard/aletheia/tool-activity": "Tool Activity",
  "/dashboard/aletheia/sanitizer": "Sanitizer",
  "/dashboard/aletheia/policies": "Policy Editor",
  // Partner routes
  "/dashboard/partner": "Partner Dashboard",
  "/dashboard/partner/connect": "Stripe Connect",
  "/dashboard/partner/promos": "Promo Codes",
  // Investigation & Contracts routes
  "/dashboard/investigation": "Investigation",
  "/dashboard/contracts": "Contracts",
  // MSSP routes (Phase 13)
  "/dashboard/mssp": "MSSP Overview",
  "/dashboard/mssp/detection": "Cross-Tenant Detection",
  "/dashboard/mssp/saas": "SaaS Admin",
  // MSSP Aletheia routes (Phase 17 Plan 02)
  "/dashboard/mssp/aletheia": "MSSP Aletheia Audit",
  "/dashboard/mssp/aletheia/policies": "MSSP Policy Push",
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
  const { session, logout } = useAuth();
  const { branding } = useBranding();
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement>(null);

  // Close avatar dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false);
      }
    }
    if (avatarMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [avatarMenuOpen]);
  const badge = session?.tier ? BADGE_TIERS[session.tier] : undefined;
  const isEnterprisePlus = tierMeets(session?.tier ?? "community", "enterprise");

  // Aletheia status indicator (ALETH-14)
  const { data: aletheiaStatus, loading: aletheiaLoading, error: aletheiaError } = useWidgetData<{ entries?: unknown[] }>({
    endpoint: "/v1/aletheia/cot/chain?limit=1",
    refreshInterval: 60000,
    skip: !isEnterprisePlus,
  });
  const aletheiaHealthy = isEnterprisePlus && !aletheiaLoading && !aletheiaError && aletheiaStatus != null;

  // Update document title when branding.company_name or page title changes (WL-05)
  useEffect(() => {
    if (branding.company_name) {
      document.title = `${title} | ${branding.company_name}`;
    } else {
      document.title = `${title} | Pantheon`;
    }
  }, [title, branding.company_name]);

  // Update favicon when branding.favicon_url changes (WL-05)
  useEffect(() => {
    if (!branding.favicon_url) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = branding.favicon_url;
  }, [branding.favicon_url]);

  return (
    <header className="h-16 sticky top-0 z-40 bg-of-surface-container-low/80 backdrop-blur-md border-b border-of-outline-variant/10 flex items-center justify-between px-8 shrink-0">
      {/* Left: tenant logo (WL-04) + tier badge (only mssp/saas) + page title */}
      <div className="flex items-center gap-3">
        {branding.logo_url && (
          <img
            src={branding.logo_url}
            alt={branding.company_name ?? ""}
            className="h-6 w-auto object-contain max-w-[100px]"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
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

        {/* Aletheia status indicator (ALETH-14) */}
        {isEnterprisePlus && (
          <div className="flex items-center gap-1.5 px-2" title={aletheiaHealthy ? "Aletheia active" : "Aletheia loading"}>
            <span className={`w-2 h-2 rounded-full ${aletheiaHealthy ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" : "bg-of-on-surface-variant/40"}`} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Aletheia</span>
          </div>
        )}

        {/* Notification bell */}
        <button className="h-8 w-8 rounded-lg flex items-center justify-center text-of-on-surface-variant hover:text-of-on-surface hover:bg-of-surface-container transition-colors">
          <Bell className="h-4 w-4" />
        </button>

        {/* Settings */}
        <Link
          href="/dashboard/settings"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-of-on-surface-variant hover:text-of-on-surface hover:bg-of-surface-container transition-colors"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </Link>

        {/* User avatar with dropdown */}
        <div className="relative" ref={avatarMenuRef}>
          <button
            onClick={() => setAvatarMenuOpen((v) => !v)}
            className="h-8 w-8 rounded-full bg-of-primary/20 border border-of-primary/30 flex items-center justify-center cursor-pointer hover:bg-of-primary/30 transition-colors"
            title="Account menu"
          >
            <span className="text-xs font-bold text-of-primary">
              {session?.user_name?.slice(0, 1).toUpperCase() ?? session?.tenant_name?.slice(0, 1).toUpperCase() ?? "U"}
            </span>
          </button>

          {avatarMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-of-outline-variant/20 bg-of-surface-container shadow-xl py-1 z-50">
              {/* User identity section */}
              <div className="px-4 py-3 border-b border-of-outline-variant/10">
                <p className="text-sm font-semibold text-of-on-surface truncate">
                  {session?.user_name ?? session?.persona_id ?? "User"}
                </p>
                {session?.user_email && (
                  <p className="text-xs text-of-on-surface-variant truncate mt-0.5">
                    {session.user_email}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-of-primary/10 text-[9px] font-semibold text-of-primary tracking-wide uppercase border border-of-primary/15">
                    {session?.tenant_name ?? "Tenant"}
                  </span>
                  <span className="text-[10px] text-of-on-surface-variant">
                    {session?.tier ?? "community"}
                  </span>
                </div>
              </div>

              {/* User Settings link */}
              <Link
                href="/dashboard/settings?tab=preferences"
                onClick={() => setAvatarMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-sm text-of-on-surface-variant hover:text-of-on-surface hover:bg-of-surface-container-high transition-colors"
              >
                <User className="h-3.5 w-3.5" />
                User Settings
              </Link>

              {/* System Settings link */}
              <Link
                href="/dashboard/settings"
                onClick={() => setAvatarMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-sm text-of-on-surface-variant hover:text-of-on-surface hover:bg-of-surface-container-high transition-colors"
              >
                <Settings className="h-3.5 w-3.5" />
                System Settings
              </Link>

              {/* Switch Tenant (MSSP users) */}
              {(session?.tier === "mssp" || session?.tier === "saas" || session?.tier === "owner") && (
                <button
                  onClick={() => {
                    setAvatarMenuOpen(false);
                    // Navigate to MSSP tenant switcher
                    window.location.href = "/dashboard/mssp?action=switch-tenant";
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-of-on-surface-variant hover:text-of-on-surface hover:bg-of-surface-container-high transition-colors"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  Switch Tenant
                </button>
              )}

              {/* Divider */}
              <div className="my-1 border-t border-of-outline-variant/10" />

              {/* Logout */}
              <button
                onClick={() => {
                  setAvatarMenuOpen(false);
                  logout();
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-of-surface-container-high transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

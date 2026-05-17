/**
 * @module DashboardSidebar
 *
 * Dashboard navigation sidebar — unified shell across portal + platform-web (W-G.shell).
 *
 * Ported from portal/src/components/dashboard/DashboardSidebar.tsx with:
 *  - Obsidian Flux (`bg-of-*`, `text-of-*`, `border-of-*`) tokens swapped for
 *    Saluca surface/accent tokens (surface-2, accent, text-primary, etc.).
 *  - Auth + branding pulled from `@/lib/auth-shell` / `@/lib/branding-shell`
 *    (thin platform-web stubs reading the OIDC cookie).
 *  - "Oscar Suite" group label renamed to "Pantheon" per Cristian's directive
 *    (the group `key` stays `"oscar-suite"` for code stability).
 *  - `isOscarSuiteVisible` filter dropped — the Pantheon group always shows.
 *  - `minTier` per-item gates dropped — items always show.
 *  - MSSP-tier gate KEPT (operator-persona scope, not customer tier).
 *  - `isSalucaUser` Platform Admin gate KEPT.
 *
 * Features:
 *  - **Auto-collapse**: sidebar collapses to icon-only mode below 1024px viewport width.
 *  - **White-label logo**: renders `branding.logo_url` when available, otherwise
 *    the default Tiresias logo mark (WL-04).
 *  - **Animated transitions**: uses framer-motion for smooth expand/collapse,
 *    active-item indicator sliding, and label fade animations.
 *  - **Support link**: pinned above the user info section at the sidebar bottom.
 */
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, GitBranch, Users, Boxes, DollarSign, FlaskConical, ShieldAlert, Radar, BookOpen, Code2, Activity, Server, Building2, ScanSearch, Ban, LifeBuoy, Eye, Link2, Terminal, ShieldCheck, FileCode, ChevronDown, Search, FileText, Crown, MessageCircle, Heart, Wrench, Microscope, Shield, Film, PenTool, Briefcase, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-shell";
import { useBranding } from "@/lib/branding-shell";
import { tierMeets } from "@/components/layout/tier-gate";

// Tier helper inline (operator-persona MSSP gate — kept per W-G.shell directive)
const MSSP_TIERS = new Set(["mssp", "saas", "owner"]);

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  group?: "observability" | "main" | "security" | "soulwatch" | "soulgate" | "system" | "mssp" | "aletheia" | "platform-admin" | "oscar-suite";
  /** When true, only visible for saas-tier tenants. */
  saasOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Overview",
    href: "/dashboard/overview",
    group: "observability",
    icon: <LayoutDashboard className="w-5 h-5" />,
  },
  {
    label: "Traces",
    href: "/dashboard/traces",
    group: "observability",
    icon: <GitBranch className="w-5 h-5" />,
  },
  {
    label: "Sessions",
    href: "/dashboard/sessions",
    group: "observability",
    icon: <Users className="w-5 h-5" />,
  },
  {
    label: "Providers",
    href: "/dashboard/providers",
    group: "observability",
    icon: <Boxes className="w-5 h-5" />,
  },
  {
    label: "Costs",
    href: "/dashboard/costs",
    group: "observability",
    icon: <DollarSign className="w-5 h-5" />,
  },
  {
    label: "Playground",
    href: "/dashboard/playground",
    group: "observability",
    icon: <FlaskConical className="w-5 h-5" />,
  },
  {
    label: "Dashboard",
    href: "/dashboard",
    group: "main",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
      </svg>
    ),
  },
  {
    label: "Agents",
    href: "/dashboard/agents",
    group: "main",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
      </svg>
    ),
  },
  {
    label: "Policies",
    href: "/dashboard/policies",
    group: "main",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    label: "Documentation",
    href: "/dashboard/docs",
    group: "main",
    icon: <BookOpen className="w-5 h-5" />,
  },
  {
    label: "Audit Trail",
    href: "/dashboard/audit",
    group: "security",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
  },
  {
    label: "Detection Feed",
    href: "/dashboard/detection",
    group: "security",
    icon: <Radar className="w-5 h-5" />,
  },
  {
    label: "PRH",
    href: "/dashboard/detection/prh",
    group: "security",
    icon: <Activity className="w-5 h-5" />,
  },
  {
    label: "SIEM Config",
    href: "/dashboard/detection/siem",
    group: "security",
    icon: <Server className="w-5 h-5" />,
  },
  {
    label: "Rule Editor",
    href: "/dashboard/detection/rules",
    group: "security",
    icon: <Code2 className="w-5 h-5" />,
  },
  {
    label: "Playbooks",
    href: "/dashboard/detection/playbooks",
    group: "security",
    icon: <BookOpen className="w-5 h-5" />,
  },
  {
    label: "Quarantine",
    href: "/dashboard/quarantine",
    group: "security",
    icon: <ShieldAlert className="w-5 h-5" />,
  },
  {
    label: "SoulWatch",
    href: "/dashboard/soulwatch",
    group: "soulwatch",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    label: "Anomalies",
    href: "/dashboard/soulwatch/anomalies",
    group: "soulwatch",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    label: "Rules",
    href: "/dashboard/soulwatch/rules",
    group: "soulwatch",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
  },
  {
    label: "Quarantines",
    href: "/dashboard/soulwatch/quarantines",
    group: "soulwatch",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
      </svg>
    ),
  },
  {
    label: "Integrations",
    href: "/dashboard/soulwatch/integrations",
    group: "soulwatch",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
  },
  {
    label: "Reports",
    href: "/dashboard/soulwatch/reports",
    group: "soulwatch",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
      </svg>
    ),
  },
  {
    label: "SoulGate",
    href: "/dashboard/soulgate",
    group: "soulgate",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
  },
  {
    label: "Upstreams",
    href: "/dashboard/soulgate/upstreams",
    group: "soulgate",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
  {
    label: "Rate Limits",
    href: "/dashboard/soulgate/rate-limits",
    group: "soulgate",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    label: "Access Rules",
    href: "/dashboard/soulgate/access",
    group: "soulgate",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    label: "API Keys",
    href: "/dashboard/settings?tab=api-keys",
    group: "soulgate",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
  },
  {
    label: "Audit Log",
    href: "/dashboard/soulgate/audit",
    group: "soulgate",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
  },
  {
    label: "Analytics",
    href: "/dashboard/analytics",
    group: "system",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
      </svg>
    ),
  },
  {
    label: "API Keys",
    href: "/dashboard/settings?tab=api-keys",
    group: "system",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    group: "system",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    label: "Retention",
    href: "/dashboard/settings/retention",
    group: "system",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  // MSSP nav items -- only rendered when tier is mssp or saas (DTIER-01)
  {
    label: "MSSP Overview",
    href: "/dashboard/mssp",
    group: "mssp",
    icon: <Building2 className="w-5 h-5" />,
  },
  {
    label: "Cross-Tenant Detection",
    href: "/dashboard/mssp/detection",
    group: "mssp",
    icon: <ScanSearch className="w-5 h-5" />,
  },
  {
    label: "Tenant Admin",
    href: "/dashboard/mssp/saas",
    group: "mssp",
    icon: <Ban className="w-5 h-5" />,
  },
  {
    label: "Aletheia Audit",
    href: "/dashboard/mssp/aletheia",
    group: "mssp",
    icon: <Eye className="w-5 h-5" />,
  },
  {
    label: "Policy Push",
    href: "/dashboard/mssp/aletheia/policies",
    group: "mssp",
    icon: <FileCode className="w-5 h-5" />,
  },
  {
    label: "Partner",
    href: "/dashboard/partner",
    group: "mssp",
    icon: <Users className="w-5 h-5" />,
  },
  // Platform Admin group items -- only visible to @saluca.com users
  {
    label: "Platform Admin",
    href: "/dashboard/mssp/master",
    group: "platform-admin",
    icon: <Crown className="w-5 h-5" />,
  },
  {
    label: "Contracts",
    href: "/dashboard/contracts",
    group: "platform-admin",
    icon: <FileText className="w-5 h-5" />,
  },
  // Aletheia nav items -- always rendered (tier gate dropped per W-G.shell)
  {
    label: "Overview",
    href: "/dashboard/aletheia",
    group: "aletheia",
    icon: <Eye className="w-5 h-5" />,
  },
  {
    label: "CoT Audit",
    href: "/dashboard/aletheia/cot-audit",
    group: "aletheia",
    icon: <Link2 className="w-5 h-5" />,
  },
  {
    label: "Tool Activity",
    href: "/dashboard/aletheia/tool-activity",
    group: "aletheia",
    icon: <Terminal className="w-5 h-5" />,
  },
  {
    label: "Sanitizer",
    href: "/dashboard/aletheia/sanitizer",
    group: "aletheia",
    icon: <ShieldCheck className="w-5 h-5" />,
  },
  {
    label: "Policies",
    href: "/dashboard/aletheia/policies",
    group: "aletheia",
    icon: <FileCode className="w-5 h-5" />,
  },
  // Pantheon (formerly Oscar Suite) -- the 9 OSes (routed to platform-web via /dashboard/os/<slug>)
  {
    label: "Health",
    href: "/dashboard/os/health",
    group: "oscar-suite",
    icon: <Heart className="w-5 h-5" />,
  },
  {
    label: "Maker",
    href: "/dashboard/os/maker",
    group: "oscar-suite",
    icon: <Wrench className="w-5 h-5" />,
  },
  {
    label: "Research",
    href: "/dashboard/os/research",
    group: "oscar-suite",
    icon: <Microscope className="w-5 h-5" />,
  },
  {
    label: "Secure Dev",
    href: "/dashboard/os/secure-dev",
    group: "oscar-suite",
    icon: <ShieldCheck className="w-5 h-5" />,
  },
  {
    label: "Cyber",
    href: "/dashboard/os/cyber",
    group: "oscar-suite",
    icon: <Shield className="w-5 h-5" />,
  },
  {
    label: "Filmmaker",
    href: "/dashboard/os/filmmaker",
    group: "oscar-suite",
    icon: <Film className="w-5 h-5" />,
  },
  {
    label: "Autobiographer",
    href: "/dashboard/os/autobiographer",
    group: "oscar-suite",
    icon: <PenTool className="w-5 h-5" />,
  },
  {
    label: "Business",
    href: "/dashboard/os/business",
    group: "oscar-suite",
    icon: <Briefcase className="w-5 h-5" />,
  },
  {
    label: "Creator",
    href: "/dashboard/os/creator",
    group: "oscar-suite",
    icon: <Sparkles className="w-5 h-5" />,
  },
];

// All groups including mssp -- mssp rendered conditionally below.
// Group `key` retains historical "oscar-suite" for code stability; only the
// displayed `label` is "Pantheon" per W-G.shell directive.
const BASE_GROUPS = [
  { key: "observability", label: "Observability" },
  { key: "main", label: "Overview" },
  { key: "oscar-suite", label: "Pantheon" },
  { key: "security", label: "Detection" },
  { key: "soulwatch", label: "SoulWatch" },
  { key: "soulgate", label: "SoulGate" },
  { key: "aletheia", label: "Aletheia" },
  { key: "system", label: "System" },
] as const;

const MSSP_GROUP = { key: "mssp", label: "MSSP" } as const;
const PLATFORM_ADMIN_GROUP = { key: "platform-admin", label: "Platform Admin" } as const;
type GroupKey = (typeof BASE_GROUPS)[number]["key"] | "mssp" | "platform-admin";

export default function DashboardSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { session } = useAuth();
  const { branding } = useBranding();
  const isMsspTier = MSSP_TIERS.has(session?.tier ?? "");
  const isSaasTier = (session?.tier ?? "") === "saas" || (session?.tier ?? "") === "owner";
  const isEnterprisePlus = tierMeets(session?.tier ?? "community", "enterprise");
  const isSalucaUser = session?.user_email?.endsWith("@saluca.com") ?? false;
  const isInvestigationActive = pathname === "/dashboard/investigation";
  const isSupportActive = pathname === "/dashboard/support" || pathname === "/dashboard/support/chat";
  const isChatActive = pathname === "/dashboard/support/chat";

  // Build group list conditionally. Pantheon group always shows (no oscar-suite
  // tier filter — dropped per W-G.shell). Aletheia is now part of BASE_GROUPS and
  // always shows. MSSP and Platform Admin retain their operator-persona gates.
  const groups: Array<{ key: GroupKey; label: string }> = (() => {
    const base: Array<{ key: GroupKey; label: string }> = [...BASE_GROUPS];
    if (isMsspTier) {
      const msspGroupLabel = session?.tier === "saas" ? "SaaS"
        : session?.tier === "owner" ? "Platform"
        : "MSSP";
      base.push({ ...MSSP_GROUP, label: msspGroupLabel });
    }
    if (isSalucaUser) {
      base.push(PLATFORM_ADMIN_GROUP);
    }
    return base;
  })();

  // Section collapse state -- persisted to localStorage
  const [sectionCollapsed, setSectionCollapsed] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const stored = localStorage.getItem("tiresias_sidebar_sections");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const toggleSection = (key: string) => {
    setSectionCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem("tiresias_sidebar_sections", JSON.stringify(next));
      } catch { /* noop */ }
      return next;
    });
  };

  // Auto-collapse at lg breakpoint (1024px)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setCollapsed(true);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <aside
      className={`
        sticky top-0 h-full flex flex-col
        bg-surface-2 shrink-0
        transition-all duration-300 ease-out
        shadow-[4px_0_20px_-4px_rgba(0,0,0,0.4)]
        ${collapsed ? "w-16" : "w-64"}
      `}
    >
      {/* Logo area (WL-04) */}
      <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-2 min-h-[52px]">
        {branding.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.logo_url}
            alt={branding.company_name ?? "Tenant Logo"}
            className="h-8 w-auto object-contain max-w-[140px]"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex items-center gap-2">
            <svg
              className="h-7 w-7 shrink-0 text-accent"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <ellipse cx="16" cy="22" rx="10" ry="5" stroke="currentColor" strokeWidth="2" fill="none" />
              <rect x="6" y="13" width="20" height="5" rx="1" fill="currentColor" />
            </svg>
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -4 }}
                  transition={{ duration: 0.15 }}
                  className="text-sm font-black text-text-primary tracking-widest uppercase"
                >
                  TIRESIAS
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-4 px-2 overflow-y-auto scrollbar-thin">
        {groups.map((group, groupIdx) => {
          const items = NAV_ITEMS.filter((item) => item.group === group.key && (!item.saasOnly || isSaasTier));
          const isSectionCollapsed = !!sectionCollapsed[group.key];
          return (
            <div key={group.key}>
              {groupIdx > 0 && (
                <div className="mx-3 my-2 border-t border-border-subtle" />
              )}
              <AnimatePresence>
                {!collapsed && (
                  <motion.button
                    type="button"
                    onClick={() => toggleSection(group.key)}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2 }}
                    className={`w-full flex items-center justify-between px-3 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest cursor-pointer select-none hover:opacity-80 transition-opacity ${
                      group.key === "platform-admin"
                        ? "text-amber-400"
                        : group.key === "mssp"
                        ? "text-accent"
                        : group.key === "aletheia"
                        ? "text-accent"
                        : "text-text-tertiary"
                    }`}
                  >
                    {group.label}
                    <ChevronDown
                      className={`w-3 h-3 transition-transform duration-200 ${isSectionCollapsed ? "-rotate-90" : ""}`}
                    />
                  </motion.button>
                )}
              </AnimatePresence>

              <AnimatePresence initial={false}>
                {!isSectionCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-0.5">
                      {items.map((item) => {
                        const isActive = pathname === item.href;

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`
                              group/nav flex items-center gap-3 px-3 py-2.5 rounded-lg
                              transition-all duration-200 ease-out relative overflow-hidden
                              ${isActive
                                ? "text-text-primary"
                                : "text-text-secondary hover:text-text-primary"
                              }
                            `}
                            title={collapsed ? item.label : undefined}
                          >
                            {!isActive && (
                              <div className="absolute inset-0 bg-surface-3 translate-x-[-100%] group-hover/nav:translate-x-0 transition-transform duration-300 ease-out rounded-lg" />
                            )}

                            {isActive && (
                              <motion.div
                                layoutId="sidebar-active-bg"
                                className="absolute inset-0 bg-surface-3 rounded-lg"
                                transition={{ type: "spring", stiffness: 350, damping: 30 }}
                              />
                            )}

                            {isActive && (
                              <motion.div
                                layoutId="sidebar-active-indicator"
                                className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-accent shadow-[0_0_8px_var(--accent-base)]"
                                transition={{ type: "spring", stiffness: 350, damping: 30 }}
                              />
                            )}

                            <motion.div
                              className={`relative shrink-0 ${isActive ? "text-accent" : "group-hover/nav:text-accent"}`}
                              animate={isActive ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                              transition={{ duration: 0.3, ease: "easeOut" }}
                            >
                              {item.icon}
                            </motion.div>

                            <AnimatePresence>
                              {!collapsed && (
                                <motion.span
                                  initial={{ opacity: 0, x: -4 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, x: -4 }}
                                  transition={{ duration: 0.15 }}
                                  className="relative text-sm font-medium truncate"
                                >
                                  {item.label}
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </Link>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </nav>


      {/* Investigation + Support links -- pinned above user info */}
      <div className="px-2 pb-1 border-t border-border-subtle pt-2">
        {isEnterprisePlus && (
          <Link
            href="/dashboard/investigation"
            className={`
              group/nav flex items-center gap-3 px-3 py-2.5 rounded-lg
              transition-all duration-200 ease-out relative overflow-hidden
              ${isInvestigationActive
                ? "text-text-primary"
                : "text-text-secondary hover:text-text-primary"
              }
            `}
            title={collapsed ? "Investigation" : undefined}
          >
            {!isInvestigationActive && (
              <div className="absolute inset-0 bg-surface-3 translate-x-[-100%] group-hover/nav:translate-x-0 transition-transform duration-300 ease-out rounded-lg" />
            )}

            {isInvestigationActive && (
              <motion.div
                layoutId="sidebar-active-bg"
                className="absolute inset-0 bg-surface-3 rounded-lg"
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            )}

            {isInvestigationActive && (
              <motion.div
                layoutId="sidebar-active-indicator"
                className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-accent shadow-[0_0_8px_var(--accent-base)]"
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            )}

            <motion.div
              className={`relative shrink-0 ${isInvestigationActive ? "text-accent" : "group-hover/nav:text-accent"}`}
              animate={isInvestigationActive ? { scale: [1, 1.15, 1] } : { scale: 1 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <Search className="w-5 h-5" />
            </motion.div>

            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -4 }}
                  transition={{ duration: 0.15 }}
                  className="relative text-sm font-medium truncate"
                >
                  Investigation
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
        )}

        <Link
          href="/dashboard/support"
          className={`
            group/nav flex items-center gap-3 px-3 py-2.5 rounded-lg
            transition-all duration-200 ease-out relative overflow-hidden
            ${isSupportActive
              ? "text-text-primary"
              : "text-text-secondary hover:text-text-primary"
            }
          `}
          title={collapsed ? "Support" : undefined}
        >
          {!isSupportActive && (
            <div className="absolute inset-0 bg-surface-3 translate-x-[-100%] group-hover/nav:translate-x-0 transition-transform duration-300 ease-out rounded-lg" />
          )}

          {isSupportActive && (
            <motion.div
              layoutId="sidebar-active-bg"
              className="absolute inset-0 bg-surface-3 rounded-lg"
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
            />
          )}

          {isSupportActive && (
            <motion.div
              layoutId="sidebar-active-indicator"
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-accent shadow-[0_0_8px_var(--accent-base)]"
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
            />
          )}

          <motion.div
            className={`relative shrink-0 ${isSupportActive ? "text-accent" : "group-hover/nav:text-accent"}`}
            animate={isSupportActive ? { scale: [1, 1.15, 1] } : { scale: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <LifeBuoy className="w-5 h-5" />
          </motion.div>

          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.15 }}
                className="relative text-sm font-medium truncate"
              >
                Support
              </motion.span>
            )}
          </AnimatePresence>
        </Link>

        <Link
          href="/dashboard/support/chat"
          className={`
            group/nav flex items-center gap-3 px-3 py-2.5 rounded-lg
            transition-all duration-200 ease-out relative overflow-hidden
            ${isChatActive
              ? "text-text-primary"
              : "text-text-secondary hover:text-text-primary"
            }
          `}
          title={collapsed ? "Chat" : undefined}
        >
          {!isChatActive && (
            <div className="absolute inset-0 bg-surface-3 translate-x-[-100%] group-hover/nav:translate-x-0 transition-transform duration-300 ease-out rounded-lg" />
          )}

          {isChatActive && (
            <motion.div
              layoutId="sidebar-active-bg"
              className="absolute inset-0 bg-surface-3 rounded-lg"
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
            />
          )}

          {isChatActive && (
            <motion.div
              layoutId="sidebar-active-indicator"
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-accent shadow-[0_0_8px_var(--accent-base)]"
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
            />
          )}

          <motion.div
            className={`relative shrink-0 ${isChatActive ? "text-accent" : "group-hover/nav:text-accent"}`}
            animate={isChatActive ? { scale: [1, 1.15, 1] } : { scale: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <MessageCircle className="w-5 h-5" />
          </motion.div>

          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.15 }}
                className="relative text-sm font-medium truncate"
              >
                Chat
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
      </div>

      {/* User / Tenant info */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-3 py-3 border-t border-border-subtle"
          >
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent/20 to-accent/15 border border-accent/20 flex items-center justify-center text-xs font-bold text-accent shrink-0">
                {session?.tenant_name?.slice(0, 2).toUpperCase() ?? "AC"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary truncate">
                  {session?.tenant_name ?? "Tenant"}
                </p>
                {session?.user_name && (
                  <p className="text-xs text-text-secondary truncate mt-0.5">
                    {session.user_name}
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="px-1.5 py-0.5 rounded bg-accent/10 text-[9px] font-semibold text-accent tracking-wide uppercase border border-accent/15">
                    {session?.tier ?? "community"}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed user avatar */}
      {collapsed && (
        <div className="px-3 py-3 border-t border-border-subtle flex justify-center">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent/20 to-accent/15 border border-accent/20 flex items-center justify-center text-xs font-bold text-accent">
            {session?.tenant_name?.slice(0, 2).toUpperCase() ?? "AC"}
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <div className="p-3 border-t border-border-subtle">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-all duration-200"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <motion.svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            animate={{ rotate: collapsed ? 180 : 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
          </motion.svg>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs"
              >
                Collapse
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </aside>
  );
}

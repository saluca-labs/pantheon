'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Shield,
  ScrollText,
  DollarSign,
  Activity,
  Bell,
  Key,
  Settings,
  ChevronDown,
  ChevronRight,
  Cpu,
  SlidersHorizontal,
  ClipboardList,
  MessagesSquare,
  type LucideIcon,
} from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { AGENTIC_OS_MODULES } from '@/lib/agentic-os/registry';

interface BaseItem {
  label: string;
  href: string;
  icon: LucideIcon;
  enabled: boolean;
  /** Optional badge text (e.g. "New", "Preview") */
  badge?: string;
}

export const navItems: readonly BaseItem[] = [
  { label: 'Policy', href: '/dashboard', icon: Shield, enabled: true },
  { label: 'Sessions', href: '/dashboard/sessions', icon: ScrollText, enabled: false },
  { label: 'Cost', href: '/dashboard/cost', icon: DollarSign, enabled: false },
  { label: 'Providers', href: '/dashboard/providers', icon: Activity, enabled: true },
  { label: 'Alerts', href: '/dashboard/alerts', icon: Bell, enabled: false },
  { label: 'API Keys', href: '/dashboard/keys', icon: Key, enabled: false },
  // V-08 — Matrix Console (Element Web embed). Always shown but the
  // page itself enforces RBAC via RoleGate; non-admins see the
  // "restricted" card on click.
  {
    label: 'Matrix Console',
    href: '/dashboard/matrix-console',
    icon: MessagesSquare,
    enabled: true,
    badge: 'Preview',
  },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings, enabled: false },
] as const;

/**
 * Build the Agentic OS nav items from the shared module registry,
 * filtered to the provided enabled slugs (resolved server-side from the
 * per-user feature flag store). Always appends "Audit log" and
 * "OS Settings" entries at the end of the group so users can reach the
 * cross-OS surfaces even when most modules are disabled.
 */
export function agenticOsNavItems(enabledSlugs?: string[]): BaseItem[] {
  const items: BaseItem[] = AGENTIC_OS_MODULES
    .filter((m) => !enabledSlugs || enabledSlugs.includes(m.slug))
    .map((m) => ({
      label: m.label,
      href: `/dashboard/os/${m.slug}`,
      icon: m.icon,
      enabled: true,
      badge: m.status === 'live' ? undefined : m.status === 'preview' ? 'Preview' : 'Soon',
    }));

  // Cross-OS Audit log (Workstream D) and OS Settings (Workstream E) live
  // at the bottom of the Agentic OS group, always visible regardless of
  // per-user flag state.
  items.push({
    label: 'Audit log',
    href: '/dashboard/os/audit',
    icon: ClipboardList,
    enabled: true,
  });
  items.push({
    label: 'OS Settings',
    href: '/dashboard/os/settings',
    icon: SlidersHorizontal,
    enabled: true,
  });

  return items;
}

interface NavLinkProps {
  item: BaseItem;
  isActive: boolean;
  onClick?: () => void;
}

function NavLink({ item, isActive, onClick }: NavLinkProps) {
  const Icon = item.icon;
  return (
    <Link
      href={item.enabled ? item.href : '#'}
      onClick={() => item.enabled && onClick?.()}
      aria-disabled={!item.enabled}
      aria-current={isActive ? 'page' : undefined}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
        isActive
          ? 'bg-accent/10 text-accent font-medium'
          : item.enabled
          ? 'text-text-secondary hover:text-white hover:bg-border-subtle'
          : 'text-text-secondary/40 cursor-not-allowed'
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge && (
        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-border-subtle text-text-secondary border border-border-subtle">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

interface NavGroupProps {
  title: string;
  icon: LucideIcon;
  items: BaseItem[];
  pathname: string;
  /** Set true to start collapsed open. */
  defaultOpen?: boolean;
  onItemClick?: () => void;
}

export function NavGroup({ title, icon: Icon, items, pathname, defaultOpen = true, onItemClick }: NavGroupProps) {
  const containsActive = items.some((i) => pathname === i.href || pathname.startsWith(i.href + '/'));
  const [open, setOpen] = useState<boolean>(defaultOpen || containsActive);

  return (
    <div className="pt-3 first:pt-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] uppercase tracking-wider text-text-secondary/70 hover:text-white"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Icon className="w-3.5 h-3.5" />
        <span className="flex-1 text-left">{title}</span>
      </button>
      {open && (
        <div className="space-y-1 mt-1">
          {items.map((item) => (
            <NavLink
              key={item.label}
              item={item}
              isActive={pathname === item.href || pathname.startsWith(item.href + '/')}
              onClick={onItemClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface SidebarProps {
  /** Slugs resolved server-side from the per-user feature flag store. */
  enabledSlugs?: string[];
}

export function Sidebar({ enabledSlugs }: SidebarProps = {}) {
  const pathname = usePathname();
  const agenticItems = agenticOsNavItems(enabledSlugs);

  return (
    <aside className="hidden md:flex w-60 flex-col bg-surface-2 border-r border-border-subtle h-screen sticky top-0">
      <div className="p-4 border-b border-border-subtle">
        <Logo />
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {/* Tiresias core (flat, top-level) */}
        {navItems.map((item) => (
          <NavLink
            key={item.label}
            item={item}
            isActive={pathname === item.href}
          />
        ))}

        {/* Agentic OS — collapsible group */}
        <NavGroup
          title="Agentic OS"
          icon={Cpu}
          items={agenticItems}
          pathname={pathname}
          defaultOpen={pathname.startsWith('/dashboard/os')}
        />
      </nav>

      <div className="p-4 border-t border-border-subtle text-xs text-text-secondary">
        Governance-First AI-Security&trade;
      </div>
    </aside>
  );
}

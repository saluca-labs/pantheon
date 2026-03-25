'use client';

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
} from 'lucide-react';
import { Logo } from '@/components/brand/logo';

export const navItems = [
  { label: 'Policy', href: '/dashboard', icon: Shield, enabled: true },
  { label: 'Sessions', href: '/dashboard/sessions', icon: ScrollText, enabled: false },
  { label: 'Cost', href: '/dashboard/cost', icon: DollarSign, enabled: false },
  { label: 'Providers', href: '/dashboard/providers', icon: Activity, enabled: false },
  { label: 'Alerts', href: '/dashboard/alerts', icon: Bell, enabled: false },
  { label: 'API Keys', href: '/dashboard/keys', icon: Key, enabled: false },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings, enabled: false },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-60 flex-col bg-[#1a1d27] border-r border-[#2a2d3e] h-screen sticky top-0">
      <div className="p-4 border-b border-[#2a2d3e]">
        <Logo />
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.label}
              href={item.enabled ? item.href : '#'}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-[#4361EE]/10 text-[#4361EE] font-medium'
                  : item.enabled
                  ? 'text-[#94a3b8] hover:text-white hover:bg-[#2a2d3e]'
                  : 'text-[#94a3b8]/40 cursor-not-allowed'
              }`}
              aria-disabled={!item.enabled}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[#2a2d3e] text-xs text-[#94a3b8]">
        Governance-First AI-Security&trade;
      </div>
    </aside>
  );
}

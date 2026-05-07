'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { navItems } from './sidebar';
import { Logo } from '@/components/brand/logo';

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(true)}
        className="p-2 text-[#94a3b8] hover:text-white"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60" onClick={() => setOpen(false)}>
          <div
            className="w-64 h-full bg-[#1a1d27] border-r border-[#2a2d3e] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <Logo />
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-[#94a3b8] hover:text-white"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="space-y-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;

                return (
                  <Link
                    key={item.label}
                    href={item.enabled ? item.href : '#'}
                    onClick={() => item.enabled && setOpen(false)}
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
          </div>
        </div>
      )}
    </div>
  );
}

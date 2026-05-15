'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, Cpu } from 'lucide-react';
import { navItems, NavGroup, agenticOsNavItems } from './sidebar';
import { Logo } from '@/components/brand/logo';

interface MobileNavProps {
  /** Slugs resolved server-side from the per-user feature flag store. */
  enabledSlugs?: string[];
}

/**
 * Mobile-only nav drawer.
 *
 * W-E.4 a11y rewire:
 *  - The open drawer is a `role="dialog" aria-modal="true"` surface labelled
 *    by the in-drawer brand logo (via `aria-labelledby`).
 *  - On open, focus moves to the close button. On close, focus is restored
 *    to the menu-trigger button that opened the drawer.
 *  - `Escape` closes the drawer.
 *  - While open, `inert` is set on `[data-app-root]` so background content is
 *    completely removed from the a11y tree and focus order. Removed on close.
 *  - Backdrop click closes (existing behavior, preserved via the dialog's
 *    backdrop overlay rendered as a button so keyboard users can also close
 *    via Enter / Space — fixes the `jsx-a11y/click-events-have-key-events`
 *    surface flagged by the recommended preset at error level).
 */
export function MobileNav({ enabledSlugs }: MobileNavProps = {}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const agenticItems = agenticOsNavItems(enabledSlugs);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const handleClose = useCallback(() => setOpen(false), []);

  // Move focus to the close button on open; restore focus to the trigger on
  // close. Also drives the `inert` toggle on the app-root so background
  // content is removed from the a11y tree while the dialog is up.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = (document.activeElement as HTMLElement | null) ?? null;
    closeRef.current?.focus();
    const root = document.querySelector<HTMLElement>('[data-app-root]');
    // The dialog itself is portalled inside body, but body's `inert` would
    // also hide the dialog. We therefore mark only the OTHER children of body
    // as inert — in practice the only other child is the SPA shell rendered
    // inside `[data-app-root]`. If the anchor's missing (e.g. an older page
    // shell), we degrade silently — Escape + focus-trap still work.
    if (root) root.setAttribute('inert', '');
    return () => {
      if (root) root.removeAttribute('inert');
      // Restore focus to the trigger only if focus stayed inside the drawer
      // (otherwise we'd hijack a focus the user moved elsewhere).
      const active = document.activeElement as HTMLElement | null;
      if (
        active === document.body ||
        active === null ||
        (active && active.closest('[role="dialog"]'))
      ) {
        (previouslyFocused ?? triggerRef.current)?.focus();
      }
    };
  }, [open]);

  // Escape closes (per dialog APG).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, handleClose]);

  return (
    <div className="md:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="p-2 text-text-secondary hover:text-white"
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Menu className="w-5 h-5" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-50"
        >
          {/* Backdrop — rendered as a button so keyboard users can dismiss
              via Enter / Space, satisfying jsx-a11y at error level without
              an inline disable. The visible affordance is a click anywhere. */}
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={handleClose}
            className="absolute inset-0 h-full w-full cursor-default bg-black/60"
          />
          <div className="relative w-72 h-full bg-surface-2 border-r border-border-subtle p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <span id={titleId}>
                <Logo />
              </span>
              <button
                ref={closeRef}
                type="button"
                onClick={handleClose}
                className="p-1 text-text-secondary hover:text-white"
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
                        ? 'bg-accent/10 text-accent font-medium'
                        : item.enabled
                        ? 'text-text-secondary hover:text-white hover:bg-border-subtle'
                        : 'text-text-secondary/40 cursor-not-allowed'
                    }`}
                    aria-disabled={!item.enabled}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}

              <NavGroup
                title="Agentic OS"
                icon={Cpu}
                items={agenticItems}
                pathname={pathname}
                defaultOpen={pathname.startsWith('/dashboard/os')}
                onItemClick={() => setOpen(false)}
              />
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}

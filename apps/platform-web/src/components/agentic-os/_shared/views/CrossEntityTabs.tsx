'use client';

/**
 * CrossEntityTabs — related-entity tab strip for entity-detail pages
 * (Wave B.2 data-view primitive).
 *
 * Entity detail pages need to surface linked entities without leaving the
 * page — a deal showing its quotes, invoices, time entries, interactions.
 * Today this is bespoke per OS (`person-detail-shell.tsx`, `deal-detail-
 * shell.tsx`, `case-detail-workspace.tsx`). This is the shared replacement.
 *
 * Contract / responsibilities:
 *  - Renders a horizontal tab strip; each tab carries an optional count badge.
 *  - Content is LAZY: a tab's `content` render-prop is only invoked once that
 *    tab has been activated. Once mounted, it stays mounted (cheap re-show);
 *    panels for never-opened tabs are never rendered.
 *  - Uncontrolled by default (owns `activeKey`, seeded by `defaultTab`); pass
 *    `activeKey` + `onTabChange` to drive it controlled.
 *  - Accent-aware: a `slug` prop tints the active tab underline + label with
 *    the per-OS accent token; without it the system accent is used.
 *  - Keyboard: ArrowLeft / ArrowRight move between tabs (roving focus),
 *    Home / End jump to the ends.
 *
 * Wave C adopts this on every entity detail page; this wave ships + tests it.
 */

import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface CrossEntityTab {
  /** Stable key — used for selection, React keys, and test ids. */
  key: string;
  /** Tab label. */
  label: string;
  /** Optional count badge (linked-entity count). 0 still renders the badge. */
  count?: number;
  /** Lazy content render-prop — only called once the tab is first opened. */
  content: () => React.ReactNode;
  /** Disable the tab (still visible, not selectable). */
  disabled?: boolean;
}

export interface CrossEntityTabsProps {
  /** The tabs to render. */
  tabs: CrossEntityTab[];
  /** Initial active tab key (uncontrolled mode). Defaults to the first tab. */
  defaultTab?: string;
  /** Active tab key (controlled mode). Pair with `onTabChange`. */
  activeKey?: string;
  /** Fires when the active tab changes. Required for controlled mode. */
  onTabChange?: (key: string) => void;
  /** Per-OS accent slug (matches registry.ts) for the active-tab tint. */
  slug?: string;
  /** className passthrough on the wrapper. */
  className?: string;
}

export function CrossEntityTabs({
  tabs,
  defaultTab,
  activeKey,
  onTabChange,
  slug,
  className,
}: CrossEntityTabsProps) {
  const baseId = useId();
  const firstKey = tabs[0]?.key;
  const isControlled = activeKey !== undefined;

  const [internalKey, setInternalKey] = useState<string>(
    defaultTab && tabs.some((t) => t.key === defaultTab)
      ? defaultTab
      : (firstKey ?? ''),
  );
  const currentKey = isControlled ? activeKey! : internalKey;

  // Track which tabs have ever been opened so content stays lazy-then-sticky.
  const [mounted, setMounted] = useState<Set<string>>(
    () => new Set(currentKey ? [currentKey] : []),
  );

  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const selectTab = useCallback(
    (key: string) => {
      const tab = tabs.find((t) => t.key === key);
      if (!tab || tab.disabled) return;
      setMounted((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      if (!isControlled) setInternalKey(key);
      onTabChange?.(key);
    },
    [tabs, isControlled, onTabChange],
  );

  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const enabled = tabs
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => !t.disabled);
    if (enabled.length === 0) return;
    let targetIdx: number | null = null;
    if (e.key === 'ArrowRight') {
      const pos = enabled.findIndex(({ i }) => i === idx);
      targetIdx = enabled[(pos + 1) % enabled.length].i;
    } else if (e.key === 'ArrowLeft') {
      const pos = enabled.findIndex(({ i }) => i === idx);
      targetIdx = enabled[(pos - 1 + enabled.length) % enabled.length].i;
    } else if (e.key === 'Home') {
      targetIdx = enabled[0].i;
    } else if (e.key === 'End') {
      targetIdx = enabled[enabled.length - 1].i;
    }
    if (targetIdx !== null) {
      e.preventDefault();
      const targetKey = tabs[targetIdx].key;
      selectTab(targetKey);
      tabRefs.current[targetKey]?.focus();
    }
  };

  const accentText = slug ? `text-os-${slug}` : 'text-accent';
  const accentBorder = slug ? `border-os-${slug}` : 'border-accent';

  // Render-prop results for the currently-mounted tabs.
  const panels = useMemo(
    () => tabs.filter((t) => mounted.has(t.key)),
    [tabs, mounted],
  );

  if (tabs.length === 0) {
    return (
      <div
        className={cn('text-sm text-text-secondary', className)}
        data-testid="cross-entity-tabs-empty"
      >
        Nothing linked yet.
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', className)}>
      <div
        role="tablist"
        aria-label="Related entities"
        className="flex items-center gap-1 border-b border-border-subtle"
      >
        {tabs.map((tab, idx) => {
          const isActive = tab.key === currentKey;
          return (
            <button
              key={tab.key}
              ref={(el) => {
                tabRefs.current[tab.key] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.key}`}
              aria-selected={isActive}
              aria-controls={`${baseId}-panel-${tab.key}`}
              aria-disabled={tab.disabled}
              tabIndex={isActive ? 0 : -1}
              disabled={tab.disabled}
              data-testid={`cross-entity-tab-${tab.key}`}
              onClick={() => selectTab(tab.key)}
              onKeyDown={(e) => onKey(e, idx)}
              className={cn(
                '-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition',
                'disabled:cursor-not-allowed disabled:opacity-40',
                isActive
                  ? cn(accentBorder, accentText, 'font-medium')
                  : 'border-transparent text-text-secondary hover:text-text-primary',
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  data-testid={`cross-entity-tab-count-${tab.key}`}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-2xs tabular-nums',
                    isActive
                      ? slug
                        ? `bg-os-${slug}/15 ${accentText}`
                        : 'bg-accent-soft/40 text-text-primary'
                      : 'bg-surface-3 text-text-tertiary',
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="pt-4">
        {panels.map((tab) => {
          const isActive = tab.key === currentKey;
          return (
            <div
              key={tab.key}
              role="tabpanel"
              id={`${baseId}-panel-${tab.key}`}
              aria-labelledby={`${baseId}-tab-${tab.key}`}
              hidden={!isActive}
              data-testid={`cross-entity-panel-${tab.key}`}
            >
              {tab.content()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CrossEntityTabs;

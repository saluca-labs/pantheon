/**
 * DashboardWidget — a titled container card for hub dashboards.
 *
 * The "what's happening" tile that converts an OS hub from a directory
 * (feature-card grid) into a dashboard. Bigger than `StatCard`, smaller
 * than a feature card. Slot-based: title + optional action + children
 * body + optional footer. Emphasis variants give a hub a visual rhythm
 * (default / raised / accent / status-tinted).
 *
 * Wave B.1 primitive. Standalone — wired into OS hubs in Wave C.
 *
 * Spec sources:
 *  - PANTHEON_UI_DEPTH_WAVE_PLAN.md §1 (hub-as-dashboard) + §2.1
 *  - _design/visual-language.md (surface ladder, per-OS accents)
 *  - _design/tokens.md §1, §4, §5
 */

import { useId, type ReactNode } from 'react';
import { clsx } from 'clsx';
import type { OsSlug } from '@/lib/agentic-os/registry';

/** Emphasis level — controls surface elevation + border treatment. */
export type DashboardWidgetVariant =
  | 'default'
  | 'raised'
  | 'accent'
  | 'positive'
  | 'warning'
  | 'attention'
  | 'danger';

/**
 * Per-OS slug — when set, the title rail picks up the OS accent tint.
 * Aliases the canonical `OsSlug` from `lib/agentic-os/registry.ts` so the
 * primitive shares one source of truth with the rest of Wave B.
 */
export type DashboardWidgetOsSlug = OsSlug;

export interface DashboardWidgetProps {
  /** Widget title — rendered in the header rail. */
  title: ReactNode;
  /**
   * Optional leading icon (Lucide element). Rendered in a small tinted
   * tile. Picks up the OS accent when `osSlug` is supplied.
   */
  icon?: ReactNode;
  /**
   * Optional action node in the header — typically a link, menu, or
   * small button. Right-aligned opposite the title.
   */
  action?: ReactNode;
  /** The widget body. */
  children: ReactNode;
  /** Optional footer — meta line, "view all" link, timestamp. */
  footer?: ReactNode;
  /** Emphasis variant. Default `default`. */
  variant?: DashboardWidgetVariant;
  /**
   * When set, the icon tile uses the per-OS accent token instead of the
   * system accent. Identifies which OS owns the widget on cross-OS hubs.
   */
  osSlug?: DashboardWidgetOsSlug;
  /**
   * When provided, the whole widget becomes a link (e.g. drilling into
   * the underlying list). Gets a hover-ring affordance.
   */
  href?: string;
  /** Extra classes on the root element. */
  className?: string;
  /** Optional test id override. */
  'data-testid'?: string;
}

/** variant → root surface + border classes. */
const VARIANT_ROOT: Record<DashboardWidgetVariant, string> = {
  default: 'bg-surface-2 border-border-subtle',
  raised: 'bg-surface-3 border-border-strong',
  accent: 'bg-surface-2 border-accent/40',
  positive: 'bg-positive/5 border-positive/30',
  warning: 'bg-warning/5 border-warning/30',
  attention: 'bg-attention/5 border-attention/30',
  danger: 'bg-danger/5 border-danger/30',
};

/** osSlug → icon-tile tint classes. */
const OS_ICON_TINT: Record<DashboardWidgetOsSlug, string> = {
  health: 'bg-os-health/15 text-os-health',
  maker: 'bg-os-maker/15 text-os-maker',
  research: 'bg-os-research/15 text-os-research',
  'secure-dev': 'bg-os-secure-dev/15 text-os-secure-dev',
  filmmaker: 'bg-os-filmmaker/15 text-os-filmmaker',
  cyber: 'bg-os-cyber/15 text-os-cyber',
  autobiographer: 'bg-os-autobiographer/15 text-os-autobiographer',
  business: 'bg-os-business/15 text-os-business',
  creator: 'bg-os-creator/15 text-os-creator',
};

export function DashboardWidget({
  title,
  icon,
  action,
  children,
  footer,
  variant = 'default',
  osSlug,
  href,
  className,
  'data-testid': testId = 'dashboard-widget',
}: DashboardWidgetProps) {
  const iconTint = osSlug ? OS_ICON_TINT[osSlug] : 'bg-accent/15 text-accent';
  // W-E.4: link the widget body to the title via `aria-labelledby` so screen
  // readers announce the title as the body's name. Generated per-render via
  // `useId` (stable across re-renders, unique per instance).
  const titleId = useId();

  const root = clsx(
    'flex flex-col rounded-xl border p-5',
    VARIANT_ROOT[variant],
    href && 'transition-slow hover:border-accent/50 hover:bg-surface-3',
    className,
  );

  const inner = (
    <>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon ? (
            <span
              className={clsx(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                iconTint,
              )}
              data-testid="dashboard-widget-icon"
              aria-hidden="true"
            >
              {icon}
            </span>
          ) : null}
          <h3
            id={titleId}
            className="truncate text-sm font-semibold text-text-primary"
          >
            {title}
          </h3>
        </div>
        {action ? (
          <div className="shrink-0" data-testid="dashboard-widget-action">
            {action}
          </div>
        ) : null}
      </div>

      <div
        className="min-w-0 flex-1"
        data-testid="dashboard-widget-body"
        aria-labelledby={titleId}
      >
        {children}
      </div>

      {footer ? (
        <div
          className="mt-4 border-t border-border-subtle pt-3 text-xs text-text-tertiary"
          data-testid="dashboard-widget-footer"
        >
          {footer}
        </div>
      ) : null}
    </>
  );

  if (href) {
    return (
      <a href={href} className={root} data-testid={testId}>
        {inner}
      </a>
    );
  }
  return (
    <div className={root} data-testid={testId}>
      {inner}
    </div>
  );
}

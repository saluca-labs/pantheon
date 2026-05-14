'use client';

/**
 * BulkActionsBar — contextual multi-select action bar (Wave B.2 data-view
 * primitive).
 *
 * Appears when one or more rows are selected on a list page: shows the
 * selection count, a row of action buttons, a slot for OS-specific actions,
 * and a clear-selection control. Sticky-positioned so it stays reachable as
 * the user scrolls a long list.
 *
 * Contract / responsibilities:
 *  - Renders NOTHING when `selectedIds` is empty — it is purely contextual.
 *  - `actions` is a declarative list; each action fires its `onClick` with the
 *    current `selectedIds`. `variant: 'danger'` styles destructive actions.
 *  - `extraActions` is a free-form ReactNode slot for OS-specific controls
 *    (e.g. a stage picker) that don't fit the simple button shape.
 *  - `onClear` clears the selection upstream — the bar owns no selection state.
 *  - Sticky by default (`sticky bottom-0`); pass `sticky={false}` to inline it.
 *
 * Pairs with an upgraded DataTable in Wave C; this wave ships + tests it solo.
 */

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BulkAction {
  /** Stable key — also used as the test id suffix. */
  id: string;
  /** Button label. Keep it a verb: "Archive", "Export", "Delete". */
  label: string;
  /** Optional leading icon (Lucide element). */
  icon?: React.ReactNode;
  /** Fires with the live selection when the action is invoked. */
  onClick: (selectedIds: string[]) => void;
  /** 'default' (neutral) or 'danger' (destructive — red treatment). */
  variant?: 'default' | 'danger';
  /** Disable this single action while still showing it. */
  disabled?: boolean;
}

export interface BulkActionsBarProps {
  /** The currently-selected row ids. Empty array → the bar renders nothing. */
  selectedIds: string[];
  /** Declarative action buttons. */
  actions: BulkAction[];
  /** Clears the selection upstream. */
  onClear: () => void;
  /** Free-form slot for OS-specific controls, rendered before the actions. */
  extraActions?: React.ReactNode;
  /** Sticky to the bottom of the scroll container. Default true. */
  sticky?: boolean;
  /**
   * Override the "{n} selected" count label. Receives the count so callers
   * can pluralize per entity ("3 deals selected").
   */
  countLabel?: (count: number) => string;
  /** className passthrough on the wrapper. */
  className?: string;
}

export function BulkActionsBar({
  selectedIds,
  actions,
  onClear,
  extraActions,
  sticky = true,
  countLabel,
  className,
}: BulkActionsBarProps) {
  const count = selectedIds.length;

  // Purely contextual — nothing selected, nothing rendered.
  if (count === 0) return null;

  const label = countLabel ? countLabel(count) : `${count} selected`;

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      data-testid="bulk-actions-bar"
      className={cn(
        'z-10 flex flex-wrap items-center gap-3 rounded-xl border border-border-strong bg-surface-2 px-4 py-2.5 shadow-lg',
        sticky && 'sticky bottom-4',
        className,
      )}
    >
      <span className="inline-flex items-center gap-2 text-sm text-text-primary">
        <span className="tabular-nums font-semibold">{count}</span>
        <span className="text-text-secondary">{label.replace(/^\d+\s*/, '')}</span>
      </span>

      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        data-testid="bulk-actions-clear"
        className="inline-flex items-center gap-1 rounded text-xs text-text-tertiary transition hover:text-text-secondary"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
        Clear
      </button>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {extraActions}

        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={action.disabled}
            onClick={() => action.onClick(selectedIds)}
            data-testid={`bulk-action-${action.id}`}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition',
              'disabled:cursor-not-allowed disabled:opacity-40',
              action.variant === 'danger'
                ? 'border-danger/30 bg-danger/10 text-danger hover:bg-danger/20'
                : 'border-border-subtle bg-surface-1 text-text-secondary hover:border-accent/50 hover:text-text-primary',
            )}
          >
            {action.icon && (
              <span className="shrink-0" aria-hidden="true">
                {action.icon}
              </span>
            )}
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default BulkActionsBar;

'use client';

/**
 * SavedViews — saved filter / sort preset surface (Wave B.2 data-view primitive).
 *
 * Think Linear's saved views: a horizontal pill row of named views plus a
 * "save current" affordance. Generic over the filter-state shape `TQuery` that
 * each view persists, so the same primitive serves every OS list page.
 *
 * Contract / responsibilities:
 *  - Pure props-in / callbacks-out. There is NO backend here — persistence is
 *    the caller's job via `onSaveView` / `onDeleteView`. Wave E schema-backs it;
 *    Wave C can mock with localStorage.
 *  - Renders one pill per `views` entry. The pill matching `activeViewId` reads
 *    as active (accent-aware when a `slug` is supplied).
 *  - "Save current" opens a tiny inline name field; submitting fires
 *    `onSaveView(name, currentQuery)`. The parent decides the id + persistence.
 *  - Optional per-view delete affordance (shown on hover / focus) fires
 *    `onDeleteView(id)`.
 *  - `isDirty` (caller-computed: does `currentQuery` differ from the active
 *    view's query?) controls whether the save affordance is offered.
 *
 * Generic param `TQuery` is the opaque filter-state shape; SavedViews never
 * inspects it, only carries it back through callbacks.
 */

import { useState } from 'react';
import { Bookmark, Plus, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OsSlug } from '@/lib/agentic-os/registry';

/** A persisted, named filter/sort preset. */
export interface SavedView<TQuery> {
  /** Stable identifier — caller-assigned, used as key + `activeViewId` match. */
  id: string;
  /** Human label rendered in the pill. */
  name: string;
  /** The opaque filter-state this view restores. */
  query: TQuery;
}

export interface SavedViewsProps<TQuery> {
  /** The saved views to render as pills. */
  views: SavedView<TQuery>[];
  /** Id of the currently-applied view, or null when none is applied. */
  activeViewId: string | null;
  /** The live filter-state — handed to `onSaveView` when the user saves. */
  currentQuery: TQuery;
  /**
   * Whether `currentQuery` differs from the active view's saved query. When
   * true, the "Save current" affordance is offered. Caller computes this.
   */
  isDirty?: boolean;
  /** Fires when a pill is clicked — caller applies that view's query. */
  onSelectView: (view: SavedView<TQuery>) => void;
  /** Fires when the user names + saves the current query as a new view. */
  onSaveView: (name: string, query: TQuery) => void;
  /** Optional: fires when a view's delete affordance is used. Omit to hide it. */
  onDeleteView?: (id: string) => void;
  /** Per-OS accent slug (matches registry.ts) for the active-pill tint. */
  slug?: OsSlug;
  /** Copy for the "all / no filter" reset pill. Omit to hide the reset pill. */
  allViewsLabel?: string;
  /** Fires when the reset pill is clicked. Required if `allViewsLabel` set. */
  onClearView?: () => void;
  /** className passthrough on the wrapper. */
  className?: string;
}

export function SavedViews<TQuery>({
  views,
  activeViewId,
  currentQuery,
  isDirty = false,
  onSelectView,
  onSaveView,
  onDeleteView,
  slug,
  allViewsLabel,
  onClearView,
  className,
}: SavedViewsProps<TQuery>) {
  const [saving, setSaving] = useState(false);
  const [draftName, setDraftName] = useState('');

  const activeTint = slug
    ? `bg-os-${slug}/15 text-os-${slug} border-os-${slug}/30`
    : 'bg-accent-soft/40 text-text-primary border-accent/40';

  const submitSave = () => {
    const name = draftName.trim();
    if (!name) return;
    onSaveView(name, currentQuery);
    setDraftName('');
    setSaving(false);
  };

  return (
    <div
      className={cn('flex flex-wrap items-center gap-2', className)}
      role="group"
      aria-label="Saved views"
    >
      <Bookmark
        className="h-3.5 w-3.5 shrink-0 text-text-tertiary"
        aria-hidden="true"
      />

      {allViewsLabel && (
        <button
          type="button"
          onClick={onClearView}
          aria-pressed={activeViewId === null}
          className={cn(
            'rounded border px-2.5 py-1 text-xs transition',
            activeViewId === null
              ? activeTint
              : 'border-border-subtle bg-surface-1 text-text-secondary hover:bg-surface-3 hover:text-text-primary',
          )}
        >
          {allViewsLabel}
        </button>
      )}

      {views.map((view) => {
        const isActive = view.id === activeViewId;
        return (
          <span
            key={view.id}
            data-testid={`saved-view-${view.id}`}
            className={cn(
              'group/pill inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs transition',
              isActive
                ? activeTint
                : 'border-border-subtle bg-surface-1 text-text-secondary hover:bg-surface-3 hover:text-text-primary',
            )}
          >
            <button
              type="button"
              onClick={() => onSelectView(view)}
              aria-pressed={isActive}
              className="max-w-[12rem] truncate"
            >
              {view.name}
            </button>
            {onDeleteView && (
              <button
                type="button"
                onClick={() => onDeleteView(view.id)}
                aria-label={`Delete view ${view.name}`}
                className="rounded-full p-0.5 text-text-tertiary opacity-0 transition hover:text-danger group-hover/pill:opacity-100 focus:opacity-100"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </span>
        );
      })}

      {saving ? (
        <span className="inline-flex items-center gap-1 rounded border border-border-strong bg-surface-2 px-1.5 py-0.5">
          <input
            type="text"
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitSave();
              } else if (e.key === 'Escape') {
                setSaving(false);
                setDraftName('');
              }
            }}
            placeholder="View name"
            aria-label="New view name"
            className="w-28 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
          <button
            type="button"
            onClick={submitSave}
            disabled={!draftName.trim()}
            aria-label="Confirm save view"
            className="rounded p-0.5 text-positive transition hover:bg-surface-3 disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              setSaving(false);
              setDraftName('');
            }}
            aria-label="Cancel save view"
            className="rounded p-0.5 text-text-tertiary transition hover:bg-surface-3 hover:text-text-secondary"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </span>
      ) : (
        isDirty && (
          <button
            type="button"
            onClick={() => setSaving(true)}
            data-testid="saved-views-save-current"
            className="inline-flex items-center gap-1 rounded border border-dashed border-border-strong px-2.5 py-1 text-xs text-text-secondary transition hover:border-accent hover:text-text-primary"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            Save current
          </button>
        )
      )}
    </div>
  );
}

export default SavedViews;

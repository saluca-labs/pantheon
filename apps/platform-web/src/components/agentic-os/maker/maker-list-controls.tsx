'use client';

/**
 * Maker OS — shared list-page controls (Wave C-3a, UI Depth Wave).
 *
 * Composes the Wave B data-view primitives into the one filter rail every
 * Maker list manager (projects / tools / references / blockers) shares:
 *
 *   - `EntitySearch`  — debounced in-hub search input (replaces the ad-hoc
 *                       `<input>` + `inputCls` pattern)
 *   - `SavedViews`    — named filter/sort presets, localStorage-backed per
 *                       `savedViewKey` (plan §2.8: mock with localStorage in
 *                       Wave C, schema-back in Wave E)
 *   - select / chip   — kept as native controls passed via `filterControls`
 *                       (EntitySearch has no declarative filter-chip API yet)
 *
 * Behavior-preserving: the parent still owns the actual filtering logic and
 * data. This is presentation only — query state in, query state out. The
 * `slug="maker"` is threaded into `SavedViews` so the active pill picks up
 * the per-OS amber accent.
 *
 * Mirrors `cyber/CyberListControls.tsx` from Wave C-2a.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  EntitySearch,
  SavedViews,
  type SavedView,
} from '@/components/agentic-os/_shared/views';

/** The opaque filter-state a Maker list page persists in a saved view. */
export type MakerQuery = Record<string, string>;

export interface MakerListControlsProps {
  /** Debounced search query — controlled by the parent. */
  search: string;
  onSearchChange: (q: string) => void;
  /** Placeholder copy for the search input. */
  searchPlaceholder: string;
  /**
   * The current non-search filter state (select / chip values etc.).
   * Persisted into saved views alongside the search string.
   */
  filters: MakerQuery;
  /** Apply a saved view's full query (search + filters) upstream. */
  onApplyQuery: (query: MakerQuery) => void;
  /**
   * localStorage key suffix for this entity-kind's saved views. The full key
   * is namespaced `maker:saved-views:<savedViewKey>`.
   */
  savedViewKey: string;
  /** The native filter controls, rendered after the search input. */
  filterControls?: ReactNode;
  /** Right-aligned action slot (e.g. the "New …" button). */
  actions?: ReactNode;
  /** Debounce window for the search input. Default 200ms. */
  debounceMs?: number;
}

/** Build the localStorage key for an entity-kind's saved views. */
function storageKey(savedViewKey: string): string {
  return `maker:saved-views:${savedViewKey}`;
}

/** Read saved views from localStorage; tolerant of missing / malformed data. */
function readSavedViews(savedViewKey: string): SavedView<MakerQuery>[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(savedViewKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is SavedView<MakerQuery> =>
        v && typeof v.id === 'string' && typeof v.name === 'string',
    );
  } catch {
    return [];
  }
}

/** Stable compare of two query objects (saved vs current). */
function sameQuery(a: MakerQuery, b: MakerQuery): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if ((a[k] ?? '') !== (b[k] ?? '')) return false;
  }
  return true;
}

export function MakerListControls({
  search,
  onSearchChange,
  searchPlaceholder,
  filters,
  onApplyQuery,
  savedViewKey,
  filterControls,
  actions,
  debounceMs = 200,
}: MakerListControlsProps) {
  const [views, setViews] = useState<SavedView<MakerQuery>[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  // Hydrate saved views from localStorage after mount (SSR-safe).
  useEffect(() => {
    setViews(readSavedViews(savedViewKey));
  }, [savedViewKey]);

  const currentQuery = useMemo<MakerQuery>(
    () => ({ ...filters, search }),
    [filters, search],
  );

  // The active view stays "active" only while the live query still matches it.
  const isDirty = useMemo(() => {
    if (activeViewId === null) {
      // No view applied — "dirty" (savable) once any filter/search is set.
      return Object.values(currentQuery).some((v) => v.trim().length > 0);
    }
    const active = views.find((v) => v.id === activeViewId);
    return active ? !sameQuery(active.query, currentQuery) : true;
  }, [activeViewId, views, currentQuery]);

  function persist(next: SavedView<MakerQuery>[]) {
    setViews(next);
    try {
      window.localStorage.setItem(storageKey(savedViewKey), JSON.stringify(next));
    } catch {
      /* localStorage unavailable (private mode / quota) — in-memory only. */
    }
  }

  function handleSaveView(name: string, query: MakerQuery) {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const view: SavedView<MakerQuery> = { id, name, query };
    persist([...views, view]);
    setActiveViewId(id);
  }

  function handleDeleteView(id: string) {
    persist(views.filter((v) => v.id !== id));
    if (activeViewId === id) setActiveViewId(null);
  }

  function handleSelectView(view: SavedView<MakerQuery>) {
    setActiveViewId(view.id);
    onApplyQuery(view.query);
  }

  function handleClearView() {
    setActiveViewId(null);
    onApplyQuery({});
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
            Search
          </span>
          <EntitySearch
            placeholder={searchPlaceholder}
            defaultValue={search}
            debounceMs={debounceMs}
            onQueryChange={onSearchChange}
          />
        </div>
        {filterControls}
        {actions ? <div className="ml-auto">{actions}</div> : null}
      </div>

      <SavedViews<MakerQuery>
        views={views}
        activeViewId={activeViewId}
        currentQuery={currentQuery}
        isDirty={isDirty}
        onSelectView={handleSelectView}
        onSaveView={handleSaveView}
        onDeleteView={handleDeleteView}
        onClearView={handleClearView}
        allViewsLabel="All"
        slug="maker"
      />
    </div>
  );
}

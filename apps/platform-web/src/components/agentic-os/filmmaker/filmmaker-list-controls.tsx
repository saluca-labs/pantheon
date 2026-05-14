'use client';

/**
 * Filmmaker OS — shared list-page controls (Wave C-5, UI Depth Wave).
 *
 * Composes the Wave B data-view primitives into the one filter rail the
 * Filmmaker list managers (projects / characters / shots / storyboards)
 * share — mirrors `cyber/CyberListControls.tsx`:
 *
 *   - `EntitySearch`  — debounced in-hub search input (replaces the ad-hoc
 *                       `<input>` + `inputCls` / `Search`-icon pattern)
 *   - `SavedViews`    — named filter/sort presets, localStorage-backed per
 *                       `savedViewKey` (plan §2.8: mock with localStorage in
 *                       Wave C, schema-back in Wave E)
 *   - select filters  — kept as native `<select>`s (EntitySearch has no
 *                       declarative filter-chip API yet — see PR notes)
 *
 * Behavior-preserving: the parent still owns the actual filtering / sorting
 * logic and data. This is presentation only — query state in, query state
 * out. `slug="filmmaker"` is threaded into `SavedViews` so the active pill
 * picks up the per-OS rose accent.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  EntitySearch,
  SavedViews,
  type SavedView,
} from '@/components/agentic-os/_shared/views';

/** The opaque filter-state a Filmmaker list page persists in a saved view. */
export type FilmmakerQuery = Record<string, string>;

export interface FilmmakerListControlsProps {
  /** Debounced search query — controlled by the parent. */
  search: string;
  onSearchChange: (q: string) => void;
  /** Placeholder copy for the search input. */
  searchPlaceholder: string;
  /**
   * The current non-search filter state (select values etc.). Persisted into
   * saved views alongside the search string.
   */
  filters: FilmmakerQuery;
  /** Apply a saved view's full query (search + filters) upstream. */
  onApplyQuery: (query: FilmmakerQuery) => void;
  /**
   * localStorage key suffix for this entity-kind's saved views. The full key
   * is namespaced `filmmaker:saved-views:<savedViewKey>`.
   */
  savedViewKey: string;
  /** The native `<select>` filter controls, rendered after the search input. */
  filterControls?: ReactNode;
  /** Right-aligned action slot (e.g. the "New …" button). */
  actions?: ReactNode;
}

/** Build the localStorage key for an entity-kind's saved views. */
function storageKey(savedViewKey: string): string {
  return `filmmaker:saved-views:${savedViewKey}`;
}

/** Read saved views from localStorage; tolerant of missing / malformed data. */
function readSavedViews(savedViewKey: string): SavedView<FilmmakerQuery>[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(savedViewKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is SavedView<FilmmakerQuery> =>
        v && typeof v.id === 'string' && typeof v.name === 'string',
    );
  } catch {
    return [];
  }
}

/** Stable compare of two query objects (saved vs current). */
function sameQuery(a: FilmmakerQuery, b: FilmmakerQuery): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if ((a[k] ?? '') !== (b[k] ?? '')) return false;
  }
  return true;
}

export function FilmmakerListControls({
  search,
  onSearchChange,
  searchPlaceholder,
  filters,
  onApplyQuery,
  savedViewKey,
  filterControls,
  actions,
}: FilmmakerListControlsProps) {
  const [views, setViews] = useState<SavedView<FilmmakerQuery>[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  // Hydrate saved views from localStorage after mount (SSR-safe).
  useEffect(() => {
    setViews(readSavedViews(savedViewKey));
  }, [savedViewKey]);

  const currentQuery = useMemo<FilmmakerQuery>(
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

  function persist(next: SavedView<FilmmakerQuery>[]) {
    setViews(next);
    try {
      window.localStorage.setItem(
        storageKey(savedViewKey),
        JSON.stringify(next),
      );
    } catch {
      /* localStorage unavailable (private mode / quota) — in-memory only. */
    }
  }

  function handleSaveView(name: string, query: FilmmakerQuery) {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const view: SavedView<FilmmakerQuery> = { id, name, query };
    persist([...views, view]);
    setActiveViewId(id);
  }

  function handleDeleteView(id: string) {
    persist(views.filter((v) => v.id !== id));
    if (activeViewId === id) setActiveViewId(null);
  }

  function handleSelectView(view: SavedView<FilmmakerQuery>) {
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
            onQueryChange={onSearchChange}
          />
        </div>
        {filterControls}
        {actions ? <div className="ml-auto">{actions}</div> : null}
      </div>

      <SavedViews<FilmmakerQuery>
        views={views}
        activeViewId={activeViewId}
        currentQuery={currentQuery}
        isDirty={isDirty}
        onSelectView={handleSelectView}
        onSaveView={handleSaveView}
        onDeleteView={handleDeleteView}
        onClearView={handleClearView}
        allViewsLabel="All"
        slug="filmmaker"
      />
    </div>
  );
}

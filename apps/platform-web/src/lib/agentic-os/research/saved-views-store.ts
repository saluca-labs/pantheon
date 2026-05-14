'use client';

/**
 * Research OS Wave D — localStorage-backed saved-views mock.
 *
 * The shared `SavedViews` primitive is pure props-in / callbacks-out: it
 * has no persistence of its own (known `_shared/views` gap #2 — Wave E
 * schema-backs it via `agos_shared_saved_views`). Until then, Wave D wires
 * Research's saved views with this localStorage mock — the same pattern
 * prior sub-waves used so the UX is real today and the swap to a real
 * table later is a one-file change.
 *
 * `TQuery` is the opaque per-surface filter-state shape. This store never
 * inspects it; it only round-trips it through JSON. Each surface picks a
 * stable `storageKey` (e.g. `research:hypotheses`, `research:blockers`).
 *
 * SSR-safe: every accessor guards `typeof window`. On the server (and in
 * the vitest jsdom teardown window) reads return `[]` and writes no-op.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { useCallback, useEffect, useState } from 'react';
import type { SavedView } from '@/components/agentic-os/_shared/views';

const KEY_PREFIX = 'pantheon.research.saved-views.';

function storageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

/** Read the persisted views for a surface. Returns `[]` on any failure. */
export function readSavedViews<TQuery>(storageKey: string): SavedView<TQuery>[] {
  if (!storageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive: only keep well-formed rows.
    return parsed.filter(
      (v): v is SavedView<TQuery> =>
        v != null &&
        typeof v.id === 'string' &&
        typeof v.name === 'string' &&
        'query' in v,
    );
  } catch {
    return [];
  }
}

/** Persist the full views list for a surface. No-ops when storage is absent. */
export function writeSavedViews<TQuery>(
  storageKey: string,
  views: SavedView<TQuery>[],
): void {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(
      KEY_PREFIX + storageKey,
      JSON.stringify(views),
    );
  } catch {
    // Quota / serialization failures are non-fatal — saved views are a
    // convenience layer, not a system of record.
  }
}

/** Stable-ish id for a freshly-saved view. */
function mkViewId(): string {
  return `sv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface UseSavedViewsResult<TQuery> {
  /** The persisted views, hydrated from localStorage after mount. */
  views: SavedView<TQuery>[];
  /** Save `query` under `name`, returning the new view. */
  saveView: (name: string, query: TQuery) => SavedView<TQuery>;
  /** Delete the view with `id`. */
  deleteView: (id: string) => void;
}

/**
 * React hook wrapping the localStorage store. Hydrates after mount (so SSR
 * markup matches the empty first render), then persists on every change.
 */
export function useSavedViews<TQuery>(
  storageKey: string,
): UseSavedViewsResult<TQuery> {
  const [views, setViews] = useState<SavedView<TQuery>[]>([]);

  // Hydrate once on mount — never during SSR.
  useEffect(() => {
    setViews(readSavedViews<TQuery>(storageKey));
  }, [storageKey]);

  const saveView = useCallback(
    (name: string, query: TQuery): SavedView<TQuery> => {
      const view: SavedView<TQuery> = { id: mkViewId(), name, query };
      setViews((prev) => {
        const next = [...prev, view];
        writeSavedViews(storageKey, next);
        return next;
      });
      return view;
    },
    [storageKey],
  );

  const deleteView = useCallback(
    (id: string) => {
      setViews((prev) => {
        const next = prev.filter((v) => v.id !== id);
        writeSavedViews(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  return { views, saveView, deleteView };
}

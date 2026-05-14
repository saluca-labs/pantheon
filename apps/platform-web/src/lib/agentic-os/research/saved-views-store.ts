'use client';

/**
 * SavedViews persistence — server-backed store (Wave E).
 *
 * The shared `SavedViews` primitive is pure props-in / callbacks-out: it
 * has no persistence of its own (was `_shared/views` gap #2). Wave D
 * wired a localStorage mock; Wave E schema-backs it with the real
 * `agos_shared_saved_views` table (migration 0070) exposed at
 * `/api/tiresias/agentic-os/shared/saved-views`.
 *
 * This module keeps the exact same external surface the localStorage
 * mock had — `useSavedViews(storageKey)` returning
 * `{ views, saveView, deleteView }` with a **synchronous** `saveView`
 * and `deleteView` — so every caller (`HypothesisLedger`,
 * `TopBlockersList`, …) and the `SavedViews` component are untouched.
 *
 * The synchronous contract is preserved by going **optimistic**:
 *   - `saveView` mints a client-side UUID, returns the view immediately,
 *     and fires the POST in the background. On failure the optimistic
 *     row is rolled back.
 *   - `deleteView` removes the row from state immediately and fires the
 *     DELETE in the background. On failure the row is restored.
 * This matches the UX the localStorage mock had (writes felt instant).
 *
 * `storageKey` is now the server-side `entity_kind` scope key — each
 * surface still picks a stable key (e.g. `research:hypotheses`,
 * `blockers`); the value just travels to the DB instead of localStorage.
 *
 * `TQuery` is the opaque per-surface filter-state shape. This store never
 * inspects it; it only round-trips it through JSON.
 *
 * SSR-safe: the hook hydrates from the API in a `useEffect`, so the
 * first (server + pre-mount) render is the empty list — same as the mock.
 *
 * @license MIT — Tiresias platform / Wave E shared primitives (internal).
 */

import { useCallback, useEffect, useState } from 'react';
import type { SavedView } from '@/components/agentic-os/_shared/views';

/** BFF collection endpoint for the shared SavedViews table. */
const API_BASE = '/api/tiresias/agentic-os/shared/saved-views';

/** Wire shape of a saved-view row as returned by the BFF. */
interface SavedViewWire {
  id: string;
  entityKind: string;
  name: string;
  query: unknown;
  createdAt: string;
  updatedAt: string;
}

function wireToView<TQuery>(row: SavedViewWire): SavedView<TQuery> {
  return { id: row.id, name: row.name, query: row.query as TQuery };
}

/**
 * Mint a client-side id so `saveView` can return synchronously. The
 * route accepts a client-supplied UUID and persists it verbatim, so the
 * optimistic id is the durable id (no reconcile step needed).
 */
function mkViewId(): string {
  try {
    if (
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
    ) {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to the manual path
  }
  // Manual RFC-4122 v4 fallback for environments without crypto.randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Fetch the persisted views for a surface. Returns `[]` on any failure —
 * saved views are a convenience layer, never block the page.
 */
export async function fetchSavedViews<TQuery>(
  entityKind: string,
): Promise<SavedView<TQuery>[]> {
  try {
    const r = await fetch(
      `${API_BASE}?entityKind=${encodeURIComponent(entityKind)}`,
      { headers: { accept: 'application/json' } },
    );
    if (!r.ok) return [];
    const data = await r.json();
    const rows: SavedViewWire[] = Array.isArray(data?.views) ? data.views : [];
    return rows.map((row) => wireToView<TQuery>(row));
  } catch {
    return [];
  }
}

export interface UseSavedViewsResult<TQuery> {
  /** The persisted views, hydrated from the API after mount. */
  views: SavedView<TQuery>[];
  /** Save `query` under `name`, returning the new view synchronously. */
  saveView: (name: string, query: TQuery) => SavedView<TQuery>;
  /** Delete the view with `id`. */
  deleteView: (id: string) => void;
}

/**
 * React hook wrapping the server-backed store. Hydrates from the API
 * after mount (so SSR markup matches the empty first render), then
 * persists every change optimistically.
 */
export function useSavedViews<TQuery>(
  storageKey: string,
): UseSavedViewsResult<TQuery> {
  const [views, setViews] = useState<SavedView<TQuery>[]>([]);

  // Hydrate once on mount — never during SSR.
  useEffect(() => {
    let active = true;
    void fetchSavedViews<TQuery>(storageKey).then((loaded) => {
      if (active) setViews(loaded);
    });
    return () => {
      active = false;
    };
  }, [storageKey]);

  const saveView = useCallback(
    (name: string, query: TQuery): SavedView<TQuery> => {
      const view: SavedView<TQuery> = { id: mkViewId(), name, query };
      // Optimistic insert — the UI sees the pill instantly.
      setViews((prev) => [...prev, view]);

      void fetch(API_BASE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: view.id,
          entityKind: storageKey,
          name,
          query,
        }),
      })
        .then((r) => {
          if (!r.ok) throw new Error(`save failed: ${r.status}`);
        })
        .catch(() => {
          // Roll the optimistic row back on failure.
          setViews((prev) => prev.filter((v) => v.id !== view.id));
        });

      return view;
    },
    [storageKey],
  );

  const deleteView = useCallback((id: string) => {
    let removed: SavedView<TQuery> | undefined;
    let removedIndex = -1;
    // Optimistic removal — capture the row so we can restore on failure.
    setViews((prev) => {
      removedIndex = prev.findIndex((v) => v.id === id);
      if (removedIndex >= 0) removed = prev[removedIndex];
      return prev.filter((v) => v.id !== id);
    });

    void fetch(`${API_BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' })
      .then((r) => {
        // 404 means the row was already gone server-side — treat as success.
        if (!r.ok && r.status !== 404) {
          throw new Error(`delete failed: ${r.status}`);
        }
      })
      .catch(() => {
        // Restore the row at its original position on failure.
        if (removed) {
          const restored = removed;
          const at = removedIndex;
          setViews((prev) => {
            if (prev.some((v) => v.id === restored.id)) return prev;
            const next = [...prev];
            next.splice(at >= 0 ? at : next.length, 0, restored);
            return next;
          });
        }
      });
  }, []);

  return { views, saveView, deleteView };
}

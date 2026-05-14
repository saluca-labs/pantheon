/**
 * Research OS Wave D — workshop-blockers saved-view helpers.
 *
 * Pure filter logic + the canonical "default saved view" for the
 * workshop blockers surface (Wave D specialization). The blockers list
 * gains `SavedViews`, and ships with a built-in **Top blockers** default
 * view (high-severity only) that is applied on first load — so the
 * surface opens on "what's actually on fire" rather than the full feed.
 *
 * `SavedViews` has no persistence of its own (known `_shared/views`
 * gap #2); user-saved views are persisted via the localStorage-mock
 * store. This module only owns the *shape* + the built-in default.
 *
 * No React, no DB — the testable seam under `TopBlockersList`.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import type {
  BlockerItem,
  BlockerItemKind,
  BlockerSeverity,
} from './blockers';

/** The opaque filter-state a blockers saved view restores. */
export interface BlockerQuery {
  kind: BlockerItemKind | 'all';
  severity: BlockerSeverity | 'all';
}

/** The neutral "show everything" query — backs the reset pill. */
export const ALL_BLOCKERS_QUERY: BlockerQuery = { kind: 'all', severity: 'all' };

/**
 * The built-in default view id. Stable string so it can be matched as the
 * active view on first paint without colliding with localStorage-mock ids
 * (those are `sv_*`).
 */
export const TOP_BLOCKERS_VIEW_ID = 'builtin:top-blockers';

/**
 * The built-in **Top blockers** default view: high-severity items across
 * all kinds. Applied on first load of the workshop blockers surface.
 */
export const TOP_BLOCKERS_DEFAULT_VIEW: {
  id: string;
  name: string;
  query: BlockerQuery;
} = {
  id: TOP_BLOCKERS_VIEW_ID,
  name: 'Top blockers',
  query: { kind: 'all', severity: 'high' },
};

/** True when two blocker queries are equivalent. */
export function blockerQueryEquals(a: BlockerQuery, b: BlockerQuery): boolean {
  return a.kind === b.kind && a.severity === b.severity;
}

/**
 * Apply a `BlockerQuery` to a list of blocker items. Pure — returns a new
 * array, input order preserved.
 */
export function filterBlockers(
  items: BlockerItem[],
  query: BlockerQuery,
): BlockerItem[] {
  return items.filter(
    (i) =>
      (query.kind === 'all' || i.kind === query.kind) &&
      (query.severity === 'all' || i.severity === query.severity),
  );
}

/** Group filtered blockers by experiment, preserving first-seen order. */
export interface BlockerExperimentGroup {
  experimentId: string;
  experimentName: string;
  items: BlockerItem[];
}

export function groupBlockersByExperiment(
  items: BlockerItem[],
): BlockerExperimentGroup[] {
  const map = new Map<string, BlockerExperimentGroup>();
  for (const item of items) {
    const entry = map.get(item.experimentId);
    if (entry) {
      entry.items.push(item);
    } else {
      map.set(item.experimentId, {
        experimentId: item.experimentId,
        experimentName: item.experimentName,
        items: [item],
      });
    }
  }
  return Array.from(map.values());
}

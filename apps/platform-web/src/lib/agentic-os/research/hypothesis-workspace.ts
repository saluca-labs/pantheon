/**
 * Research OS Wave D — hypothesis-ledger workspace helpers.
 *
 * Pure grouping / ordering logic for the Hypothesis Ledger *workspace*
 * (Wave D specialization). The ledger stops being a flat card list and
 * becomes a status-aware workspace: hypotheses grouped into lifecycle
 * lanes, an "open work" subset surfaced first, and a status-filter chip
 * model alongside the existing `EntitySearch` text query.
 *
 * No DB calls, no React — this is the testable seam under the workspace
 * UI. Mirrors the pattern of `blockers.ts` (pure ranking) and
 * `reproducibility.ts` (pure rollup).
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import {
  HYPOTHESIS_STATUSES,
  type Hypothesis,
  type HypothesisStatus,
} from './hypotheses';

/** A status-filter chip value: a concrete status, or the `all` reset. */
export type HypothesisStatusFilter = HypothesisStatus | 'all';

/**
 * Lifecycle-lane ordering for the workspace. `draft` → `active` →
 * `testing` are the "in-flight" lanes; `supported` / `refuted` /
 * `inconclusive` are resolved; `archived` trails last. The ledger renders
 * lanes in this order so the eye lands on live work first.
 */
export const HYPOTHESIS_STATUS_ORDER: HypothesisStatus[] = [
  'active',
  'testing',
  'draft',
  'supported',
  'refuted',
  'inconclusive',
  'archived',
];

/**
 * The "open work" statuses — hypotheses still being formulated or tested.
 * Drives the workspace's default "Open work" saved view + the count
 * surfaced in the workspace header.
 */
export const OPEN_HYPOTHESIS_STATUSES: ReadonlySet<HypothesisStatus> = new Set<
  HypothesisStatus
>(['draft', 'active', 'testing']);

/** Human label for a status value (re-derives from the canonical list). */
export function hypothesisStatusLabel(status: HypothesisStatus): string {
  return (
    HYPOTHESIS_STATUSES.find((s) => s.value === status)?.label ?? status
  );
}

/** True when a hypothesis is still in-flight (draft / active / testing). */
export function isOpenHypothesis(h: Pick<Hypothesis, 'status'>): boolean {
  return OPEN_HYPOTHESIS_STATUSES.has(h.status);
}

/**
 * Case-insensitive text match across the fields a researcher would search
 * the ledger by — title, the three clauses, and tags. Mirrors the inline
 * predicate the pre-Wave-D ledger used so search behaviour is unchanged.
 */
export function hypothesisMatchesQuery(
  h: Pick<
    Hypothesis,
    'title' | 'ifClause' | 'thenClause' | 'becauseClause' | 'tags'
  >,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    h.title.toLowerCase().includes(q) ||
    h.ifClause.toLowerCase().includes(q) ||
    h.thenClause.toLowerCase().includes(q) ||
    h.becauseClause.toLowerCase().includes(q) ||
    h.tags.some((t) => t.toLowerCase().includes(q))
  );
}

/**
 * Apply the workspace's two-axis filter: a status chip + a text query.
 * Pure — returns a new array, input order preserved.
 */
export function filterHypotheses(
  hypotheses: Hypothesis[],
  statusFilter: HypothesisStatusFilter,
  query: string,
): Hypothesis[] {
  return hypotheses.filter(
    (h) =>
      (statusFilter === 'all' || h.status === statusFilter) &&
      hypothesisMatchesQuery(h, query),
  );
}

/** One lifecycle lane in the workspace. */
export interface HypothesisStatusGroup {
  status: HypothesisStatus;
  label: string;
  hypotheses: Hypothesis[];
}

/**
 * Group hypotheses into lifecycle lanes in `HYPOTHESIS_STATUS_ORDER`.
 * Empty lanes are dropped so the workspace only renders lanes that have
 * content. Within a lane, input order is preserved (the repo already
 * returns newest-first).
 */
export function groupHypothesesByStatus(
  hypotheses: Hypothesis[],
): HypothesisStatusGroup[] {
  const byStatus = new Map<HypothesisStatus, Hypothesis[]>();
  for (const h of hypotheses) {
    const bucket = byStatus.get(h.status);
    if (bucket) bucket.push(h);
    else byStatus.set(h.status, [h]);
  }
  const groups: HypothesisStatusGroup[] = [];
  for (const status of HYPOTHESIS_STATUS_ORDER) {
    const bucket = byStatus.get(status);
    if (bucket && bucket.length > 0) {
      groups.push({ status, label: hypothesisStatusLabel(status), hypotheses: bucket });
    }
  }
  return groups;
}

/** Count of hypotheses per status — drives the status-chip count badges. */
export function countHypothesesByStatus(
  hypotheses: Hypothesis[],
): Record<HypothesisStatus, number> {
  const counts = {
    draft: 0,
    active: 0,
    testing: 0,
    supported: 0,
    refuted: 0,
    inconclusive: 0,
    archived: 0,
  } as Record<HypothesisStatus, number>;
  for (const h of hypotheses) counts[h.status] += 1;
  return counts;
}

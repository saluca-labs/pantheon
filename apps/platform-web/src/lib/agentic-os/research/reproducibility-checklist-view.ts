/**
 * Research OS Wave D — reproducibility checklist-view helpers.
 *
 * Pure ordering / sectioning logic for the reproducibility *checklist UI*
 * (Wave D specialization). The Phase 6 surface grouped items by state in
 * the raw `REPRO_STATE_VALUES` order; the Wave D checklist re-sections
 * them around "what still needs doing":
 *
 *  - **Outstanding** — `pending` + `in_progress`: the items that depress
 *    the score, surfaced first as the actionable checklist.
 *  - **Done** — `done`: the satisfied items.
 *  - **Excluded** — `not_applicable` + `waived`: out of the denominator,
 *    collapsed to the bottom.
 *
 * No React, no DB — the testable seam under `ReproducibilityChecklist`.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { reproItemKeyLabel, type ReproCheck } from './reproducibility';

/** The three checklist sections, in render order. */
export type ReproChecklistSectionKey = 'outstanding' | 'done' | 'excluded';

export interface ReproChecklistSection {
  key: ReproChecklistSectionKey;
  label: string;
  /** One-line description of what the section holds. */
  hint: string;
  items: ReproCheck[];
}

const SECTION_META: Record<
  ReproChecklistSectionKey,
  { label: string; hint: string }
> = {
  outstanding: {
    label: 'Outstanding',
    hint: 'Pending + in-progress items — these are what move the score.',
  },
  done: {
    label: 'Done',
    hint: 'Items satisfied with evidence.',
  },
  excluded: {
    label: 'Excluded',
    hint: 'Not applicable or waived — out of the score denominator.',
  },
};

/** Which section a given state belongs to. */
export function reproSectionForState(
  state: ReproCheck['state'],
): ReproChecklistSectionKey {
  if (state === 'pending' || state === 'in_progress') return 'outstanding';
  if (state === 'done') return 'done';
  return 'excluded';
}

/** Stable within-section ordering: by humanized label, ascending. */
function byLabel(a: ReproCheck, b: ReproCheck): number {
  const la = reproItemKeyLabel(a.itemKey);
  const lb = reproItemKeyLabel(b.itemKey);
  return la < lb ? -1 : la > lb ? 1 : 0;
}

/**
 * Section a checklist's items into outstanding / done / excluded, each
 * sorted by label. Empty sections are retained (the UI renders a per-
 * section empty hint) so the checklist always shows all three headings.
 */
export function buildReproChecklistSections(
  items: ReadonlyArray<ReproCheck>,
): ReproChecklistSection[] {
  const buckets: Record<ReproChecklistSectionKey, ReproCheck[]> = {
    outstanding: [],
    done: [],
    excluded: [],
  };
  for (const item of items) {
    buckets[reproSectionForState(item.state)].push(item);
  }
  const order: ReproChecklistSectionKey[] = ['outstanding', 'done', 'excluded'];
  return order.map((key) => ({
    key,
    label: SECTION_META[key].label,
    hint: SECTION_META[key].hint,
    items: buckets[key].slice().sort(byLabel),
  }));
}

/**
 * Completion fraction for the checklist progress bar: done / scoredTotal,
 * where scoredTotal = pending + in_progress + done. Returns 0 when there
 * is nothing scored (matches the `score: null` rollup case — the bar just
 * reads empty rather than throwing a divide-by-zero).
 */
export function reproChecklistProgress(
  items: ReadonlyArray<ReproCheck>,
): { done: number; scoredTotal: number; fraction: number } {
  let done = 0;
  let scored = 0;
  for (const item of items) {
    if (item.state === 'done') {
      done += 1;
      scored += 1;
    } else if (item.state === 'pending' || item.state === 'in_progress') {
      scored += 1;
    }
  }
  return {
    done,
    scoredTotal: scored,
    fraction: scored === 0 ? 0 : done / scored,
  };
}

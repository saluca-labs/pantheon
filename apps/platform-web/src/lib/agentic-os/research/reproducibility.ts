/**
 * Research OS Phase 6 — Reproducibility checklist domain types and helpers.
 *
 * A reproducibility check is one row in the per-experiment checklist. The
 * app seeds 7 canonical item_keys lazily on first GET to /reproducibility;
 * users can extend the list by POSTing arbitrary item_keys matching
 * `^[a-z0-9_]+$` (max 60 chars). The DB carries NO CHECK on the value.
 *
 * The reproducibility score is DERIVED on read, never stored:
 *
 *     score = done / (pending + in_progress + done)
 *
 * `not_applicable` and `waived` rows are EXCLUDED from the denominator.
 * When the denominator is zero, the helper returns `null` so the UI can
 * render a "no scored items" state explicitly.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

// ─── State taxonomy ───────────────────────────────────────────────────────

export const REPRO_STATE_VALUES = [
  'pending',
  'in_progress',
  'done',
  'not_applicable',
  'waived',
] as const;

export type ReproState = (typeof REPRO_STATE_VALUES)[number];

export const REPRO_STATE_LABELS: Record<ReproState, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  done: 'Done',
  not_applicable: 'Not applicable',
  waived: 'Waived',
};

/**
 * The 7 canonical item_keys seeded on first GET. NOT a closed set — users
 * can add more via POST. See `validateReproItemKey` for the regex.
 */
export const CANONICAL_REPRO_ITEM_KEYS = [
  'raw_data_archived',
  'methods_pinned',
  'code_published',
  'preregistration_filed',
  'ethics_filed',
  'data_dictionary_written',
  'analysis_reproducible',
] as const;

export type CanonicalReproItemKey = (typeof CANONICAL_REPRO_ITEM_KEYS)[number];

export const CANONICAL_REPRO_ITEM_LABELS: Record<CanonicalReproItemKey, string> = {
  raw_data_archived: 'Raw data archived',
  methods_pinned: 'Methods pinned',
  code_published: 'Code published',
  preregistration_filed: 'Preregistration filed',
  ethics_filed: 'Ethics filed',
  data_dictionary_written: 'Data dictionary written',
  analysis_reproducible: 'Analysis reproducible',
};

/**
 * Build a humanized display label for any item_key (canonical or custom).
 * For canonical keys, returns the locked label. For custom keys, replaces
 * underscores with spaces and capitalizes the first letter.
 */
export function reproItemKeyLabel(key: string): string {
  if ((CANONICAL_REPRO_ITEM_KEYS as readonly string[]).includes(key)) {
    return CANONICAL_REPRO_ITEM_LABELS[key as CanonicalReproItemKey];
  }
  const spaced = key.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ─── Entity ───────────────────────────────────────────────────────────────

export interface ReproCheck {
  id: string;
  experimentId: string;
  userId: string;
  itemKey: string;
  state: ReproState;
  evidenceUrl: string | null;
  notes: string | null;
  completedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReproCheckInput {
  itemKey: string;
  state?: ReproState;
  evidenceUrl?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateReproCheckInput {
  state?: ReproState;
  evidenceUrl?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

// ─── Validators ───────────────────────────────────────────────────────────

const ITEM_KEY_PATTERN = /^[a-z0-9_]+$/;

export function validateReproItemKey(value: unknown): string | null {
  if (typeof value !== 'string') return 'item_key must be a string.';
  if (value.length === 0) return 'item_key is required.';
  if (value.length > 60) return 'item_key must be at most 60 characters.';
  if (!ITEM_KEY_PATTERN.test(value)) {
    return 'item_key must match ^[a-z0-9_]+$ (lowercase letters, digits, underscores).';
  }
  return null;
}

export function validateReproState(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !(REPRO_STATE_VALUES as readonly string[]).includes(value)
  ) {
    return `state must be one of: ${REPRO_STATE_VALUES.join(', ')}.`;
  }
  return null;
}

export function asReproState(value: unknown): ReproState | null {
  if (
    typeof value === 'string' &&
    (REPRO_STATE_VALUES as readonly string[]).includes(value)
  ) {
    return value as ReproState;
  }
  return null;
}

// ─── Score derivation ─────────────────────────────────────────────────────

export interface ReproRollup {
  /**
   * 0.0 - 1.0, OR null when every scored row is excluded (denominator zero).
   */
  score: number | null;
  /** Total rows of state=done. */
  done: number;
  /** Total rows of state=in_progress. */
  inProgress: number;
  /** Total rows of state=pending. */
  pending: number;
  /** Total rows of state=not_applicable. */
  notApplicable: number;
  /** Total rows of state=waived. */
  waived: number;
  /** done + in_progress + pending — the score denominator. */
  scoredTotal: number;
}

/**
 * Compute the reproducibility rollup from a list of checks. Pure — no I/O.
 *
 *   score = done / (pending + in_progress + done)
 *
 * `not_applicable` and `waived` are EXCLUDED from both numerator and
 * denominator. When `scoredTotal === 0`, returns `score: null` so the UI
 * can render a "no scored items" state explicitly.
 */
export function computeReproRollup(items: ReadonlyArray<ReproCheck>): ReproRollup {
  let done = 0;
  let inProgress = 0;
  let pending = 0;
  let notApplicable = 0;
  let waived = 0;
  for (const item of items) {
    switch (item.state) {
      case 'done':
        done += 1;
        break;
      case 'in_progress':
        inProgress += 1;
        break;
      case 'pending':
        pending += 1;
        break;
      case 'not_applicable':
        notApplicable += 1;
        break;
      case 'waived':
        waived += 1;
        break;
    }
  }
  const scoredTotal = done + inProgress + pending;
  const score = scoredTotal === 0 ? null : done / scoredTotal;
  return {
    score,
    done,
    inProgress,
    pending,
    notApplicable,
    waived,
    scoredTotal,
  };
}

/**
 * Filter items down to the "blocking" subset — pending + in_progress, the
 * states that depress the score. Sorted by item_key ascending for stable
 * display.
 */
export function blockingReproItems(items: ReadonlyArray<ReproCheck>): ReproCheck[] {
  return items
    .filter((i) => i.state === 'pending' || i.state === 'in_progress')
    .slice()
    .sort((a, b) => (a.itemKey < b.itemKey ? -1 : a.itemKey > b.itemKey ? 1 : 0));
}

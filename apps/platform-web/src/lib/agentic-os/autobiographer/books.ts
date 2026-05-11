/**
 * Autobiographer OS — Book domain types and pure helpers.
 *
 * A `Book` is the per-OS project entity: the container that owns chapters
 * (Phase 4), arcs (Phase 5), and the privacy review surface (Phase 6).
 * Phase 1 introduces the book as a free-standing project that can have
 * memories attached to it; chapters land in Phase 4.
 *
 * Status taxonomy
 * ---------------
 * Five values cover the manuscript lifecycle:
 *
 *   - `drafting`  — first-draft capture, prose being added, no review yet
 *   - `revising`  — first draft complete, hand-edits and AI critic in flight
 *   - `done`      — manuscript finished, ready for export or archive
 *   - `paused`    — temporarily set aside, not abandoned
 *   - `archived`  — terminal, shelved indefinitely
 *
 * Phase progress mirrors Maker Phase 1 — a JSONB object keyed by status
 * (excluding `archived`, which is terminal rather than a progress bucket).
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

// ─── Status taxonomy ─────────────────────────────────────────────────────────

export const BOOK_STATUSES = [
  'drafting',
  'revising',
  'done',
  'paused',
  'archived',
] as const;

export type BookStatus = (typeof BOOK_STATUSES)[number];

export const BOOK_STATUS_LABELS: Record<BookStatus, string> = {
  drafting: 'Drafting',
  revising: 'Revising',
  done: 'Done',
  paused: 'Paused',
  archived: 'Archived',
};

// ─── Phase progress ──────────────────────────────────────────────────────────

/**
 * Phase keys tracked in `phase_progress`. Mirrors `BOOK_STATUSES` minus
 * `archived` — an archived book's progress is no longer meaningful.
 */
export const BOOK_PHASES = ['drafting', 'revising', 'done', 'paused'] as const;

export type BookPhase = (typeof BOOK_PHASES)[number];

export const BOOK_PHASE_LABELS: Record<BookPhase, string> = {
  drafting: 'Drafting',
  revising: 'Revising',
  done: 'Done',
  paused: 'Paused',
};

/** Per-phase completion percentage. Stored as a single JSONB column. */
export type BookPhaseProgress = Record<BookPhase, number>;

export function bookPhaseProgressDefault(): BookPhaseProgress {
  return {
    drafting: 0,
    revising: 0,
    done: 0,
    paused: 0,
  };
}

/**
 * Normalize an arbitrary JSON value into a complete `BookPhaseProgress`.
 * Missing keys default to 0, non-numeric entries are dropped, and every
 * value is clamped to 0-100 and rounded to an integer.
 */
export function coerceBookPhaseProgress(value: unknown): BookPhaseProgress {
  const out = bookPhaseProgressDefault();
  if (!value || typeof value !== 'object') return out;
  const v = value as Record<string, unknown>;
  for (const key of BOOK_PHASES) {
    const raw = v[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      out[key] = Math.max(0, Math.min(100, Math.round(raw)));
    }
  }
  return out;
}

// ─── Validators ──────────────────────────────────────────────────────────────

export function validateBookStatus(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !(BOOK_STATUSES as readonly string[]).includes(value)
  ) {
    return `Status must be one of: ${BOOK_STATUSES.join(', ')}.`;
  }
  return null;
}

export function validateBookPhaseProgress(
  input: unknown,
):
  | { ok: true; value: BookPhaseProgress }
  | { ok: false; error: string } {
  if (input === null || input === undefined) {
    return { ok: false, error: 'phase_progress body required' };
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'phase_progress must be an object' };
  }

  const obj = input as Record<string, unknown>;
  const out = bookPhaseProgressDefault();
  const known = new Set<string>(BOOK_PHASES);

  for (const [key, raw] of Object.entries(obj)) {
    if (!known.has(key)) {
      return { ok: false, error: `Unknown phase key: ${key}` };
    }
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return { ok: false, error: `phase ${key} must be a finite number` };
    }
    if (!Number.isInteger(raw)) {
      return {
        ok: false,
        error: `phase ${key} must be an integer (got ${raw})`,
      };
    }
    if (raw < 0 || raw > 100) {
      return {
        ok: false,
        error: `phase ${key} must be in 0..100 (got ${raw})`,
      };
    }
    out[key as BookPhase] = raw;
  }

  return { ok: true, value: out };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Average of the 4 phase percentages, integer 0..100. */
export function bookPhaseAvg(progress: unknown): number {
  const coerced = coerceBookPhaseProgress(progress);
  let sum = 0;
  for (const key of BOOK_PHASES) sum += coerced[key];
  return Math.round(sum / BOOK_PHASES.length);
}

/** Normalize an arbitrary tags list — trims, drops empty, dedupes (case-insensitive). */
export function normalizeBookTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/** Validate a book title before persistence. Returns human-readable errors. */
export function validateBookTitle(title: unknown): string | null {
  if (typeof title !== 'string') return 'Book title is required.';
  if (title.trim().length === 0) return 'Book title is required.';
  if (title.length > 500) return 'Book title must be 500 characters or fewer.';
  return null;
}

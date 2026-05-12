/**
 * Autobiographer OS — Chapter source (provenance) domain types and pure
 * helpers.
 *
 * A chapter source is an N:M provenance link from a chapter to one of
 * the user's memory captures, carrying a `weight` (0..1) the Phase 7
 * chapter_drafter uses to prioritize sources. Phase 4 lib + routes
 * write the weight; the drafter is a Phase 7 deliverable.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

/** Weight clamp. */
export const SOURCE_WEIGHT_MIN = 0;
export const SOURCE_WEIGHT_MAX = 1;

/** Max length of a per-source note. */
export const SOURCE_NOTES_MAX = 2_000;

export function validateSourceWeight(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Weight must be a finite number.';
  }
  if (value < SOURCE_WEIGHT_MIN || value > SOURCE_WEIGHT_MAX) {
    return `Weight must be in [${SOURCE_WEIGHT_MIN}..${SOURCE_WEIGHT_MAX}].`;
  }
  return null;
}

export function validateSourceNotes(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return 'Notes must be a string.';
  if (value.length > SOURCE_NOTES_MAX) {
    return `Notes must be ${SOURCE_NOTES_MAX} characters or fewer.`;
  }
  return null;
}

/**
 * Coerce a wire-shape weight to a clamped float in [0..1]. Useful when
 * the route handler can't trust the input came through Zod.
 */
export function coerceSourceWeight(value: unknown, fallback = 1.0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(SOURCE_WEIGHT_MIN, Math.min(SOURCE_WEIGHT_MAX, value));
}

/**
 * Autobiographer OS — Arc-chapter join domain helpers.
 *
 * A chapter's membership in an arc carries a `position` so the arc
 * defines a linear ordering. Position is 0-based and unique within an
 * arc (DEFERRABLE INITIALLY DEFERRED in the DB so reorder transactions
 * can stage all writes before commit).
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

export interface ReorderEntry {
  chapterId: string;
  position: number;
}

export function validatePosition(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return 'Position must be a non-negative integer.';
  }
  return null;
}

/**
 * Autobiographer OS — Pseudonym domain types and pure helpers.
 *
 * The per-book pseudonym map is a list of (person → replacement name)
 * pairs scoped to a single book. It powers the Phase 6 redaction layer
 * the PDF export route applies before layout. One pseudonym per
 * (book, person) — the UNIQUE constraint is enforced in the database.
 *
 * The ``applied`` flag is flipped by the export layer after a
 * substitution fires; it surfaces in the privacy hub so the user knows
 * which rename rows are live vs unused.
 *
 * @license MIT — original work for Tiresias platform
 */

export const PSEUDONYM_NAME_MAX = 200;
export const PSEUDONYM_NOTES_MAX = 4_000;

export function validatePseudonymName(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'Pseudonym is required.';
  }
  if (value.length > PSEUDONYM_NAME_MAX) {
    return `Pseudonym must be ${PSEUDONYM_NAME_MAX} characters or fewer.`;
  }
  return null;
}

export function validatePseudonymNotes(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return 'Notes must be a string.';
  if (value.length > PSEUDONYM_NOTES_MAX) {
    return `Notes must be ${PSEUDONYM_NOTES_MAX} characters or fewer.`;
  }
  return null;
}

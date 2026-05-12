/**
 * Autobiographer OS — Review-check domain types and pure helpers.
 *
 * The Phase 6 pre-publication checklist binds a small, closed set of
 * check ``kind`` values to a status taxonomy ("pending" / "passed" /
 * "waived" / "failed"). The lock route consumes the kind axis when it
 * computes the required-check set for a chapter (consent_collected +
 * attribution_verified always required; sensitive_flagged added when
 * the chapter revision or a source memory carries any sensitive kind).
 *
 * Storage invariants:
 *   - chapter_id NULL → book-level check
 *   - chapter_id NOT NULL → chapter-level check
 *   - One row per (chapter_id, kind) where chapter-scoped
 *   - One row per (book_id, kind) where book-scoped
 *
 * @license MIT — original work for Tiresias platform
 */

export const REVIEW_CHECK_KINDS = [
  'consent_collected',
  'sensitive_flagged',
  'attribution_verified',
  'redaction_applied',
  'third_party_disclaimer',
  'legal_reviewed',
] as const;

export type ReviewCheckKind = (typeof REVIEW_CHECK_KINDS)[number];

export const REVIEW_CHECK_KIND_LABELS: Record<ReviewCheckKind, string> = {
  consent_collected: 'Consent collected',
  sensitive_flagged: 'Sensitive content flagged',
  attribution_verified: 'Attribution verified',
  redaction_applied: 'Redaction applied',
  third_party_disclaimer: 'Third-party disclaimer',
  legal_reviewed: 'Legal reviewed',
};

export const REVIEW_CHECK_KIND_DESCRIPTIONS: Record<ReviewCheckKind, string> = {
  consent_collected:
    'Every named person has a consent state on file (granted / pending / withheld / deceased / public_figure / not_applicable).',
  sensitive_flagged:
    'Every revision or source memory carrying a sensitive_kind has been reviewed and tagged.',
  attribution_verified:
    'Quoted material has been attributed to the source. Paraphrased material has been re-read for accuracy.',
  redaction_applied:
    'Names that must not appear in the published manuscript have been substituted via the pseudonym map.',
  third_party_disclaimer:
    'A disclaimer about reconstructed dialogue / composite scenes has been added to the front matter.',
  legal_reviewed:
    'A licensed attorney has reviewed the manuscript for defamation / privacy risk.',
};

export const REVIEW_CHECK_STATUSES = [
  'pending',
  'passed',
  'waived',
  'failed',
] as const;

export type ReviewCheckStatus = (typeof REVIEW_CHECK_STATUSES)[number];

export const REVIEW_CHECK_STATUS_LABELS: Record<ReviewCheckStatus, string> = {
  pending: 'Pending',
  passed: 'Passed',
  waived: 'Waived',
  failed: 'Failed',
};

/** Bounds checked by the database CHECK constraints. */
export const REVIEW_CHECK_NOTES_MAX = 4_000;

/**
 * Required base check set for every chapter lock. Sensitive content
 * adds ``sensitive_flagged`` on top (computed by the lock route).
 *
 * The set is fixed (not user-tunable in Phase 6); a future enhancement
 * could let an author add custom required checks at the book level.
 */
export const REQUIRED_BASE_CHECKS: readonly ReviewCheckKind[] = [
  'consent_collected',
  'attribution_verified',
] as const;

/**
 * Status values that satisfy a required check at lock time. ``passed``
 * is the happy path; ``waived`` is an explicit author override that
 * still produces an audit trail.
 */
export const SATISFIED_STATUSES: readonly ReviewCheckStatus[] = [
  'passed',
  'waived',
] as const;

export function asReviewCheckKind(value: unknown): ReviewCheckKind | null {
  if (typeof value !== 'string') return null;
  return (REVIEW_CHECK_KINDS as readonly string[]).includes(value)
    ? (value as ReviewCheckKind)
    : null;
}

export function asReviewCheckStatus(
  value: unknown,
): ReviewCheckStatus | null {
  if (typeof value !== 'string') return null;
  return (REVIEW_CHECK_STATUSES as readonly string[]).includes(value)
    ? (value as ReviewCheckStatus)
    : null;
}

export function validateReviewCheckNotes(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return 'Notes must be a string.';
  if (value.length > REVIEW_CHECK_NOTES_MAX) {
    return `Notes must be ${REVIEW_CHECK_NOTES_MAX} characters or fewer.`;
  }
  return null;
}

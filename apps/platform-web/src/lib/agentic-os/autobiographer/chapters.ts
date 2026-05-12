/**
 * Autobiographer OS — Chapter & Life-Event domain types and pure helpers.
 *
 * Phase 4 rewrites the chapter entity from "user-global single-blob"
 * (legacy migration 0009) to "book-scoped with versioned revisions". The
 * book-scoped surface lives in this file; the legacy `Chapter` /
 * `LifeEvent` shapes are preserved at the bottom of the file so the
 * legacy single-chapter editor page continues to render against the
 * carry-over rows produced by migration 0045.
 *
 * Status taxonomy — Phase 4
 * -------------------------
 * Four states cover the chapter lifecycle:
 *
 *   - `outline`  — title + summary captured, no prose yet
 *   - `drafting` — at least one revision is being typed / regenerated
 *   - `revised`  — at least one hand-edit revision has landed
 *   - `locked`   — Phase 6 publishes / archives reach this state via a
 *     consent + privacy review gate; Phase 4 just plants the value.
 *
 * Lifecycle ordering is advisory — the CHECK constraint enforces value
 * membership but does not block backward transitions.
 *
 * Life-event taxonomy is unchanged from the legacy file (McAdams 2001);
 * the legacy `agos_autobiographer_events` table is preserved and now
 * FK-bound to the new chapters table (see migration 0045).
 *
 * Reference:
 *   McAdams, D.P. (2001). The psychology of life stories.
 *   Review of General Psychology, 5(2), 100-122.
 *   https://doi.org/10.1111/1467-8721.00097
 *
 * @license MIT — original work for Tiresias platform
 */

// ─── Phase 4 chapter taxonomy ────────────────────────────────────────────────

/** Chapter lifecycle statuses (Phase 4). Mirrors migration 0045 CHECK. */
export const CHAPTER_STATUSES = [
  'outline',
  'drafting',
  'revised',
  'locked',
] as const;

export type ChapterStatus = (typeof CHAPTER_STATUSES)[number];

export const CHAPTER_STATUS_LABELS: Record<ChapterStatus, string> = {
  outline: 'Outline',
  drafting: 'Drafting',
  revised: 'Revised',
  locked: 'Locked',
};

/** Max length of a chapter title for display + validation. */
export const CHAPTER_TITLE_MAX = 500;

/** Max length of a chapter slug. */
export const CHAPTER_SLUG_MAX = 120;

/** Max length of a chapter summary. */
export const CHAPTER_SUMMARY_MAX = 4_000;

// ─── Validators ──────────────────────────────────────────────────────────────

export function validateChapterTitle(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return 'Title must be a string.';
  if (value.length > CHAPTER_TITLE_MAX) {
    return `Title must be ${CHAPTER_TITLE_MAX} characters or fewer.`;
  }
  return null;
}

export function validateChapterStatus(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !(CHAPTER_STATUSES as readonly string[]).includes(value)
  ) {
    return `Status must be one of: ${CHAPTER_STATUSES.join(', ')}.`;
  }
  return null;
}

export function validateChapterSummary(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return 'Summary must be a string.';
  if (value.length > CHAPTER_SUMMARY_MAX) {
    return `Summary must be ${CHAPTER_SUMMARY_MAX} characters or fewer.`;
  }
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * URL-safe slug derived from a chapter title. Lowercase, dash-joined,
 * trimmed. Empty strings collapse to '' so the repo can fall back to a
 * deterministic "chapter-N" placeholder.
 */
export function chapterSlug(title: string | null | undefined): string {
  return (title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, CHAPTER_SLUG_MAX);
}

/**
 * Word-count a prose string the same way every other Autobiographer
 * surface does (mirrors `voice-samples.countVoiceSampleWords`).
 */
export function countChapterWords(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

// ─── Legacy chapter shape (single-chapter editor compatibility) ────────────
//
// The legacy page reads from agos_autobiographer_chapters_legacy after
// migration 0045 renames it. The type shape stays the same; only the
// table name in `repo.ts` shifts.

/** Legacy chapter statuses (migration 0009). */
export const LEGACY_CHAPTER_STATUSES = ['draft', 'in_review', 'final'] as const;
export type LegacyChapterStatus = (typeof LEGACY_CHAPTER_STATUSES)[number];

/**
 * Life-event kinds derived from McAdams's life-story narrative categories.
 *
 * Reference:
 *   McAdams, D.P. (2001). The psychology of life stories.
 *   Review of General Psychology, 5(2), 100-122.
 *   https://doi.org/10.1111/1467-8721.00097
 */
export const EVENT_KINDS = [
  'milestone',
  'turning_point',
  'challenge',
  'achievement',
  'relationship',
  'place',
  'belief',
  'other',
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export interface Chapter {
  id: string;
  userId: string;
  title: string;
  bodyText: string;
  periodLabel: string | null;
  status: LegacyChapterStatus;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LifeEvent {
  id: string;
  chapterId: string;
  userId: string;
  kind: EventKind;
  headline: string;
  detail: string | null;
  occurredYear: number | null;
  createdAt: string;
}

/** Whitespace-split word count for the legacy single-chapter editor. */
export function countWords(text: string): number {
  return countChapterWords(text);
}

// ─── Phase 6 — chapter lock required-check computation ───────────────────────
//
// Pure helper consumed by the lock route. The route fetches the
// chapter's sensitive-content flag (see `chapters-repo.chapterHasSensitiveContent`)
// and passes the boolean here; the helper returns the canonical
// required-check set. Kept in this file (the chapter-domain module)
// so the lock-route logic stays declarative.
//
// Sensitive-content rule: if the chapter has any revision carrying a
// non-empty `sensitive_kinds`, OR if any source memory (via
// chapter_sources) has a non-empty `sensitive_kinds`, the
// `sensitive_flagged` review check is required.

/**
 * Required review-check kinds for a chapter lock. Always includes
 * `consent_collected` + `attribution_verified`; adds `sensitive_flagged`
 * when the chapter has sensitive content (either on a revision or via
 * any source memory).
 */
export function computeRequiredCheckKinds(opts: {
  hasSensitiveContent: boolean;
}): string[] {
  const base = ['consent_collected', 'attribution_verified'];
  if (opts.hasSensitiveContent) base.push('sensitive_flagged');
  return base;
}

/**
 * Estimate reading time in minutes (Brysbaert 2019, 238 wpm).
 * https://doi.org/10.1016/j.jml.2019.104047
 */
export function estimateReadingMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 238));
}

/**
 * Validate a legacy chapter before persisting against the legacy table.
 * Kept for the single-chapter editor; the new Phase 4 form uses the
 * per-field validators above.
 */
export function validateChapter(
  data: Partial<Pick<Chapter, 'title' | 'bodyText' | 'status'>>,
): string[] {
  const errors: string[] = [];
  if (!data.title || data.title.trim().length === 0) {
    errors.push('Chapter title is required.');
  }
  if (data.title && data.title.length > 255) {
    errors.push('Chapter title must be 255 characters or fewer.');
  }
  if (
    data.status &&
    !(LEGACY_CHAPTER_STATUSES as readonly string[]).includes(data.status)
  ) {
    errors.push(`Status "${data.status}" is not valid.`);
  }
  return errors;
}

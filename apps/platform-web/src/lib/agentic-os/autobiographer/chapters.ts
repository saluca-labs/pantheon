/**
 * Autobiographer OS — Chapter & Life-Event domain logic.
 *
 * A chapter captures a period of the author's life in prose. Life events
 * are discrete moments within a chapter (meeting someone, a move, a decision).
 *
 * The chapter-capture + voice-notes flow is the headline feature: the author
 * writes free-form prose, and can attach typed life events as structured
 * anchors that help with continuity across chapters.
 *
 * Life-period and event taxonomy is adapted from narrative-psychology and
 * life-story interview frameworks:
 *   - McAdams, D.P. (2001) "The psychology of life stories" — public domain
 *     review published by the Society for Research in Child Development.
 *     https://doi.org/10.1111/1467-8721.00097
 *
 * @license MIT — original work for Tiresias platform
 */

/** Chapter status mirrors common manuscript workflow states. */
export const CHAPTER_STATUSES = ['draft', 'in_review', 'final'] as const;
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number];

/**
 * Life-event kinds derived from McAdams's life-story narrative categories and
 * autobiographical-memory research.
 *
 * Reference:
 *   McAdams, D.P. (2001). The psychology of life stories.
 *   Review of General Psychology, 5(2), 100–122.
 *   https://doi.org/10.1111/1467-8721.00097
 */
export const EVENT_KINDS = [
  'milestone',      // graduation, marriage, birth, death
  'turning_point',  // decision that changed direction
  'challenge',      // adversity or obstacle faced
  'achievement',    // award, recognition, personal goal met
  'relationship',   // meeting or losing someone significant
  'place',          // move, travel, home
  'belief',         // change in values or worldview
  'other',
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export interface Chapter {
  id: string;
  userId: string;
  title: string;
  bodyText: string;
  periodLabel: string | null;
  status: ChapterStatus;
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

/**
 * Count words in a prose string using whitespace splitting — suitable for
 * word-count display (not linguistic analysis).
 */
export function countWords(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

/**
 * Estimate reading time in minutes based on the average adult reading speed
 * of ~238 words per minute.
 *
 * Source: Brysbaert, M. (2019). How many words do we read per minute?
 *   A review and meta-analysis of reading rate.
 *   Journal of Memory and Language, 109, 104047.
 *   https://doi.org/10.1016/j.jml.2019.104047
 */
export function estimateReadingMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 238));
}

/**
 * Validate a chapter before persisting.
 * Returns human-readable error strings (empty list = valid).
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
  if (data.status && !(CHAPTER_STATUSES as readonly string[]).includes(data.status)) {
    errors.push(`Status "${data.status}" is not valid.`);
  }
  return errors;
}

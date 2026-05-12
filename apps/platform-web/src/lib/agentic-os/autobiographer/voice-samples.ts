/**
 * Autobiographer OS — Voice sample domain types and pure helpers.
 *
 * A voice sample is a paragraph (or larger block) of the user's own
 * writing that they've labeled "this sounds like me". The Phase 3
 * builder reads non-archived samples to produce a versioned voice
 * profile; the Phase 7 chapter_drafter retrieves 1-2 short verbatim
 * excerpts at generation time alongside the profile (RAG few-shot).
 *
 * Samples may be backed by an existing memory (`memory_id` set) or
 * free-typed (memory_id null). Memory-backed samples CASCADE on memory
 * delete; free-typed samples are independent.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

// ─── Limits ──────────────────────────────────────────────────────────────────

/** Maximum length of a sample title (display only). */
export const VOICE_SAMPLE_TITLE_MAX = 500;

/** Maximum length of a sample body in characters. ~16k words ceiling. */
export const VOICE_SAMPLE_BODY_MAX = 100_000;

/** Minimum word count for a sample to be useful for style analysis. */
export const VOICE_SAMPLE_MIN_WORDS = 20;

// ─── Validators ──────────────────────────────────────────────────────────────

export function validateVoiceSampleTitle(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return 'Title must be a string.';
  if (value.length > VOICE_SAMPLE_TITLE_MAX) {
    return `Title must be ${VOICE_SAMPLE_TITLE_MAX} characters or fewer.`;
  }
  return null;
}

export function validateVoiceSampleBody(value: unknown): string | null {
  if (typeof value !== 'string') return 'Sample body is required.';
  if (value.trim().length === 0) return 'Sample body is required.';
  if (value.length > VOICE_SAMPLE_BODY_MAX) {
    return `Sample body must be ${VOICE_SAMPLE_BODY_MAX} characters or fewer.`;
  }
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Whitespace-split word count of a prose string. Mirrors
 * `chapters.countWords` shape so display and analysis numbers line up.
 */
export function countVoiceSampleWords(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

/**
 * Derive a short display title from a sample's body when the author did
 * not supply one. Trims to ~60 chars on a word boundary, with an
 * ellipsis if truncated.
 */
export function deriveVoiceSampleTitle(body: string, max = 60): string {
  const oneLine = (body ?? '').trim().replace(/\s+/g, ' ');
  if (!oneLine) return 'Untitled sample';
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

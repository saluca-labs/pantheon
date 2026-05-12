/**
 * Autobiographer OS — Chapter revision domain types and pure helpers.
 *
 * A revision is one version of a chapter's prose. Every chapter has at
 * least one revision once any prose lands; `version` is monotonically
 * increasing per chapter. `author` is `'user'` for hand-typed edits and
 * `'coach'` for ghostwriter-produced drafts; the Phase 7 chapter_drafter
 * will POST coach revisions with a `coach_session_id`.
 *
 * Citations are stored as a JSONB array of `{ paragraph_index, memory_ids }`
 * entries — the PDF templates render paragraph-level footnotes from this
 * column. The repo validates structural shape on write but never
 * normalizes the contained `memory_ids` (the source of truth is the
 * provenance join, not the citations payload).
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

/** Allowed revision authors. Mirrors the migration 0045 CHECK. */
export const REVISION_AUTHORS = ['user', 'coach'] as const;
export type RevisionAuthor = (typeof REVISION_AUTHORS)[number];

/** Max length of a single revision body. ~16k words ceiling. */
export const REVISION_BODY_MAX = 200_000;

/** Max length of a revision summary. */
export const REVISION_SUMMARY_MAX = 4_000;

/** Max number of citation entries per revision. */
export const REVISION_CITATIONS_MAX = 1_000;

/** Max number of memory ids inside a single paragraph citation. */
export const REVISION_CITATIONS_MEMORIES_PER_PARAGRAPH_MAX = 50;

/**
 * Structured citation entry. `paragraph_index` is zero-based and refers
 * to the paragraph order in `body_text` (paragraphs are
 * double-newline-split). `memory_ids` is a deduped list of memory UUIDs
 * the chapter_drafter consulted for that paragraph.
 */
export interface RevisionCitation {
  paragraphIndex: number;
  memoryIds: string[];
}

// ─── Validators ──────────────────────────────────────────────────────────────

export function validateRevisionAuthor(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !(REVISION_AUTHORS as readonly string[]).includes(value)
  ) {
    return `Author must be one of: ${REVISION_AUTHORS.join(', ')}.`;
  }
  return null;
}

export function validateRevisionBody(value: unknown): string | null {
  if (typeof value !== 'string') return 'Body must be a string.';
  if (value.length > REVISION_BODY_MAX) {
    return `Body must be ${REVISION_BODY_MAX} characters or fewer.`;
  }
  return null;
}

export function validateRevisionSummary(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return 'Summary must be a string.';
  if (value.length > REVISION_SUMMARY_MAX) {
    return `Summary must be ${REVISION_SUMMARY_MAX} characters or fewer.`;
  }
  return null;
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Word count for a revision body. Whitespace-split — mirrors every other
 * Autobiographer surface (`chapters.countWords`,
 * `voice-samples.countVoiceSampleWords`).
 */
export function countRevisionWords(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

/**
 * Normalize a raw citation payload to the structured shape. Accepts
 * both the camelCase shape (`{paragraphIndex, memoryIds}`) and the
 * snake_case wire shape (`{paragraph_index, memory_ids}`). Drops
 * malformed entries, clamps `paragraphIndex` to a non-negative
 * integer, dedupes `memoryIds`, and truncates to the configured
 * caps. Returns a defensive copy.
 */
export function normalizeCitations(input: unknown): RevisionCitation[] {
  if (!Array.isArray(input)) return [];
  const out: RevisionCitation[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const rawIdx = r.paragraphIndex ?? r.paragraph_index;
    const rawMems = r.memoryIds ?? r.memory_ids;
    if (typeof rawIdx !== 'number' || !Number.isFinite(rawIdx)) continue;
    const idx = Math.max(0, Math.floor(rawIdx));
    if (!Array.isArray(rawMems)) continue;
    const seen = new Set<string>();
    const memoryIds: string[] = [];
    for (const m of rawMems) {
      if (typeof m !== 'string') continue;
      const trimmed = m.trim();
      if (!trimmed) continue;
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      memoryIds.push(trimmed);
      if (memoryIds.length >= REVISION_CITATIONS_MEMORIES_PER_PARAGRAPH_MAX) break;
    }
    out.push({ paragraphIndex: idx, memoryIds });
    if (out.length >= REVISION_CITATIONS_MAX) break;
  }
  // Stable order: by paragraphIndex ASC. Phase 4 PDF templates rely on
  // this ordering when emitting footnotes.
  out.sort((a, b) => a.paragraphIndex - b.paragraphIndex);
  return out;
}

/**
 * Reduce a citations array to a flat, deduped list of memory ids. The
 * book-export PDF uses this to assemble the provenance appendix.
 */
export function citationsMemoryIds(citations: RevisionCitation[]): string[] {
  const seen = new Set<string>();
  for (const c of citations) {
    for (const m of c.memoryIds) {
      seen.add(m);
    }
  }
  return Array.from(seen);
}

/**
 * Autobiographer coach — citation parser.
 *
 * The chapter_drafter mode emits one citation line after each paragraph
 * in the exact format:
 *
 *     [cites: <uuid_1>, <uuid_2>, …]
 *
 * This module parses the assistant text into an ordered list of
 * `{ paragraph_index, memory_ids[] }` entries — one entry per cited
 * paragraph. The shape matches the `RevisionCitation` payload that
 * `agos_autobiographer_chapter_revisions.citations JSONB` accepts.
 *
 * Pure, no I/O. Bad lines are skipped silently so a model that
 * occasionally drops the format does not crash the commit flow.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

/** UUID regex — accepts both v4 + v5 forms. */
const UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;

/** Match a citation line. Greedy because UUIDs may be many. */
const CITES_LINE_RE = /\[cites:\s*([^\]]+)\]/gi;

/**
 * Citation entry as emitted by the parser — wire-shape (snake_case)
 * compatible with the chapter_revisions citations JSONB column. The
 * repo's `normalizeCitations` tolerates both snake_case and camelCase
 * keys, so the parser uses the more wire-friendly snake_case here.
 */
export interface ParsedCitation {
  paragraph_index: number;
  memory_ids: string[];
}

/**
 * Parse an assistant message into an ordered list of citations.
 *
 * Strategy: scan the text for `[cites: …]` markers in source order;
 * each marker becomes one entry. The paragraph_index is the marker's
 * ordinal — the Nth `[cites: …]` line becomes `paragraph_index = N`
 * (1-based, so the first cited paragraph is index 1).
 *
 * Memory IDs are extracted with a UUID regex; non-UUID tokens are
 * dropped silently. Duplicate memory IDs within a single marker are
 * deduped while preserving first-seen order.
 *
 * Returns an empty array when no `[cites: …]` markers exist.
 */
export function parseCitations(text: string): ParsedCitation[] {
  if (typeof text !== 'string' || text.length === 0) return [];
  const out: ParsedCitation[] = [];
  let paragraphIndex = 0;
  for (const match of text.matchAll(CITES_LINE_RE)) {
    paragraphIndex += 1;
    const body = match[1] ?? '';
    const uuids = body.match(UUID_RE) ?? [];
    // Dedupe + lower-case for storage stability.
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const u of uuids) {
      const lower = u.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        ids.push(lower);
      }
    }
    if (ids.length === 0) continue;
    out.push({
      paragraph_index: paragraphIndex,
      memory_ids: ids,
    });
  }
  return out;
}

/**
 * Count how many citation markers exist in the assistant text. Used
 * by the UI to show "N paragraphs cited" in the streaming indicator.
 */
export function countCitationMarkers(text: string): number {
  if (typeof text !== 'string' || text.length === 0) return 0;
  return (text.match(CITES_LINE_RE) ?? []).length;
}

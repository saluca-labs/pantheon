/**
 * Autobiographer OS — Memory capture domain types and pure helpers.
 *
 * Memories are workshop-global atomic captures — the raw building blocks
 * that future phases turn into chapters with full provenance. A memory
 * may optionally be attached to a book (`book_id`), but the workshop view
 * lists every memory the user has captured regardless of book.
 *
 * Source taxonomy
 * ---------------
 *   - `text`              — typed directly by the author (default)
 *   - `audio_transcript`  — pasted or AI-generated transcript of an audio capture
 *   - `photo_caption`     — pulled from a photo's caption metadata
 *   - `import`            — bulk-imported from an external source (e.g. journal export)
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

// ─── Source taxonomy ─────────────────────────────────────────────────────────

export const MEMORY_SOURCES = [
  'text',
  'audio_transcript',
  'photo_caption',
  'import',
] as const;

export type MemorySource = (typeof MEMORY_SOURCES)[number];

export const MEMORY_SOURCE_LABELS: Record<MemorySource, string> = {
  text: 'Text',
  audio_transcript: 'Audio transcript',
  photo_caption: 'Photo caption',
  import: 'Import',
};

// ─── Validators ──────────────────────────────────────────────────────────────

export function validateMemorySource(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !(MEMORY_SOURCES as readonly string[]).includes(value)
  ) {
    return `Source must be one of: ${MEMORY_SOURCES.join(', ')}.`;
  }
  return null;
}

export function validateMemoryTitle(value: unknown): string | null {
  if (typeof value !== 'string') return 'Memory title is required.';
  if (value.trim().length === 0) return 'Memory title is required.';
  if (value.length > 500) {
    return 'Memory title must be 500 characters or fewer.';
  }
  return null;
}

export function validateMemoryBody(value: unknown): string | null {
  if (typeof value !== 'string') return 'Memory body is required.';
  if (value.length === 0) return 'Memory body is required.';
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalize a tag list — trims, drops empty entries, dedupes case-insensitively.
 * Used for both `content_tags` and `emotion_tags`.
 */
export function normalizeMemoryTags(tags: readonly string[]): string[] {
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

/**
 * Normalize a list of photo URLs — trims, drops empty entries, dedupes.
 * Preserves URL casing (URLs are case-sensitive after the host).
 */
export function normalizePhotoUrls(urls: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Estimate word count for a memory body (whitespace-split).
 * Useful for display in the memory list but not persisted on the row.
 */
export function memoryWordCount(body: string): number {
  return body.trim() === '' ? 0 : body.trim().split(/\s+/).length;
}

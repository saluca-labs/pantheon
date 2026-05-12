/**
 * Research OS Phase 2 — Notebook entry domain types + pure helpers.
 *
 * Defines the `NotebookEntry` row shape, the create/update input
 * surfaces, the filter helper used by the timeline, and a markdown
 * preview helper that the card UI reuses.
 *
 * No DB calls here — those live in `notebook-entries-repo.ts`.
 *
 * @license MIT — Tiresias Research OS Phase 2 (internal).
 */

import { ENTRY_KINDS, asEntryKind, type EntryKind } from './entry-kinds';

// ─── Row shape ───────────────────────────────────────────────────────────────

export interface NotebookEntry {
  id: string;
  userId: string;
  experimentId: string;
  entryKind: EntryKind;
  title: string;
  bodyMd: string;
  attachedUrls: string[];
  tags: string[];
  /** Editable lab-time of the entry; ISO-8601 UTC. */
  entryAt: string;
  /** Soft-archive marker. NULL = active. */
  archivedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─── Create / update inputs ─────────────────────────────────────────────────

export interface CreateNotebookEntryInput {
  /** Defaults to `note` when omitted. */
  entryKind?: EntryKind;
  title: string;
  bodyMd?: string;
  attachedUrls?: string[];
  tags?: string[];
  /**
   * Optional lab-time override. ISO-8601 string (e.g. '2026-05-12T15:00:00Z').
   * When omitted, the DB default `now()` applies.
   */
  entryAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Update input. `experiment_id` / `id` / `user_id` / `created_at` /
 * `updated_at` / `archived_at` are explicitly NOT here — those are
 * non-patchable per spec.
 */
export type UpdateNotebookEntryInput = Partial<{
  entryKind: EntryKind;
  title: string;
  bodyMd: string;
  attachedUrls: string[];
  tags: string[];
  entryAt: string;
  metadata: Record<string, unknown>;
}>;

// ─── Filter helpers ─────────────────────────────────────────────────────────

export interface NotebookListOpts {
  /** Include archived rows in the result. Default false. */
  archived?: boolean;
  /** Filter by entry kind. */
  entryKind?: EntryKind;
  /** Filter by tag (single-tag match via ANY()). Case-insensitive. */
  tag?: string;
  /** Max rows; clamped to [1, 500] by the repo. */
  limit?: number;
  offset?: number;
}

/**
 * Predicate used by tests + small client filters: does `entry` match
 * the given filter opts? Mirrors the SQL filter logic in the repo so
 * unit tests can lock the predicate without a DB.
 */
export function notebookEntryMatchesFilter(
  entry: Pick<NotebookEntry, 'entryKind' | 'tags' | 'archivedAt'>,
  opts: NotebookListOpts,
): boolean {
  if (opts.archived === true) {
    if (entry.archivedAt == null) return false;
  } else if (opts.archived === false || opts.archived === undefined) {
    if (entry.archivedAt != null) return false;
  }

  if (opts.entryKind && entry.entryKind !== opts.entryKind) return false;

  if (opts.tag && opts.tag.trim()) {
    const needle = opts.tag.trim().toLowerCase();
    if (!entry.tags.some((t) => t.toLowerCase() === needle)) return false;
  }

  return true;
}

// ─── Validators ─────────────────────────────────────────────────────────────

const URL_PATTERN = /^https?:\/\/[^\s]+$/i;

export function validateAttachedUrl(url: unknown): string | null {
  if (typeof url !== 'string') return 'must be a string';
  if (url.length === 0) return 'cannot be empty';
  if (url.length > 4000) return 'too long (max 4000 chars)';
  if (!URL_PATTERN.test(url)) return 'must be a valid http(s) URL';
  return null;
}

/**
 * Sanity-check an entry_at value coming from the patch body. The route
 * already validates ISO-8601 via Zod; this is a defence-in-depth wrap
 * for direct repo use.
 */
export function validateEntryAt(value: unknown): string | null {
  if (typeof value !== 'string') return 'must be an ISO-8601 string';
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return 'must be a parseable ISO-8601 timestamp';
  return null;
}

// ─── Display helpers (pure) ─────────────────────────────────────────────────

/**
 * Truncate a markdown body to a short preview suitable for cards /
 * timelines. Strips code fences and heading markers conservatively
 * without rendering — react-markdown handles the full render server-side.
 *
 * Limit defaults to 240 chars (≈ 4 lines of typical lab prose).
 */
export function bodyMdPreview(body: string, max = 240): string {
  if (!body) return '';
  // Drop code-fence delimiters and heading hashes so the preview reads
  // like prose. We leave inline emphasis (*, _) alone — the eye filters
  // those out faster than a regex would.
  const stripped = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped.length <= max) return stripped;
  // Word-aware truncation so we don't lop a syllable.
  const slice = stripped.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim() + '…';
}

/**
 * Order a list of entries by `entry_at` descending (most recent first).
 * Exported for tests + non-DB code paths. The DB-side timeline already
 * orders by index — this is for in-memory mutation flows (e.g. optimistic
 * create on the client).
 */
export function sortEntriesByEntryAt(entries: NotebookEntry[]): NotebookEntry[] {
  return [...entries].sort((a, b) =>
    a.entryAt < b.entryAt ? 1 : a.entryAt > b.entryAt ? -1 : 0,
  );
}

/**
 * Normalize a tag input list — lower-case, trim, drop empties,
 * deduplicate. Mirrors the helper Maker uses on its project tags.
 */
export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const cleaned = raw.trim().toLowerCase();
    if (!cleaned) continue;
    if (cleaned.length > 60) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

/**
 * Sanitize an attached-urls list — drop non-strings, drop invalid URLs,
 * cap to 50 entries.
 */
export function normalizeAttachedUrls(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (validateAttachedUrl(trimmed) != null) continue;
    out.push(trimmed);
    if (out.length >= 50) break;
  }
  return out;
}

// ─── Re-exports for ergonomics ──────────────────────────────────────────────

export { ENTRY_KINDS, asEntryKind, type EntryKind } from './entry-kinds';

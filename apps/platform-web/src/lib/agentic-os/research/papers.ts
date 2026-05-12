/**
 * Research OS Phase 4 — paper domain types + pure helpers.
 *
 * Papers are workshop-global. Defines the row shape, the create/update
 * input surfaces, the list-filter helper, and a small set of pure
 * validators / normalizers for tags + URLs. DB calls live in
 * `papers-repo.ts`.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import { PAPER_KINDS, asPaperKind, type PaperKind } from './paper-kinds';

// ─── Row shape ───────────────────────────────────────────────────────────────

export interface Paper {
  id: string;
  userId: string;
  title: string;
  kind: PaperKind;
  doi: string | null;
  arxivId: string | null;
  url: string | null;
  authorsText: string | null;
  venue: string | null;
  year: number | null;
  abstractMd: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Create / update inputs ─────────────────────────────────────────────────

export interface CreatePaperInput {
  title: string;
  /** Defaults to `paper` when omitted. */
  kind?: PaperKind;
  doi?: string | null;
  arxivId?: string | null;
  url?: string | null;
  authorsText?: string | null;
  venue?: string | null;
  year?: number | null;
  abstractMd?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Update input. `id`, `user_id`, `created_at`, `updated_at`, and
 * `archived_at` are NOT here — those are non-patchable per spec
 * (archived flows through the archive/restore helpers).
 */
export type UpdatePaperInput = Partial<{
  title: string;
  kind: PaperKind;
  doi: string | null;
  arxivId: string | null;
  url: string | null;
  authorsText: string | null;
  venue: string | null;
  year: number | null;
  abstractMd: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
}>;

// ─── Filter helpers ─────────────────────────────────────────────────────────

export interface PapersListOpts {
  /** Include archived rows in the result. Default false. */
  archived?: boolean;
  /** Filter by kind. */
  kind?: PaperKind;
  /** Filter by single tag (ANY match, case-insensitive). */
  tag?: string;
  /** Filter by exact year. */
  year?: number;
  /**
   * Free-text search across title + authors_text. Case-insensitive,
   * matches anywhere in either column via ILIKE.
   */
  q?: string;
  /** Max rows; clamped to [1, 500] by the repo. */
  limit?: number;
  offset?: number;
}

/**
 * Predicate used by tests + non-DB filters: does `paper` match the
 * supplied opts? Mirrors the SQL filter logic in the repo.
 */
export function paperMatchesFilter(
  paper: Pick<Paper, 'kind' | 'tags' | 'year' | 'archivedAt' | 'title' | 'authorsText'>,
  opts: PapersListOpts,
): boolean {
  if (opts.archived === true) {
    if (paper.archivedAt == null) return false;
  } else if (opts.archived === false || opts.archived === undefined) {
    if (paper.archivedAt != null) return false;
  }

  if (opts.kind && paper.kind !== opts.kind) return false;

  if (opts.tag && opts.tag.trim()) {
    const needle = opts.tag.trim().toLowerCase();
    if (!paper.tags.some((t) => t.toLowerCase() === needle)) return false;
  }

  if (opts.year != null) {
    if (paper.year !== opts.year) return false;
  }

  if (opts.q && opts.q.trim()) {
    const needle = opts.q.trim().toLowerCase();
    const hay = `${paper.title} ${paper.authorsText ?? ''}`.toLowerCase();
    if (!hay.includes(needle)) return false;
  }

  return true;
}

// ─── Validators ─────────────────────────────────────────────────────────────

const URL_PATTERN = /^https?:\/\/[^\s]+$/i;
const DOI_PATTERN = /^10\.[0-9]{4,9}\/[-._;()/:A-Z0-9]+$/i;
const ARXIV_PATTERN = /^(?:arXiv:)?[0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?$/i;

export function validatePaperTitle(value: unknown): string | null {
  if (typeof value !== 'string') return 'must be a string';
  if (value.trim().length === 0) return 'cannot be empty';
  if (value.length > 500) return 'too long (max 500 chars)';
  return null;
}

export function validateDoi(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return 'must be a string';
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (!DOI_PATTERN.test(trimmed)) return 'must look like a DOI (10.xxxx/yyy)';
  return null;
}

export function validateArxivId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return 'must be a string';
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (!ARXIV_PATTERN.test(trimmed)) return 'must look like an arXiv ID (NNNN.NNNNN)';
  return null;
}

export function validatePaperUrl(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return 'must be a string';
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 4000) return 'too long (max 4000 chars)';
  if (!URL_PATTERN.test(trimmed)) return 'must be a valid http(s) URL';
  return null;
}

export function validatePaperYear(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'must be a number';
  if (!Number.isInteger(value)) return 'must be an integer';
  if (value < 1500 || value > 2200) return 'out of plausible range';
  return null;
}

// ─── Display helpers ────────────────────────────────────────────────────────

/**
 * Normalize a tag list — trim, lower-case, drop empties, dedupe, cap
 * length. Mirrors the helper used elsewhere in Research / Maker.
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
 * Short preview of `abstract_md`, suitable for cards. Strips code
 * fences + heading markers without rendering. Default cap 240 chars.
 */
export function abstractMdPreview(abstract: string | null | undefined, max = 240): string {
  if (!abstract) return '';
  const stripped = abstract
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped.length <= max) return stripped;
  const slice = stripped.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim() + '…';
}

/**
 * Build a short citation line: "Author, Author 2 (year) Title — venue".
 * Used by paper cards when no structured authors are joined.
 */
export function buildCitationLine(p: Pick<Paper, 'authorsText' | 'year' | 'title' | 'venue'>): string {
  const parts: string[] = [];
  if (p.authorsText && p.authorsText.trim()) {
    parts.push(p.authorsText.trim());
  }
  if (p.year != null) parts.push(`(${p.year})`);
  if (p.title) parts.push(p.title);
  if (p.venue && p.venue.trim()) parts.push(`— ${p.venue.trim()}`);
  return parts.join(' ');
}

// ─── Re-exports for ergonomics ──────────────────────────────────────────────

export { PAPER_KINDS, asPaperKind, type PaperKind } from './paper-kinds';

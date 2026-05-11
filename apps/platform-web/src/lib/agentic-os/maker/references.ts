/**
 * Maker OS — Reference library domain types and pure helpers.
 *
 * A reference is a generic library entry — papers, tutorials, standards,
 * articles, talks, books, and bare links. References are workshop-global
 * (per-user), and link to projects via the `agos_maker_project_references`
 * join table.
 *
 * No database calls here — those live in `repo.ts`.
 *
 * @license MIT — Tiresias Maker OS Phase 5 (internal).
 */

// ─── Kind taxonomy ────────────────────────────────────────────────────────

export const REFERENCE_KIND_VALUES = [
  'paper',
  'tutorial',
  'standard',
  'article',
  'video',
  'book',
  'link',
  'other',
] as const;

export type ReferenceKind = (typeof REFERENCE_KIND_VALUES)[number];

export const REFERENCE_KIND_LABELS: Record<ReferenceKind, string> = {
  paper: 'Paper',
  tutorial: 'Tutorial',
  standard: 'Standard',
  article: 'Article',
  video: 'Video',
  book: 'Book',
  link: 'Link',
  other: 'Other',
};

export interface ReferenceKindInfo {
  value: ReferenceKind;
  label: string;
  /** Lucide icon name — UI imports the icon by string lookup. */
  icon: string;
}

export const REFERENCE_KINDS: ReferenceKindInfo[] = [
  { value: 'paper',    label: 'Paper',    icon: 'FileText' },
  { value: 'tutorial', label: 'Tutorial', icon: 'GraduationCap' },
  { value: 'standard', label: 'Standard', icon: 'BookOpen' },
  { value: 'article',  label: 'Article',  icon: 'Newspaper' },
  { value: 'video',    label: 'Video',    icon: 'Video' },
  { value: 'book',     label: 'Book',     icon: 'Book' },
  { value: 'link',     label: 'Link',     icon: 'Link' },
  { value: 'other',    label: 'Other',    icon: 'Bookmark' },
];

// ─── Entity ───────────────────────────────────────────────────────────────

export interface Reference {
  id: string;
  userId: string;
  title: string;
  kind: ReferenceKind;
  url: string;
  authors: string | null;
  publisher: string | null;
  /** YYYY-MM-DD calendar date or null. */
  publishedAt: string | null;
  notes: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ReferenceUpsert {
  title: string;
  kind?: ReferenceKind;
  url: string;
  authors?: string | null;
  publisher?: string | null;
  publishedAt?: string | null;
  notes?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export type ReferencePatch = Partial<ReferenceUpsert>;

// ─── Project↔reference join entity ────────────────────────────────────────

export interface ProjectReferenceLink {
  id: string;
  projectId: string;
  referenceId: string;
  notes: string | null;
  createdAt: string;
}

export interface ProjectReferenceLinkUpsert {
  referenceId: string;
  notes?: string | null;
}

export interface ProjectReferenceLinkPatch {
  notes?: string | null;
}

/**
 * Joined view returned by GET /projects/[id]/references — carries enough of
 * the reference row to render without a second fetch.
 */
export interface ProjectReferenceJoined extends ProjectReferenceLink {
  referenceTitle: string;
  referenceKind: ReferenceKind;
  referenceUrl: string;
  referenceAuthors: string | null;
  referencePublisher: string | null;
  referencePublishedAt: string | null;
  referenceTags: string[];
}

// ─── Validators ───────────────────────────────────────────────────────────

export function validateReferenceKind(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !(REFERENCE_KIND_VALUES as readonly string[]).includes(value)
  ) {
    return `kind must be one of: ${REFERENCE_KIND_VALUES.join(', ')}.`;
  }
  return null;
}

export function validateReferenceTitle(value: unknown): string | null {
  if (typeof value !== 'string') return 'title must be a string.';
  const trimmed = value.trim();
  if (!trimmed) return 'title is required.';
  if (trimmed.length > 300) return 'title must be at most 300 characters.';
  return null;
}

export function validateReferenceUrl(value: unknown): string | null {
  if (typeof value !== 'string') return 'url must be a string.';
  const trimmed = value.trim();
  if (!trimmed) return 'url is required.';
  if (trimmed.length > 2000) return 'url must be at most 2000 characters.';
  return null;
}

/**
 * Validate publishedAt — must be either null or a YYYY-MM-DD calendar date.
 * Returns an error string or null.
 */
export function validatePublishedAt(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') {
    return 'publishedAt must be a YYYY-MM-DD string or null.';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return 'publishedAt must match YYYY-MM-DD.';
  }
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed)) {
    return 'publishedAt is not a real calendar date.';
  }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Aggregate counts of references by kind. Used by the references list header. */
export interface ReferenceStats {
  total: number;
  byKind: Record<ReferenceKind, number>;
}

export function summarizeReferences(refs: Reference[]): ReferenceStats {
  const byKind = Object.fromEntries(
    REFERENCE_KIND_VALUES.map((k) => [k, 0]),
  ) as Record<ReferenceKind, number>;
  for (const r of refs) {
    byKind[r.kind] += 1;
  }
  return { total: refs.length, byKind };
}

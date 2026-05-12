/**
 * Research OS Phase 4 — author domain types + pure helpers.
 *
 * Authors are workshop-global. Defines the row shape, the
 * create/update inputs, and small pure validators. DB calls live in
 * `authors-repo.ts`.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

export interface Author {
  id: string;
  userId: string;
  displayName: string;
  givenName: string | null;
  familyName: string | null;
  orcid: string | null;
  affiliation: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAuthorInput {
  displayName: string;
  givenName?: string | null;
  familyName?: string | null;
  orcid?: string | null;
  affiliation?: string | null;
  metadata?: Record<string, unknown>;
}

export type UpdateAuthorInput = Partial<{
  displayName: string;
  givenName: string | null;
  familyName: string | null;
  orcid: string | null;
  affiliation: string | null;
  metadata: Record<string, unknown>;
}>;

export interface AuthorsListOpts {
  /** Filter by family_name prefix (case-insensitive). */
  familyNamePrefix?: string;
  /** Free-text search across display_name (case-insensitive). */
  q?: string;
  limit?: number;
  offset?: number;
}

// ─── Validators ─────────────────────────────────────────────────────────────

const ORCID_PATTERN = /^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$/;

export function validateDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return 'must be a string';
  if (value.trim().length === 0) return 'cannot be empty';
  if (value.length > 300) return 'too long (max 300 chars)';
  return null;
}

export function validateOrcid(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return 'must be a string';
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (!ORCID_PATTERN.test(trimmed)) return 'must be a valid ORCID (0000-0000-0000-0000)';
  return null;
}

/**
 * Build a one-character family-name index bucket. Mirrors the
 * authors-list alphabet rail (A, B, ..., Z, #). Empty family name maps
 * to '#'.
 */
export function familyNameBucket(family: string | null | undefined): string {
  if (!family) return '#';
  const ch = family.trim()[0]?.toUpperCase() ?? '#';
  if (ch >= 'A' && ch <= 'Z') return ch;
  return '#';
}

/**
 * Business OS Phase 1 — organization domain types + pure helpers.
 *
 * DB calls live in `orgs-repo.ts`.  This module is for row shapes,
 * input surfaces, and pure filter helpers that tests can exercise
 * without a database.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import { ORG_TYPES, normalizeTags, type OrgType, type Organization } from './crm';

// ─── Create / update inputs ─────────────────────────────────────────────────

export interface CreateOrgInput {
  name: string;
  orgType?: OrgType;
  website?: string | null;
  industry?: string | null;
  notes?: string | null;
  descriptionMd?: string;
  address?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export type UpdateOrgInput = Partial<{
  name: string;
  orgType: OrgType;
  website: string | null;
  industry: string | null;
  notes: string | null;
  descriptionMd: string;
  address: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
}>;

// ─── Filter ──────────────────────────────────────────────────────────────

export interface OrgsListOpts {
  /** Include archived rows. Default: false. */
  archived?: boolean;
  /** Single-tag match (case-insensitive ANY). */
  tag?: string;
  /** Industry exact match (case-insensitive). */
  industry?: string;
  /** Filter by org type. */
  orgType?: OrgType;
  /** Free-text search across name + industry + notes (ILIKE). */
  q?: string;
  limit?: number;
  offset?: number;
}

/**
 * Predicate used by tests + non-DB filters: does `org` match the supplied
 * opts? Mirrors the SQL filter logic in the repo.
 */
export function orgMatchesFilter(
  org: Pick<
    Organization,
    'orgType' | 'industry' | 'tags' | 'archivedAt' | 'name' | 'notes'
  >,
  opts: OrgsListOpts,
): boolean {
  if (opts.archived === true) {
    if (org.archivedAt == null) return false;
  } else {
    if (org.archivedAt != null) return false;
  }

  if (opts.orgType && org.orgType !== opts.orgType) return false;

  if (opts.industry && opts.industry.trim()) {
    const needle = opts.industry.trim().toLowerCase();
    if ((org.industry ?? '').toLowerCase() !== needle) return false;
  }

  if (opts.tag && opts.tag.trim()) {
    const needle = opts.tag.trim().toLowerCase();
    if (!org.tags.some((t) => t.toLowerCase() === needle)) return false;
  }

  if (opts.q && opts.q.trim()) {
    const needle = opts.q.trim().toLowerCase();
    const hay = `${org.name} ${org.industry ?? ''} ${org.notes ?? ''}`.toLowerCase();
    if (!hay.includes(needle)) return false;
  }

  return true;
}

// ─── Validators ──────────────────────────────────────────────────────────

export function validateOrgName(value: unknown): string | null {
  if (typeof value !== 'string') return 'must be a string';
  if (value.trim().length === 0) return 'cannot be empty';
  if (value.length > 200) return 'too long (max 200 chars)';
  return null;
}

export function validateOrgType(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return 'must be a string';
  if (!(ORG_TYPES as readonly string[]).includes(value)) {
    return `must be one of: ${ORG_TYPES.join(', ')}`;
  }
  return null;
}

export function validateOrgWebsite(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return 'must be a string';
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 4000) return 'too long (max 4000 chars)';
  if (!/^https?:\/\/[^\s]+$/i.test(trimmed)) {
    return 'must be a valid http(s) URL';
  }
  return null;
}

// ─── Re-exports for ergonomics ───────────────────────────────────────────
export { ORG_TYPES, normalizeTags, type OrgType, type Organization };

/**
 * Business OS Phase 1 — person domain types + pure helpers.
 *
 * DB calls live in `people-repo.ts`.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import { normalizeTags, type Person } from './crm';

// ─── Create / update inputs ─────────────────────────────────────────────────

export interface CreatePersonInput {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  organizationId?: string | null;
  stage?: string;
  tags?: string[];
  notes?: string | null;
  descriptionMd?: string;
  address?: string | null;
  metadata?: Record<string, unknown>;
}

export type UpdatePersonInput = Partial<{
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  organizationId: string | null;
  stage: string;
  tags: string[];
  notes: string | null;
  descriptionMd: string;
  address: string | null;
  metadata: Record<string, unknown>;
}>;

// ─── Filter ──────────────────────────────────────────────────────────────

export interface PeopleListOpts {
  /** Include archived rows. Default: false. */
  archived?: boolean;
  /** Single-tag match (case-insensitive). */
  tag?: string;
  /** Scope to one organization. */
  organizationId?: string;
  /** Free-text search across first_name + last_name + email + role + notes (ILIKE). */
  q?: string;
  limit?: number;
  offset?: number;
}

export function personMatchesFilter(
  person: Pick<
    Person,
    'tags' | 'archivedAt' | 'organizationId' | 'firstName' | 'lastName' | 'email' | 'role' | 'notes'
  >,
  opts: PeopleListOpts,
): boolean {
  if (opts.archived === true) {
    if (person.archivedAt == null) return false;
  } else {
    if (person.archivedAt != null) return false;
  }

  if (opts.organizationId && person.organizationId !== opts.organizationId) return false;

  if (opts.tag && opts.tag.trim()) {
    const needle = opts.tag.trim().toLowerCase();
    if (!person.tags.some((t) => t.toLowerCase() === needle)) return false;
  }

  if (opts.q && opts.q.trim()) {
    const needle = opts.q.trim().toLowerCase();
    const hay = `${person.firstName} ${person.lastName} ${person.email ?? ''} ${person.role ?? ''} ${
      person.notes ?? ''
    }`.toLowerCase();
    if (!hay.includes(needle)) return false;
  }

  return true;
}

// ─── Validators ──────────────────────────────────────────────────────────

export function validatePersonName(value: unknown): string | null {
  if (typeof value !== 'string') return 'must be a string';
  if (value.trim().length === 0) return 'cannot be empty';
  if (value.length > 100) return 'too long (max 100 chars)';
  return null;
}

export function validatePersonEmail(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return 'must be a string';
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 320) return 'too long (max 320 chars)';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return 'must be a valid email address';
  }
  return null;
}

export function validatePersonPhone(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return 'must be a string';
  if (value.length > 30) return 'too long (max 30 chars)';
  return null;
}

// ─── Re-exports for ergonomics ───────────────────────────────────────────
export { normalizeTags, type Person };

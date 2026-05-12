/**
 * Autobiographer OS — Memory-people join domain types and pure helpers.
 *
 * The N:M relationship between memories and people, with an optional
 * free-form `role` describing how the person appears in the memory.
 *
 * Role taxonomy
 * -------------
 * Roles are intentionally free-form text — a memory may name someone as
 * "protagonist", "witness", "antagonist", "mentioned", "co-narrator", etc.
 * Phase 5 thematic analysis may bucket these into a smaller controlled
 * vocabulary, but the schema does not enforce one in Phase 2.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

// ─── Common roles (suggested, not enforced) ──────────────────────────────────

/** Suggestions surfaced in the UI picker; not a CHECK constraint. */
export const COMMON_MEMORY_PERSON_ROLES = [
  'protagonist',
  'witness',
  'antagonist',
  'mentioned',
  'co-narrator',
  'bystander',
] as const;

export type CommonMemoryPersonRole = (typeof COMMON_MEMORY_PERSON_ROLES)[number];

// ─── Validators ──────────────────────────────────────────────────────────────

export function validateRole(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return 'Role must be a string.';
  if (value.length > 100) return 'Role must be 100 characters or fewer.';
  return null;
}

export function validateLinkNotes(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return 'Notes must be a string.';
  if (value.length > 5000) return 'Notes must be 5000 characters or fewer.';
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normalize a free-form role: trim, lowercase, drop empty. */
export function normalizeRole(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

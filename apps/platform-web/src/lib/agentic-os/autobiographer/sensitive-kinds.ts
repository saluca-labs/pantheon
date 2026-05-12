/**
 * Autobiographer OS — Sensitive-kind taxonomy.
 *
 * Phase 6 introduces a ``sensitive_kinds TEXT[]`` column on memories
 * and on chapter revisions. The canonical set is locked here, validated
 * app-side, and reused across routes / repos / UI. Postgres CHECK on
 * array contents is intentionally omitted — see the migration docstring.
 *
 * Categories (taxonomy)
 * ---------------------
 * ``sexual``        — explicit sexual content / disclosure.
 * ``abuse``         — abuse / violence / coercion accounts.
 * ``mental_health`` — mental-health disclosures (suicide, self-harm,
 *                     diagnoses, treatment).
 * ``legal``         — pending / past legal matters; criminal history.
 * ``financial``     — financial detail (debt, income, settlements).
 * ``death``         — death of a named person; circumstances of death.
 * ``medical``       — medical detail beyond mental-health; diagnoses,
 *                     procedures.
 * ``other``         — escape hatch when no category fits but the user
 *                     wants to flag.
 *
 * The Phase 7 chapter_drafter coach reads this set verbatim; do not
 * rename existing entries without a coordinated migration of stored
 * rows.
 *
 * @license MIT — original work for Tiresias platform
 */

export const SENSITIVE_KINDS = [
  'sexual',
  'abuse',
  'mental_health',
  'legal',
  'financial',
  'death',
  'medical',
  'other',
] as const;

export type SensitiveKind = (typeof SENSITIVE_KINDS)[number];

/** Human-facing label per kind (UI chips / picker / privacy hub). */
export const SENSITIVE_KIND_LABELS: Record<SensitiveKind, string> = {
  sexual: 'Sexual',
  abuse: 'Abuse',
  mental_health: 'Mental health',
  legal: 'Legal',
  financial: 'Financial',
  death: 'Death',
  medical: 'Medical',
  other: 'Other',
};

/** One-sentence helper text per kind, surfaced in tooltips + form copy. */
export const SENSITIVE_KIND_DESCRIPTIONS: Record<SensitiveKind, string> = {
  sexual: 'Explicit sexual content or disclosure.',
  abuse: 'Abuse, violence, or coercion accounts.',
  mental_health: 'Mental-health disclosures, diagnoses, or self-harm.',
  legal: 'Pending or historical legal matters; criminal history.',
  financial: 'Financial detail (debt, income, settlements).',
  death: 'Death of a named person; circumstances of death.',
  medical: 'Medical detail beyond mental-health.',
  other: 'Other sensitive content not covered above.',
};

/** Tailwind accent token per kind (chips render against this palette). */
export const SENSITIVE_KIND_ACCENTS: Record<SensitiveKind, string> = {
  sexual: 'rose',
  abuse: 'red',
  mental_health: 'violet',
  legal: 'amber',
  financial: 'emerald',
  death: 'slate',
  medical: 'sky',
  other: 'zinc',
};

/**
 * Validate a single sensitive-kind candidate. Returns the kind on
 * success, null on failure. Used by repos + route Zod schemas.
 */
export function asSensitiveKind(value: unknown): SensitiveKind | null {
  if (typeof value !== 'string') return null;
  return (SENSITIVE_KINDS as readonly string[]).includes(value)
    ? (value as SensitiveKind)
    : null;
}

/**
 * Normalize an unknown array into a deduped sorted list of
 * sensitive-kind tags. Drops invalid entries silently — the route
 * layer rejects unknown values with a 400 BEFORE this is called, so
 * this is a defensive no-op when the input has already been validated.
 *
 * The sort is alphabetical on the canonical token so storage order is
 * deterministic and the UI chip order is stable across reads.
 */
export function normalizeSensitiveKinds(
  input: unknown,
): SensitiveKind[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<SensitiveKind>();
  for (const raw of input) {
    const kind = asSensitiveKind(raw);
    if (kind) seen.add(kind);
  }
  return Array.from(seen).sort();
}

/**
 * Strict variant: throws on any unknown value. Used by repos at the
 * write boundary; the route Zod schemas validate beforehand, but this
 * is a belt-and-braces guard.
 */
export function validateSensitiveKindsStrict(
  input: unknown,
): SensitiveKind[] {
  if (!Array.isArray(input)) {
    throw new Error('sensitive_kinds must be an array');
  }
  const out: SensitiveKind[] = [];
  for (const raw of input) {
    const kind = asSensitiveKind(raw);
    if (!kind) {
      throw new Error(
        `Invalid sensitive_kind: ${JSON.stringify(raw)}. Allowed: ${SENSITIVE_KINDS.join(', ')}.`,
      );
    }
    out.push(kind);
  }
  // Dedupe + sort for storage stability.
  return Array.from(new Set(out)).sort();
}

/** True if the input set contains at least one sensitive kind. */
export function hasAnySensitiveKind(
  input: readonly (string | SensitiveKind)[] | null | undefined,
): boolean {
  if (!input || input.length === 0) return false;
  for (const raw of input) {
    if (asSensitiveKind(raw)) return true;
  }
  return false;
}

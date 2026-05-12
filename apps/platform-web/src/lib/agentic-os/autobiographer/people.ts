/**
 * Autobiographer OS — Person domain types and pure helpers.
 *
 * A `Person` is a workshop-global entity — the same person (mom, mentor,
 * ex-colleague) can appear across multiple books in a family-history
 * workflow, so we key by `(user_id, lower(canonical_name))` rather than
 * per-book. Phase 6 redaction reads `aliases` + `consent_to_publish` to
 * gate publication. Phase 5 thematic analysis may key off the join's
 * `role` field.
 *
 * Consent taxonomy
 * ----------------
 * Six values cover the publication-consent lifecycle:
 *
 *   - `granted`         — explicit opt-in on file
 *   - `pending`         — default; capture is allowed, publication is gated
 *   - `withheld`        — explicit refusal; Phase 6 will hard-block publication
 *   - `deceased`        — person is deceased; downstream consent skips them
 *   - `public_figure`   — public-figure carve-out; commentary protected
 *   - `not_applicable`  — entity isn't a real person (pet, place rename)
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

// ─── Consent taxonomy ────────────────────────────────────────────────────────

export const CONSENT_STATES = [
  'granted',
  'pending',
  'withheld',
  'deceased',
  'public_figure',
  'not_applicable',
] as const;

export type ConsentState = (typeof CONSENT_STATES)[number];

export const CONSENT_LABELS: Record<ConsentState, string> = {
  granted: 'Granted',
  pending: 'Pending',
  withheld: 'Withheld',
  deceased: 'Deceased',
  public_figure: 'Public figure',
  not_applicable: 'N/A',
};

/** Consent states that PASS the Phase 6 publication gate. */
export const CONSENT_PUBLISHABLE: ReadonlyArray<ConsentState> = [
  'granted',
  'deceased',
  'public_figure',
  'not_applicable',
];

/** Consent states that BLOCK publication (Phase 6 hard-stop). */
export const CONSENT_BLOCKING: ReadonlyArray<ConsentState> = [
  'pending',
  'withheld',
];

/** True iff a memory drawing on this person can be published per Phase 6. */
export function consentIsPublishable(state: unknown): boolean {
  return (
    typeof state === 'string' &&
    (CONSENT_PUBLISHABLE as readonly string[]).includes(state)
  );
}

// ─── Validators ──────────────────────────────────────────────────────────────

export function validateConsentState(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !(CONSENT_STATES as readonly string[]).includes(value)
  ) {
    return `consent_to_publish must be one of: ${CONSENT_STATES.join(', ')}.`;
  }
  return null;
}

export function validateCanonicalName(value: unknown): string | null {
  if (typeof value !== 'string') return 'Canonical name is required.';
  if (value.trim().length === 0) return 'Canonical name is required.';
  if (value.length > 500) {
    return 'Canonical name must be 500 characters or fewer.';
  }
  return null;
}

/** Birth/death year sanity — null is always allowed. */
export function validateYear(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Year must be an integer.';
  }
  if (!Number.isInteger(value)) return 'Year must be an integer.';
  if (value < 1 || value > 9999) return 'Year must be between 1 and 9999.';
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalize an alias list — trims, drops empty entries, dedupes
 * case-insensitively. Mirrors `normalizeMemoryTags` so Phase 6 redaction
 * can rely on a clean array shape.
 */
export function normalizeAliases(aliases: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of aliases) {
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

/** Lower-case the canonical name for uniqueness comparison. */
export function canonicalNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Autobiographer OS — Voice profile domain types and pure helpers.
 *
 * A voice profile is the **structured JSON spine** the Phase 7
 * chapter_drafter splices into its system prompt. Profiles are
 * versioned per user (immutable history) and at most one is `is_active
 * = true` at any time (enforced by a partial UNIQUE index on the
 * migration). The builder ships in `voice/builder.ts` and writes a new
 * profile each run with `version = max(existing) + 1`.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

// ─── Limits ──────────────────────────────────────────────────────────────────

export const STYLE_SUMMARY_MIN = 20;
export const STYLE_SUMMARY_MAX = 4000;
export const STYLE_ADJECTIVE_MAX = 40;
export const STYLE_RULES_MAX = 40;
export const STYLE_RULE_LENGTH_MAX = 240;
export const EXAMPLE_OPENINGS_MAX = 10;
export const EXAMPLE_OPENING_LENGTH_MAX = 600;

/** Minimum number of non-archived samples the builder needs to run. */
export const VOICE_PROFILE_MIN_SAMPLES = 1;

// ─── Validators ──────────────────────────────────────────────────────────────

export function validateStyleSummary(value: unknown): string | null {
  if (typeof value !== 'string') return 'style_summary is required.';
  if (value.trim().length < STYLE_SUMMARY_MIN) {
    return `style_summary must be at least ${STYLE_SUMMARY_MIN} characters.`;
  }
  if (value.length > STYLE_SUMMARY_MAX) {
    return `style_summary must be ${STYLE_SUMMARY_MAX} characters or fewer.`;
  }
  return null;
}

// ─── Normalizers ─────────────────────────────────────────────────────────────

/**
 * Dedupe a list of style adjectives case-insensitively, trim each entry,
 * drop empties, cap to STYLE_ADJECTIVE_MAX entries. The builder's
 * stage-2 aggregator emits a union over per-sample adjectives so this
 * helper sees the same shape from both manual edits and builder output.
 */
export function normalizeStyleAdjectives(
  adjectives: readonly unknown[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of adjectives) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= STYLE_ADJECTIVE_MAX) break;
  }
  return out;
}

/**
 * Coerce the JSONB-stored `style_rules` value into the array-of-strings
 * shape the UI expects. Drops non-string entries, trims, and caps to
 * STYLE_RULES_MAX. Truncates over-long rules at STYLE_RULE_LENGTH_MAX.
 */
export function normalizeStyleRules(rules: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const raw of rules) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    out.push(
      trimmed.length > STYLE_RULE_LENGTH_MAX
        ? trimmed.slice(0, STYLE_RULE_LENGTH_MAX - 1) + '…'
        : trimmed,
    );
    if (out.length >= STYLE_RULES_MAX) break;
  }
  return out;
}

/**
 * Same shape as `normalizeStyleRules` but applied to the
 * `example_openings` list. Cap at EXAMPLE_OPENINGS_MAX and trim each
 * opening to EXAMPLE_OPENING_LENGTH_MAX so a profile JSON blob stays
 * within sensible bounds for the Phase 7 system prompt.
 */
export function normalizeExampleOpenings(
  openings: readonly unknown[],
): string[] {
  const out: string[] = [];
  for (const raw of openings) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    out.push(
      trimmed.length > EXAMPLE_OPENING_LENGTH_MAX
        ? trimmed.slice(0, EXAMPLE_OPENING_LENGTH_MAX - 1) + '…'
        : trimmed,
    );
    if (out.length >= EXAMPLE_OPENINGS_MAX) break;
  }
  return out;
}

/** Coerce JSONB-stored arrays back from the pg driver's `unknown`. */
export function coerceJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

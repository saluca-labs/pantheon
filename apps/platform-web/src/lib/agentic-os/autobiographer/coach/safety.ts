/**
 * Autobiographer coach — safety helpers.
 *
 * Pure functions used by the system-prompt builder + the messages route
 * to decide:
 *
 *   1. Whether to append a sensitive-content footer to the assistant's
 *      response (any of the 8 sensitive_kind tags triggers a footer).
 *   2. Whether to additionally recommend a licensed professional
 *      reader — limited to sexual / abuse / mental_health categories,
 *      per the Phase 7 locked decision. Death / medical / legal /
 *      financial get the generic footer but no professional-reader nudge.
 *
 * The 4 locked sensitive-kinds that trigger the professional-reader
 * recommendation are TRAUMA-FACING categories where a third reader is
 * a known good practice for memoir authors. The other 4 carry generic
 * "review with a trusted reader" copy.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

import {
  SENSITIVE_KINDS,
  asSensitiveKind,
  type SensitiveKind,
} from '../sensitive-kinds';

/**
 * Sensitive kinds that warrant the licensed-professional-reader
 * recommendation (Phase 7 locked decision §5).
 *
 *   sexual         — explicit sexual disclosure
 *   abuse          — abuse / violence / coercion
 *   mental_health  — suicidality, self-harm, diagnoses, treatment
 *
 * Other categories (legal / financial / death / medical / other) get
 * a generic sensitive-content footer but not the professional-reader
 * nudge.
 */
export const PROFESSIONAL_READER_KINDS: readonly SensitiveKind[] = [
  'sexual',
  'abuse',
  'mental_health',
];

/**
 * Collapse an arbitrary list of sources (memory rows, revision rows)
 * into the union set of sensitive kinds present. Drops invalid values
 * silently — the column write boundary validates strictly so this is
 * a safe defensive layer.
 */
export function unionSensitiveKinds(
  sources: ReadonlyArray<{
    sensitive_kinds?: readonly unknown[] | null;
    sensitiveKinds?: readonly unknown[] | null;
  }>,
): SensitiveKind[] {
  const seen = new Set<SensitiveKind>();
  for (const source of sources) {
    const raw = source.sensitive_kinds ?? source.sensitiveKinds ?? null;
    if (!Array.isArray(raw)) continue;
    for (const candidate of raw) {
      const k = asSensitiveKind(candidate);
      if (k) seen.add(k);
    }
  }
  return Array.from(seen).sort();
}

/** True when the input set carries at least one valid sensitive kind. */
export function shouldAppendSensitiveFooter(
  kinds: ReadonlyArray<unknown>,
): boolean {
  if (!Array.isArray(kinds) || kinds.length === 0) return false;
  for (const k of kinds) {
    if (asSensitiveKind(k)) return true;
  }
  return false;
}

/**
 * True when ANY of the supplied kinds is in the professional-reader
 * subset. Used by the system-prompt builder to escalate the footer
 * copy from "review with a trusted reader" to "review with a licensed
 * professional".
 */
export function shouldRecommendProfessionalReader(
  kinds: ReadonlyArray<unknown>,
): boolean {
  if (!Array.isArray(kinds) || kinds.length === 0) return false;
  for (const k of kinds) {
    const valid = asSensitiveKind(k);
    if (valid && (PROFESSIONAL_READER_KINDS as readonly SensitiveKind[]).includes(valid)) {
      return true;
    }
  }
  return false;
}

/**
 * Render the appropriate footer copy for an assistant response based on
 * the active sensitive-kind set. Returns null when no footer is needed.
 *
 *   - Empty / non-sensitive: null (no footer)
 *   - Trauma-facing (sexual / abuse / mental_health): professional-reader copy
 *   - Other sensitive (legal / financial / death / medical / other):
 *     generic trusted-reader copy
 */
export function buildSensitiveFooter(
  kinds: ReadonlyArray<unknown>,
): string | null {
  if (!shouldAppendSensitiveFooter(kinds)) return null;
  const validKinds: SensitiveKind[] = [];
  for (const k of kinds) {
    const valid = asSensitiveKind(k);
    if (valid) validKinds.push(valid);
  }
  const list = Array.from(new Set(validKinds)).sort().join(', ');
  if (shouldRecommendProfessionalReader(kinds)) {
    return [
      '---',
      `**Sensitive material:** This draft touches: ${list}. The Autobiographer coach`,
      'strongly recommends reviewing this section with a licensed professional reader',
      '(therapist, trauma-informed editor) before locking the chapter or exporting',
      'the final PDF. You are the authority over your own memoir — this is a nudge,',
      'not a refusal.',
    ].join('\n');
  }
  return [
    '---',
    `**Sensitive material:** This draft touches: ${list}. Consider reviewing this`,
    'section with a trusted reader before locking the chapter or exporting the',
    'final PDF.',
  ].join('\n');
}

/** Re-export the canonical kinds list for callers that only import safety. */
export { SENSITIVE_KINDS };

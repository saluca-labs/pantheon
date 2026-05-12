/**
 * Autobiographer OS — Pseudonym redaction algorithm.
 *
 * Substitutes person names with per-book pseudonyms in rendered prose
 * before PDF layout. The algorithm is intentionally deterministic and
 * NLP-free (Phase 6 explicitly defers entity scrubbing — see plan doc
 * §5 open question). It applies whole-token word-boundary substitution,
 * with case preservation on the first letter only.
 *
 * Spec invariants (each backed by a unit test in
 * ``__tests__/agentic-os/autobiographer/redaction.test.ts``):
 *
 *   - Whole-token match: ``\b<name>\b`` only. Substrings inside other
 *     words never substitute. e.g. person "Al" does not replace inside
 *     "always".
 *   - Case preservation on the FIRST letter only. The rest of the
 *     pseudonym is rendered verbatim from the map row.
 *       "Mom"  + map "Mom"->"Mary"  →  "Mary"
 *       "mom"  + map "Mom"->"Mary"  →  "mary"
 *       "MOM"  + map "Mom"->"Mary"  →  "Mary"   (rest from pseudonym)
 *     This intentionally simplifies the case-preservation rule. The
 *     full ALL-CAPS preservation case is left to a future refinement;
 *     the test suite locks the current rule.
 *   - Aliases substitute identically to canonical_name. The redaction
 *     input takes a person row's canonical_name + aliases array and
 *     treats every entry as a substitution source for the same target
 *     pseudonym.
 *   - Left-to-right application order. When two pseudonyms could match
 *     overlapping spans, the first pseudonym in the input array wins
 *     for the first match; the cursor then advances past the
 *     replacement and the next pseudonym substitutes its first match
 *     in the remaining suffix.
 *   - Empty pseudonym map → identity.
 *   - The function returns the new text AND the set of pseudonym ids
 *     that produced at least one substitution. The caller (PDF export
 *     route) uses the set to flip ``applied = true`` on those rows
 *     post-render.
 *
 * Performance: the algorithm compiles a single global regex per
 * pseudonym (no NFA fusion). Bodies in practice are ≤ ~50 KB, so this
 * stays comfortably under 10 ms per chapter even at a hundred-row map.
 *
 * @license MIT — original work for Tiresias platform
 */

export interface PseudonymInput {
  /** Pseudonym row id; surfaced in the applied set on substitution. */
  id: string;
  /** Canonical name from the person row. */
  canonicalName: string;
  /** Aliases from the person row. All substitute to ``pseudonym``. */
  aliases: readonly string[];
  /** Replacement string verbatim (case-preservation rule below). */
  pseudonym: string;
}

export interface RedactionResult {
  /** The substituted prose. Identical to input when no match fires. */
  text: string;
  /** Set of pseudonym ids that produced at least one substitution. */
  appliedPseudonymIds: Set<string>;
}

/**
 * Escape regex special characters in a substring so we can embed an
 * arbitrary person name in a regex without injection. Mirrors the
 * MDN-documented "escape" helper.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Apply the case-preservation rule. The rule:
 *
 *   - If the matched source starts uppercase → first letter of the
 *     pseudonym is upper, rest from pseudonym verbatim.
 *   - If the matched source starts lowercase → first letter of the
 *     pseudonym is lower, rest from pseudonym verbatim.
 *
 * The rest of the pseudonym is rendered exactly as supplied so the
 * map row can carry a multi-cased target ("MacGregor", "deLong",
 * etc.) without the algorithm forcing a case.
 */
export function caseAdjust(matched: string, pseudonym: string): string {
  if (!matched || !pseudonym) return pseudonym;
  const first = matched.charAt(0);
  const rest = pseudonym.slice(1);
  if (first === first.toLowerCase() && first !== first.toUpperCase()) {
    // matched starts lowercase
    return pseudonym.charAt(0).toLowerCase() + rest;
  }
  if (first === first.toUpperCase() && first !== first.toLowerCase()) {
    // matched starts uppercase
    return pseudonym.charAt(0).toUpperCase() + rest;
  }
  // Non-letter first character (rare; punctuation, digit) — return
  // pseudonym verbatim.
  return pseudonym;
}

/**
 * Build the source-name list for a pseudonym row: canonical_name +
 * aliases, deduped (case-insensitive), trimmed of empty entries, and
 * sorted longest-first so a multi-word alias substitutes before a
 * shorter single-word source ("Mary Jane Watson" before "Mary").
 */
function gatherSources(p: PseudonymInput): string[] {
  const seen = new Map<string, string>();
  const add = (raw: string | null | undefined) => {
    if (!raw) return;
    const trimmed = raw.trim();
    if (trimmed.length === 0) return;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  };
  add(p.canonicalName);
  for (const alias of p.aliases) add(alias);
  return Array.from(seen.values()).sort((a, b) => b.length - a.length);
}

/**
 * Build the substitution regex for a single name. Word-boundary on
 * both sides; case-insensitive so the same pattern catches "Mom" /
 * "mom" / "MOM". The case-preservation rule applies post-match.
 *
 * Multi-word names ("Mary Jane Watson") require a custom boundary on
 * each side because ``\b`` only fires at word-character transitions;
 * a leading space + the run + trailing space won't match at line
 * starts. We use a lookbehind / lookahead pair that treats a non-word
 * char OR string boundary as a valid edge.
 */
function buildRegex(name: string): RegExp {
  const escaped = escapeRegExp(name).replace(/\s+/g, '\\s+');
  // (?<![A-Za-z0-9_]) and (?![A-Za-z0-9_]) approximate \b on both sides
  // while tolerating multi-word runs. Browsers / Node 22 support
  // lookbehind so this stays portable.
  return new RegExp(
    `(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`,
    'gi',
  );
}

/**
 * Apply the pseudonym map to a text body. Returns the substituted
 * text + the set of pseudonym ids that fired.
 *
 * Pseudonyms are applied in input order. Within a single pseudonym,
 * substitutions fire at every match (global regex). Aliases are
 * coalesced into the same pseudonym's id — substituting through an
 * alias still records that pseudonym row as "applied".
 *
 * Order-locking note: substitutions for pseudonym N are computed
 * against the OUTPUT of pseudonyms 1..N-1. This is the documented
 * left-to-right rule. The test suite locks an overlapping-pseudonyms
 * case so the rule stays observable.
 */
export function applyPseudonymRedaction(
  text: string,
  pseudonyms: readonly PseudonymInput[],
): RedactionResult {
  if (!text || pseudonyms.length === 0) {
    return { text, appliedPseudonymIds: new Set<string>() };
  }
  const applied = new Set<string>();
  let cursor = text;
  for (const p of pseudonyms) {
    const sources = gatherSources(p);
    if (sources.length === 0) continue;
    if (!p.pseudonym || p.pseudonym.trim().length === 0) continue;
    for (const source of sources) {
      const rx = buildRegex(source);
      let fired = false;
      cursor = cursor.replace(rx, (match) => {
        fired = true;
        return caseAdjust(match, p.pseudonym);
      });
      if (fired) applied.add(p.id);
    }
  }
  return { text: cursor, appliedPseudonymIds: applied };
}

/**
 * Apply redaction to a memory title (used by the chapter PDF footnote
 * renderer). Identical algorithm; returns just the substituted string
 * and ignores which pseudonyms fired (the PDF render path uses one
 * shared applied-id accumulator across body + footnotes — see the
 * chapter export route's invocation).
 */
export function redactTitle(
  title: string | null | undefined,
  pseudonyms: readonly PseudonymInput[],
): string {
  if (!title) return title ?? '';
  return applyPseudonymRedaction(title, pseudonyms).text;
}

/**
 * Compose two redaction results. Used by the book-export route which
 * accumulates applied-ids across every chapter rendered in the book.
 */
export function mergeAppliedIds(
  ...sets: Array<Set<string>>
): Set<string> {
  const out = new Set<string>();
  for (const s of sets) for (const id of s) out.add(id);
  return out;
}

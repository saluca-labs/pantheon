/**
 * Cross-OS crisis-language guard.
 *
 * Every free-text input that reaches Health OS (intake free_text,
 * journal entries, coach turns, screener notes) is run through this
 * guard. The guard is non-blocking by design: it records a
 * `crisis-language` risk flag in parallel with the request so the
 * surface UI can react, but the request is never rejected.
 *
 * This file intentionally consolidates the rule-based detector that used
 * to live at `lib/agentic-os/health/crisis-detection.ts`. The Health
 * module re-exports `detectCrisisLanguage` from here for backwards
 * compatibility; new callers should import directly from `_shared/`.
 *
 * Detection is rule-based and deliberately conservative — it errs on
 * the side of surfacing crisis resources rather than missing a signal.
 * It is NOT a clinical screener and NOT a triage tool.
 *
 * @license MIT — Tiresias platform (internal).
 */

import 'server-only';
import type { RiskFlagInput, RiskFlagSeverity } from '../types';

const PATTERNS: RegExp[] = [
  // Direct suicidal ideation
  /\bkill(ing)?\s+myself\b/i,
  /\bend(ing)?\s+(my\s+life|it\s+all)\b/i,
  /\b(want|wanting|going)\s+to\s+die\b/i,
  /\b(thinking|thought)\s+about\s+(suicide|killing\s+myself)\b/i,
  /\bcommit(ting)?\s+suicide\b/i,
  /\bsuicidal\s+(thoughts|ideation)\b/i,
  /\bplan(ning)?\s+to\s+kill\s+myself\b/i,
  /\bbetter\s+off\s+dead\b/i,
  /\bdon'?t\s+want\s+to\s+(live|be\s+alive|exist)\b/i,
  /\bno\s+reason\s+to\s+live\b/i,
  // Self-harm
  /\bcut(ting)?\s+myself\b/i,
  /\bself[-\s]?harm(ing)?\b/i,
  /\bhurt(ing)?\s+myself\b/i,
];

export interface CrisisDetection {
  matched: boolean;
  severity?: RiskFlagSeverity;
  matches: string[];
  /** @deprecated Kept for callers of the legacy `health/crisis-detection.ts` shape. */
  triggered: boolean;
}

/**
 * Run rule-based crisis-language detection over `text`. Returns a
 * structured result with the list of matched substrings and a severity
 * (currently always `critical` when matched — the rules are pre-tuned
 * to be high-confidence).
 */
export function detectCrisisLanguage(
  text: string | null | undefined,
): CrisisDetection {
  if (!text) return { matched: false, triggered: false, matches: [] };
  const matches: string[] = [];
  for (const re of PATTERNS) {
    const m = text.match(re);
    if (m) matches.push(m[0]);
  }
  if (matches.length === 0) {
    return { matched: false, triggered: false, matches: [] };
  }
  return {
    matched: true,
    triggered: true,
    severity: 'critical',
    matches,
  };
}

// ─── Route wrapper ─────────────────────────────────────────────────────────

/**
 * Free-text fields the guard should inspect on a parsed request body.
 * Routes pass the parsed Zod object to `withCrisisGuard` along with the
 * field names that may contain free text. Anything else (numbers, enum
 * scopes) is left alone.
 */
export type FreeTextFieldExtractor<T> = (body: T) => Array<string | null | undefined>;

export interface WithCrisisGuardOpts<TBody> {
  /** OS slug for the audit trail (always 'health' today). */
  osSlug: string;
  /** Identifier for the call site, recorded as the flag `source`. */
  source: string;
  /** Pull the free-text strings out of the parsed request body. */
  extractText: FreeTextFieldExtractor<TBody>;
  /**
   * Persist a risk flag — typically `recordRiskFlag` from the OS repo.
   * Wrapping it lets the guard stay agnostic of how each OS persists.
   */
  persistFlag: (flag: RiskFlagInput) => Promise<void>;
}

/**
 * Wrap a BFF route handler with the crisis-language guard. The wrapper:
 *   1. Parses the request body via the supplied parser (callers pass a
 *      Zod-validated body so we don't re-parse JSON).
 *   2. Runs `detectCrisisLanguage` over every extracted free-text field.
 *   3. If any match, fires off a `recordRiskFlag` call IN PARALLEL with
 *      the inner handler — the request is never blocked. Failures inside
 *      `persistFlag` are swallowed (logged) so they cannot break the
 *      user-visible flow.
 *
 * The wrapper is generic over the body shape so callers keep their own
 * Zod schemas; the wrapper only sees the typed object.
 */
export async function withCrisisGuard<TBody, TResult>(
  body: TBody,
  opts: WithCrisisGuardOpts<TBody>,
  handler: () => Promise<TResult>,
): Promise<TResult> {
  const fields = opts.extractText(body).filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  );

  let guardPromise: Promise<void> = Promise.resolve();
  for (const text of fields) {
    const result = detectCrisisLanguage(text);
    if (result.matched) {
      const flag: RiskFlagInput = {
        kind: 'crisis-language',
        severity: result.severity ?? 'critical',
        source: opts.source,
        payload: { matches: result.matches, sample: text.slice(0, 240) },
      };
      // Fire-and-forget. The inner handler must not be delayed by guard
      // bookkeeping. Errors are logged but never thrown to the caller.
      guardPromise = guardPromise.then(() =>
        opts.persistFlag(flag).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[crisis-guard] flag persistence failed', err);
        }),
      );
    }
  }

  // Run handler and guard concurrently.
  const [result] = await Promise.all([handler(), guardPromise]);
  return result;
}

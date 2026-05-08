/**
 * Lightweight rule-based crisis-language detector for Health OS free-text
 * inputs. This is deliberately simple and conservative — it errs on the
 * side of surfacing crisis resources rather than missing a signal.
 *
 * It is NOT a clinical screener and NOT a triage tool. It is the safety
 * wall that ensures plan-generation never proceeds when the user has
 * indicated suicidal ideation or self-harm in plain English.
 *
 * Detection is case-insensitive and operates on word-boundary matches so
 * common false-positive substrings (e.g. "killing it") don't trip it.
 */

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
  triggered: boolean;
  matched?: string;
}

export function detectCrisisLanguage(text: string | null | undefined): CrisisDetection {
  if (!text) return { triggered: false };
  for (const re of PATTERNS) {
    const m = text.match(re);
    if (m) {
      return { triggered: true, matched: m[0] };
    }
  }
  return { triggered: false };
}

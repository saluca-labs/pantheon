/**
 * Health OS — risk-flag engine.
 *
 * Pure-function evaluators that translate intake answers, mental-health
 * profile values, screener scores, and free text into `RiskFlagInput[]`
 * records. The repo (`recordRiskFlag` / `recordRiskFlags`) persists the
 * results; the engine itself never touches the database.
 *
 * The engine is deliberately conservative: any rule that fires returns a
 * single typed flag with a stable `kind`. The UI renders flags by kind +
 * severity, so adding a new rule must use a new `kind` so the UI can
 * style it without code changes here.
 *
 * Phase 1 covers:
 *   - intake (physical + mental profile)
 *   - PHQ-9 / GAD-7 screeners (including PHQ-9 Q9 always-critical)
 *   - free-text crisis-language detection (delegates to `_shared/safety`)
 */

import 'server-only';
import { detectCrisisLanguage } from '../_shared/safety/crisis-guard';
import type { RiskFlagInput } from '../_shared/types';
import type { HealthProfile, MentalProfile } from './repo';

// ─── Intake heuristics ─────────────────────────────────────────────────────

export interface IntakeContext {
  source?: string;
}

/**
 * Evaluate intake-time heuristics against the (already-persisted) profile
 * and mental-health profile. Triggers covered:
 *
 *   - `high-stress`         medium  if stress_baseline >= 7
 *   - `poor-sleep`          low     if sleep_quality === 'poor'
 *   - `no-support`          medium  if support_system === 'none'
 *   - `compound-mh-risk`    high    if all three above are true
 */
export function evaluateOnIntake(
  _profile: HealthProfile | null,
  mentalProfile: MentalProfile | null,
  ctx: IntakeContext = {},
): RiskFlagInput[] {
  const source = ctx.source ?? 'intake';
  if (!mentalProfile) return [];

  const flags: RiskFlagInput[] = [];
  const highStress =
    typeof mentalProfile.stressBaseline === 'number' &&
    mentalProfile.stressBaseline >= 7;
  const poorSleep = mentalProfile.sleepQuality === 'poor';
  const noSupport = mentalProfile.supportSystem === 'none';

  if (highStress) {
    flags.push({
      kind: 'high-stress',
      severity: 'medium',
      source,
      payload: { stressBaseline: mentalProfile.stressBaseline },
    });
  }
  if (poorSleep) {
    flags.push({
      kind: 'poor-sleep',
      severity: 'low',
      source,
      payload: { sleepQuality: mentalProfile.sleepQuality },
    });
  }
  if (noSupport) {
    flags.push({
      kind: 'no-support',
      severity: 'medium',
      source,
      payload: { supportSystem: mentalProfile.supportSystem },
    });
  }
  if (highStress && poorSleep && noSupport) {
    flags.push({
      kind: 'compound-mh-risk',
      severity: 'high',
      source,
      payload: {
        stressBaseline: mentalProfile.stressBaseline,
        sleepQuality: mentalProfile.sleepQuality,
        supportSystem: mentalProfile.supportSystem,
      },
    });
  }
  return flags;
}

// ─── Screener heuristics ───────────────────────────────────────────────────

export type ScreenerKind = 'phq9' | 'gad7' | 'pss';

export interface ScreenerContext {
  /** All raw answers in score order. Required for PHQ-9 Q9 detection. */
  answers?: number[];
  source?: string;
}

/**
 * Evaluate a screener score for risk-flag emission. Rules:
 *
 *   PHQ-9 totals
 *     score >= 20            critical  `phq9-severe`
 *     15..19                 high      `phq9-moderate-severe`
 *     10..14                 medium    `phq9-moderate`
 *
 *   GAD-7 totals
 *     score >= 15            critical  `gad7-severe`
 *     10..14                 medium    `gad7-moderate`
 *
 *   PHQ-9 Q9 (suicidal ideation)
 *     answer >= 1            critical  `crisis-language` (always, regardless of total)
 *
 * The rule on Q9 is the safety-critical one — unit tests exercise it
 * explicitly so any regression that drops it fails CI.
 */
export function evaluateOnScreener(
  screenerKind: ScreenerKind,
  score: number,
  ctx: ScreenerContext = {},
): RiskFlagInput[] {
  const source = ctx.source ?? `screener-${screenerKind}`;
  const flags: RiskFlagInput[] = [];

  // PHQ-9 Q9 — always critical when any non-zero answer is present.
  if (
    screenerKind === 'phq9' &&
    Array.isArray(ctx.answers) &&
    ctx.answers.length >= 9
  ) {
    const q9 = ctx.answers[8];
    if (typeof q9 === 'number' && q9 >= 1) {
      flags.push({
        kind: 'crisis-language',
        severity: 'critical',
        source,
        payload: { reason: 'phq9-item-9', value: q9 },
      });
    }
  }

  if (screenerKind === 'phq9') {
    if (score >= 20) {
      flags.push({
        kind: 'phq9-severe',
        severity: 'critical',
        source,
        payload: { score },
      });
    } else if (score >= 15) {
      flags.push({
        kind: 'phq9-moderate-severe',
        severity: 'high',
        source,
        payload: { score },
      });
    } else if (score >= 10) {
      flags.push({
        kind: 'phq9-moderate',
        severity: 'medium',
        source,
        payload: { score },
      });
    }
  } else if (screenerKind === 'gad7') {
    if (score >= 15) {
      flags.push({
        kind: 'gad7-severe',
        severity: 'critical',
        source,
        payload: { score },
      });
    } else if (score >= 10) {
      flags.push({
        kind: 'gad7-moderate',
        severity: 'medium',
        source,
        payload: { score },
      });
    }
  } else if (screenerKind === 'pss') {
    // PSS-10 thresholds (project-chosen bands):
    //   >= 27 → 'pss-severe'   (high severity)
    //   14-26 → 'pss-moderate' (low severity)
    if (score >= 27) {
      flags.push({
        kind: 'pss-severe',
        severity: 'high',
        source,
        payload: { score },
      });
    } else if (score >= 14) {
      flags.push({
        kind: 'pss-moderate',
        severity: 'low',
        source,
        payload: { score },
      });
    }
  }

  return flags;
}

// ─── Referral prompt evaluator ─────────────────────────────────────────────

export interface ReferralResource {
  label: string;
  url: string;
  detail?: string;
}

export interface ReferralPrompt {
  /** True when at least one threshold crossed and resources should surface. */
  shouldSurface: boolean;
  /** Headline copy for the callout. */
  headline: string;
  /** One-line nudge — "Reaching out is a strong move." per spec. */
  nudge: string;
  /** Reasons that triggered surfacing (e.g. 'phq9-moderate-or-worse'). */
  reasons: string[];
  /** Public, non-clinical referral resources. */
  resources: ReferralResource[];
}

export interface ReferralInput {
  phq9?: number;
  gad7?: number;
  pss?: number;
}

const REFERRAL_RESOURCES: ReferralResource[] = [
  {
    label: 'SAMHSA National Helpline',
    url: 'https://www.samhsa.gov/find-help/national-helpline',
    detail: 'Free, confidential treatment referral and information service. 1-800-662-4357 (HELP). 24/7.',
  },
  {
    label: 'Psychology Today — find a therapist',
    url: 'https://www.psychologytoday.com/us/therapists',
    detail: 'Searchable directory of licensed therapists by location, insurance, and specialty.',
  },
  {
    label: '988 Suicide & Crisis Lifeline',
    url: 'https://988lifeline.org/',
    detail: 'Call or text 988. 24/7 free crisis support — for yourself or a loved one.',
  },
];

/**
 * Evaluate referral thresholds across the supplied screener scores.
 * Surfaces (NOT blocks) the standard SAMHSA + Psychology Today + 988
 * resource block when any of:
 *
 *   PHQ-9   ≥ 10  (moderate or worse — clinically significant depression)
 *   GAD-7   ≥ 10  (moderate or worse — clinically significant anxiety)
 *   PSS-10  ≥ 14  (moderate-or-higher perceived stress per project bands)
 *
 * Returns `{ shouldSurface: false, ... }` (with empty reasons) when no
 * threshold crosses; callers can still render the empty state if they
 * want a "you're under the bar — keep going" copy.
 */
export function evaluateReferralPrompt(input: ReferralInput): ReferralPrompt {
  const reasons: string[] = [];
  if (typeof input.phq9 === 'number' && input.phq9 >= 10) {
    reasons.push('phq9-moderate-or-worse');
  }
  if (typeof input.gad7 === 'number' && input.gad7 >= 10) {
    reasons.push('gad7-moderate-or-worse');
  }
  if (typeof input.pss === 'number' && input.pss >= 14) {
    reasons.push('pss-moderate-or-worse');
  }
  const shouldSurface = reasons.length > 0;
  return {
    shouldSurface,
    headline: shouldSurface
      ? "It might be worth talking to someone."
      : "Resources are here whenever you want them.",
    nudge: 'Reaching out is a strong move.',
    reasons,
    // Always return the resource list — callers (UI, audit) decide
    // whether to render based on `shouldSurface`.
    resources: REFERRAL_RESOURCES,
  };
}

// ─── Free-text heuristics ──────────────────────────────────────────────────

export interface FreeTextContext {
  source?: string;
}

/**
 * Evaluate free text via the shared crisis-language guard. Returns at
 * most one flag (a `crisis-language` flag of `critical` severity).
 */
export function evaluateOnFreeText(
  text: string | null | undefined,
  ctx: FreeTextContext = {},
): RiskFlagInput[] {
  const source = ctx.source ?? 'free-text';
  const result = detectCrisisLanguage(text);
  if (!result.matched) return [];
  return [
    {
      kind: 'crisis-language',
      severity: result.severity ?? 'critical',
      source,
      payload: { matches: result.matches, sample: (text ?? '').slice(0, 240) },
    },
  ];
}

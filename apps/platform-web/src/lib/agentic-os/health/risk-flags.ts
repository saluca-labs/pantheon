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

export type ScreenerKind = 'phq9' | 'gad7';

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
  }

  return flags;
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

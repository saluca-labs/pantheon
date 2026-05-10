/**
 * Rules-based activity intensity suggestions.
 *
 * Pure function — no I/O. Callers gather the inputs (recent mood, sleep,
 * anxiety averages + most recent screener of each kind) and pass them in.
 * The output is intentionally interpretable (intensity + rationale) so the
 * UI can show the *why* alongside the suggestion.
 *
 * Rule order matters: earlier rules win over later ones. Elevated screener
 * scores (≥ "moderately severe") always pull toward light activity even
 * if mood is strong, on the principle that sustainability beats intensity
 * when symptoms are loud.
 */

export type SuggestedIntensity = 'light' | 'moderate' | 'vigorous' | 'rest';

export interface ActivitySuggestionInput {
  /** Average mood score (1-10) over the recent window, null if no data. */
  recentMoodAvg?: number | null;
  /** Average anxiety score (1-10) over the recent window. */
  recentAnxietyAvg?: number | null;
  /** Average sleep quality, mapped to 1-4 (poor..excellent) or
   *  1-10 if your caller normalizes upward. We treat <4 as "low". */
  recentSleepAvg?: number | null;
  /** Most recent PHQ-9 score (0-27). */
  lastPhq9?: number | null;
  /** Most recent GAD-7 score (0-21). */
  lastGad7?: number | null;
  /** Most recent PSS-10 score (0-40). */
  lastPss10?: number | null;
}

export interface ActivitySuggestion {
  intensity: SuggestedIntensity;
  rationale: string;
}

export function suggestActivityIntensity(
  input: ActivitySuggestionInput,
): ActivitySuggestion {
  const phq = input.lastPhq9 ?? null;
  const gad = input.lastGad7 ?? null;
  const pss = input.lastPss10 ?? null;
  const mood = input.recentMoodAvg ?? null;
  const sleep = input.recentSleepAvg ?? null;
  const anxiety = input.recentAnxietyAvg ?? null;

  if ((phq !== null && phq >= 15) || (gad !== null && gad >= 15) || (pss !== null && pss >= 27)) {
    return {
      intensity: 'light',
      rationale:
        'Recent screener scores are elevated — gentle movement is more sustainable than pushing hard.',
    };
  }

  if (mood !== null && sleep !== null && mood < 4 && sleep < 4) {
    return {
      intensity: 'light',
      rationale:
        'Low mood + low sleep — light activity preserves energy and supports mood.',
    };
  }

  if (anxiety !== null && anxiety > 7) {
    return {
      intensity: 'moderate',
      rationale:
        'Elevated anxiety — moderate aerobic activity helps regulate the nervous system.',
    };
  }

  if (mood !== null && sleep !== null && mood >= 7 && sleep >= 7) {
    return {
      intensity: 'vigorous',
      rationale:
        'Mood and sleep are strong — a higher-intensity session is well-supported.',
    };
  }

  return {
    intensity: 'moderate',
    rationale: 'Balanced day — a moderate session fits well.',
  };
}

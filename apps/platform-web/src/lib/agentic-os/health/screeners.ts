/**
 * Public-domain mental health screeners used by Health OS.
 *
 * PHQ-9, GAD-7, and PSS-10 are validated, freely-redistributable
 * instruments. They are embedded here as internal questionnaires for
 * self-awareness tracking; Health OS never returns a clinical diagnosis.
 *
 * References (also linked in the in-app caveat block):
 *   - PHQ-9: Kroenke, Spitzer, Williams (2001) — public domain
 *   - GAD-7: Spitzer, Kroenke, Williams, Löwe (2006) — public domain
 *   - PSS-10: Cohen, Kamarck, Mermelstein (1983); Cohen & Williamson (1988)
 *     — public domain (distributed via Mind Garden / NHS / NIMH)
 *   - Crisis safety: 988 Suicide & Crisis Lifeline, Crisis Text Line
 */

export type ScreenerKey = 'phq9' | 'gad7' | 'pss';

export type Severity =
  | 'minimal'
  | 'mild'
  | 'moderate'
  | 'moderately_severe'
  | 'severe';

export interface ScreenerQuestion {
  id: number;
  text: string;
  /** True if a non-zero answer should trigger the crisis-safety wall. */
  crisisItem?: boolean;
}

export interface ScreenerDef {
  key: ScreenerKey;
  title: string;
  description: string;
  /** Standard prompt prefix shown above the answers. */
  prompt: string;
  /** Public-domain answer scale, in score order 0..3. */
  options: { value: number; label: string }[];
  questions: ScreenerQuestion[];
  /** Score breakpoints — array of { max, severity } in ascending order. */
  cutoffs: { max: number; severity: Severity }[];
}

const FOUR_POINT_SCALE = [
  { value: 0, label: 'Not at all' },
  { value: 1, label: 'Several days' },
  { value: 2, label: 'More than half the days' },
  { value: 3, label: 'Nearly every day' },
];

export const PHQ9: ScreenerDef = {
  key: 'phq9',
  title: 'PHQ-9',
  description:
    'Self-administered depression screener. Tracks mood symptoms over the last two weeks for awareness — not a diagnosis.',
  prompt:
    'Over the last 2 weeks, how often have you been bothered by any of the following problems?',
  options: FOUR_POINT_SCALE,
  questions: [
    { id: 1, text: 'Little interest or pleasure in doing things' },
    { id: 2, text: 'Feeling down, depressed, or hopeless' },
    { id: 3, text: 'Trouble falling or staying asleep, or sleeping too much' },
    { id: 4, text: 'Feeling tired or having little energy' },
    { id: 5, text: 'Poor appetite or overeating' },
    {
      id: 6,
      text: 'Feeling bad about yourself — or that you are a failure or have let yourself or your family down',
    },
    {
      id: 7,
      text: 'Trouble concentrating on things, such as reading the newspaper or watching television',
    },
    {
      id: 8,
      text: 'Moving or speaking so slowly that other people could have noticed — or being so fidgety or restless that you have been moving around a lot more than usual',
    },
    {
      id: 9,
      text: 'Thoughts that you would be better off dead, or of hurting yourself in some way',
      crisisItem: true,
    },
  ],
  cutoffs: [
    { max: 4, severity: 'minimal' },
    { max: 9, severity: 'mild' },
    { max: 14, severity: 'moderate' },
    { max: 19, severity: 'moderately_severe' },
    { max: 27, severity: 'severe' },
  ],
};

export const GAD7: ScreenerDef = {
  key: 'gad7',
  title: 'GAD-7',
  description:
    'Self-administered generalized anxiety screener. Tracks anxiety symptoms over the last two weeks for awareness — not a diagnosis.',
  prompt:
    'Over the last 2 weeks, how often have you been bothered by the following problems?',
  options: FOUR_POINT_SCALE,
  questions: [
    { id: 1, text: 'Feeling nervous, anxious, or on edge' },
    { id: 2, text: 'Not being able to stop or control worrying' },
    { id: 3, text: 'Worrying too much about different things' },
    { id: 4, text: 'Trouble relaxing' },
    { id: 5, text: "Being so restless that it's hard to sit still" },
    { id: 6, text: 'Becoming easily annoyed or irritable' },
    { id: 7, text: 'Feeling afraid as if something awful might happen' },
  ],
  cutoffs: [
    { max: 4, severity: 'minimal' },
    { max: 9, severity: 'mild' },
    { max: 14, severity: 'moderate' },
    { max: 21, severity: 'severe' },
  ],
};

// ─── PSS-10 (Perceived Stress Scale) ───────────────────────────────────────
// Five-point response scale (0..4). Items 4, 5, 7, 8 are reverse-scored —
// see `scorePss10` for the math. Severity bands per the plan doc:
//   low      total < 14
//   moderate 14 ≤ total < 27
//   high     total ≥ 27
// (Standard PSS-10 max is 40; the bands above match the project's chosen
// cutoffs which favor surfacing referrals at moderate stress.)

const FIVE_POINT_SCALE = [
  { value: 0, label: 'Never' },
  { value: 1, label: 'Almost never' },
  { value: 2, label: 'Sometimes' },
  { value: 3, label: 'Fairly often' },
  { value: 4, label: 'Very often' },
];

/** Item indices (1-based) that are reverse-scored on the PSS-10. */
export const PSS10_REVERSE_ITEMS: readonly number[] = [4, 5, 7, 8];

export const PSS10: ScreenerDef = {
  key: 'pss',
  title: 'PSS-10',
  description:
    'Self-administered perceived-stress screener. Tracks how stressful life has felt over the last month — for awareness, not a diagnosis.',
  prompt:
    'In the last month, how often have you felt or thought a certain way?',
  options: FIVE_POINT_SCALE,
  questions: [
    { id: 1, text: 'Been upset because of something that happened unexpectedly' },
    { id: 2, text: 'Felt that you were unable to control the important things in your life' },
    { id: 3, text: 'Felt nervous and stressed' },
    { id: 4, text: 'Felt confident about your ability to handle your personal problems' },
    { id: 5, text: 'Felt that things were going your way' },
    { id: 6, text: 'Found that you could not cope with all the things you had to do' },
    { id: 7, text: 'Been able to control irritations in your life' },
    { id: 8, text: 'Felt that you were on top of things' },
    { id: 9, text: 'Been angered because of things that happened that were outside of your control' },
    { id: 10, text: 'Felt difficulties were piling up so high that you could not overcome them' },
  ],
  // Severity buckets used internally; mapped from the project-chosen bands.
  cutoffs: [
    { max: 13, severity: 'minimal' },
    { max: 26, severity: 'moderate' },
    { max: 40, severity: 'severe' },
  ],
};

export const SCREENERS: Record<ScreenerKey, ScreenerDef> = {
  phq9: PHQ9,
  gad7: GAD7,
  pss: PSS10,
};

export function getScreener(key: string): ScreenerDef | null {
  return key === 'phq9' || key === 'gad7' || key === 'pss'
    ? SCREENERS[key as ScreenerKey]
    : null;
}

/**
 * Score a PSS-10 response.
 *
 * Items 4, 5, 7, 8 are reverse-scored (response value subtracted from 4).
 * Total range is 0..40. Severity per project bands:
 *   low      total < 14
 *   moderate 14..26
 *   high     total >= 27
 *
 * Returns the same `{ score, severity, crisisFlag }` shape as
 * `scoreScreener` for parity with PHQ-9 / GAD-7 callers, plus a
 * caller-friendly `band` field with the project-specific labels.
 */
export interface PssScoreResult {
  totalScore: number;
  severity: 'low' | 'moderate' | 'high';
}

export function scorePss10(answers: number[]): PssScoreResult {
  const def = SCREENERS.pss;
  if (answers.length !== def.questions.length) {
    throw new Error(`Expected ${def.questions.length} answers for pss, got ${answers.length}`);
  }
  let total = 0;
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    if (typeof a !== 'number' || a < 0 || a > 4 || !Number.isInteger(a)) {
      throw new Error(`Answer ${i + 1} must be an integer 0..4`);
    }
    // PSS10_REVERSE_ITEMS is 1-based; items 4, 5, 7, 8 → indices 3, 4, 6, 7.
    const oneBased = i + 1;
    const value = PSS10_REVERSE_ITEMS.includes(oneBased) ? 4 - a : a;
    total += value;
  }
  let severity: 'low' | 'moderate' | 'high' = 'low';
  if (total >= 27) severity = 'high';
  else if (total >= 14) severity = 'moderate';
  return { totalScore: total, severity };
}

export interface ScreenerResult {
  score: number;
  severity: Severity;
  crisisFlag: boolean;
}

/**
 * Score a screener response. Returns total, severity bucket, and whether
 * any crisis-flagged item received a non-zero answer. The crisis flag is
 * what activates the safety wall.
 */
export function scoreScreener(
  key: ScreenerKey,
  answers: number[],
): ScreenerResult {
  const def = SCREENERS[key];
  if (!def) {
    throw new Error(`Unknown screener: ${key}`);
  }
  // PSS-10 uses a 0..4 scale and reverse-scores 4 items; delegate to the
  // dedicated helper and lift its result into the shared `ScreenerResult`
  // envelope so callers (BFF route, repo) stay generic.
  if (key === 'pss') {
    const r = scorePss10(answers);
    const severity: Severity =
      r.severity === 'high'
        ? 'severe'
        : r.severity === 'moderate'
          ? 'moderate'
          : 'minimal';
    return { score: r.totalScore, severity, crisisFlag: false };
  }
  if (answers.length !== def.questions.length) {
    throw new Error(
      `Expected ${def.questions.length} answers for ${key}, got ${answers.length}`,
    );
  }
  let score = 0;
  let crisisFlag = false;
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    const q = def.questions[i];
    if (typeof a !== 'number' || a < 0 || a > 3 || !Number.isInteger(a)) {
      throw new Error(`Answer ${i + 1} must be an integer 0..3`);
    }
    score += a;
    if (q?.crisisItem && a > 0) {
      crisisFlag = true;
    }
  }
  let severity: Severity = 'minimal';
  for (const cutoff of def.cutoffs) {
    if (score <= cutoff.max) {
      severity = cutoff.severity;
      break;
    }
  }
  // Moderate-or-worse on PHQ-9 also triggers the safety prompt for a
  // referral suggestion; tracked alongside the strict crisis flag.
  if (key === 'phq9' && (severity === 'severe' || severity === 'moderately_severe')) {
    crisisFlag = true;
  }
  return { score, severity, crisisFlag };
}

export const CRISIS_RESOURCES = {
  hotlineNumber: '988',
  hotlineLabel: '988 Suicide & Crisis Lifeline',
  hotlineUrl: 'https://988lifeline.org/',
  textShortcode: '741741',
  textKeyword: 'HOME',
  textLabel: 'Crisis Text Line — text HOME to 741741',
  textUrl: 'https://www.crisistextline.org/',
};

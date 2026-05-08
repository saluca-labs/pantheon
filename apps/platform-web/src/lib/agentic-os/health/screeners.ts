/**
 * Public-domain mental health screeners used by Health OS.
 *
 * PHQ-9 (Patient Health Questionnaire-9) and GAD-7 (Generalized Anxiety
 * Disorder-7) are validated, freely-redistributable instruments. They are
 * embedded here as internal questionnaires for self-awareness tracking;
 * Health OS never returns a clinical diagnosis.
 *
 * References (also linked in the in-app caveat block):
 *   - PHQ-9: Kroenke, Spitzer, Williams (2001) — public domain
 *   - GAD-7: Spitzer, Kroenke, Williams, Löwe (2006) — public domain
 *   - Crisis safety: 988 Suicide & Crisis Lifeline, Crisis Text Line
 */

export type ScreenerKey = 'phq9' | 'gad7';

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

export const SCREENERS: Record<ScreenerKey, ScreenerDef> = {
  phq9: PHQ9,
  gad7: GAD7,
};

export function getScreener(key: string): ScreenerDef | null {
  return key === 'phq9' || key === 'gad7' ? SCREENERS[key] : null;
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

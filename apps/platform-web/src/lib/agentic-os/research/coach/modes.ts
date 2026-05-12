/**
 * Research OS coach — mode taxonomy.
 *
 * Shared by the migration CHECK constraint, the session repo, the
 * system-prompt builder, the API route validators, and the UI mode
 * picker. Keeping a single source of truth for the four locked modes
 * means a typo in one layer surfaces as a type / test error in every
 * other layer.
 *
 * Mirror of Autobiographer OS coach modes — same pattern, different
 * vocabulary:
 *   lit_reviewer       (theme-organizing literature synthesizer)
 *   hypothesis_critic  (methodological skeptic / falsifiability prober)
 *   methods_advisor    (experimental-design helper; REQUIRES experiment_id)
 *   general            (stuck-PhD conversation partner)
 *
 * methods_advisor is the only mode that hard-requires an experiment
 * scope — the route layer rejects a workshop-scoped methods_advisor
 * session with a 400. Every other mode accepts a workshop-wide call.
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

export const COACH_MODE_VALUES = [
  'lit_reviewer',
  'hypothesis_critic',
  'methods_advisor',
  'general',
] as const;

export type CoachMode = (typeof COACH_MODE_VALUES)[number];

export const COACH_MODE_LABELS: Record<CoachMode, string> = {
  lit_reviewer: 'Lit reviewer',
  hypothesis_critic: 'Hypothesis critic',
  methods_advisor: 'Methods advisor',
  general: 'General',
};

export const COACH_MODE_DESCRIPTIONS: Record<CoachMode, string> = {
  lit_reviewer:
    'Literature synthesizer that organizes your papers by theme, surfaces gaps, and notes contradictions across the workshop or a single experiment.',
  hypothesis_critic:
    'Methodological skeptic. Probes confounders, tests falsifiability, identifies weak predictions, and stress-tests evidence polarity.',
  methods_advisor:
    'Experimental-design helper. Recommends controls, sample sizes, and reproducibility steps. Refuses regulated professional advice — refers to IRB / IACUC / EHS / licensed professionals. Requires an experiment scope.',
  general:
    'Stuck-PhD conversation partner. Has workshop counts only; useful for "what should I focus on?" or "what is this project actually about?".',
};

export const COACH_MODE_STARTERS: Record<CoachMode, string[]> = {
  lit_reviewer: [
    'Summarize my last 10 papers by theme.',
    'Where do my papers contradict each other?',
    'What gap in the literature does my experiment address?',
    'Group the recent papers by methodology.',
  ],
  hypothesis_critic: [
    'What confounders am I missing for my active hypotheses?',
    'Which of my predictions are unfalsifiable as written?',
    'Stress-test the strongest hypothesis in my ledger.',
    'Which hypotheses have weak evidence on both sides?',
  ],
  methods_advisor: [
    'Suggest controls for my current experiment.',
    'What sample size should I target for this protocol?',
    'Walk through reproducibility gaps in this experiment.',
    'Critique the linked protocols for this experiment.',
  ],
  general: [
    'Give me a status snapshot of my research workshop.',
    'What should I focus on this week?',
    'How close am I to a complete first draft of this experiment?',
    'Surface the experiment most at risk.',
  ],
};

/** Modes that REQUIRE a non-null experiment_id at create + quick time. */
export const EXPERIMENT_REQUIRED_MODES: ReadonlyArray<CoachMode> = [
  'methods_advisor',
];

export function isCoachMode(value: unknown): value is CoachMode {
  return (
    typeof value === 'string' &&
    (COACH_MODE_VALUES as readonly string[]).includes(value)
  );
}

/**
 * True when the mode requires a non-null experiment_id. Used by both
 * the sessions POST and the quick route to reject a workshop-scoped
 * methods_advisor with a 400.
 */
export function modeRequiresExperiment(mode: CoachMode): boolean {
  return (EXPERIMENT_REQUIRED_MODES as readonly CoachMode[]).includes(mode);
}

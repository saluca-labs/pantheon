/**
 * Autobiographer OS coach — mode taxonomy.
 *
 * Shared by the migration CHECK constraint, the session repo, the
 * system-prompt builder, the API route validators, and the UI mode
 * picker. Keeping a single source of truth for the four locked modes
 * means a typo in one layer surfaces as a type / test error in every
 * other layer.
 *
 * Mirror of Maker OS coach modes — same pattern, different vocabulary:
 *   interviewer       (memoir-elicitation prompts)
 *   chapter_drafter   (ghostwriter-with-citations)
 *   narrative_critic  (structural editor)
 *   general           (stuck-author conversation partner)
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

export const COACH_MODE_VALUES = [
  'interviewer',
  'chapter_drafter',
  'narrative_critic',
  'general',
] as const;

export type CoachMode = (typeof COACH_MODE_VALUES)[number];

export const COACH_MODE_LABELS: Record<CoachMode, string> = {
  interviewer: 'Interviewer',
  chapter_drafter: 'Chapter drafter',
  narrative_critic: 'Narrative critic',
  general: 'General',
};

export const COACH_MODE_DESCRIPTIONS: Record<CoachMode, string> = {
  interviewer:
    'Empathetic memoir interviewer. Generates open-ended elicitation prompts grounded in your most recent memories and (optionally) a single person.',
  chapter_drafter:
    'Ghostwriter that writes one paragraph at a time in your voice, emitting a citation map back to source memories. Never invents content.',
  narrative_critic:
    'Structural editor. Reads the chapter list + arcs and critiques pacing, repetition, missing transitions, and voice drift.',
  general:
    'Stuck-author conversation partner. Has book meta + counts only; useful for "what should I focus on?" or "what is this book actually about?".',
};

export const COACH_MODE_STARTERS: Record<CoachMode, string[]> = {
  interviewer: [
    'Help me elicit the next memory I should capture for this book.',
    "I'm stuck on a person — ask me a question that gets me unstuck.",
    'Give me five questions that surface childhood sensory detail.',
    'What memory do you think is missing from this book?',
  ],
  chapter_drafter: [
    'Draft the next paragraph from the source memories on this chapter.',
    'Rewrite this section in my voice without inventing anything new.',
    'Continue from the last paragraph using only the cited memories.',
    'Summarize the source memories into a chapter opening.',
  ],
  narrative_critic: [
    'Read the chapter list and flag pacing problems.',
    "Where am I repeating myself across chapters?",
    'Are any transitions missing between adjacent chapters?',
    'Does the chapter order match the primary arc?',
  ],
  general: [
    'Give me a status snapshot of this book.',
    'What should I focus on this week?',
    "What's this book actually about?",
    'How close am I to a complete first draft?',
  ],
};

export function isCoachMode(value: unknown): value is CoachMode {
  return (
    typeof value === 'string' &&
    (COACH_MODE_VALUES as readonly string[]).includes(value)
  );
}

/**
 * Filmmaker coach mode taxonomy. Shared by the migration enum, the repo,
 * the system-prompt builder, and the UI mode-picker chip group.
 */

export const COACH_MODE_VALUES = [
  'development_exec',
  'script_reader',
  'dialogue_doctor',
  'scheduler',
  'general',
] as const;

export type CoachMode = (typeof COACH_MODE_VALUES)[number];

export const COACH_MODE_LABELS: Record<CoachMode, string> = {
  development_exec: 'Development exec',
  script_reader: 'Script reader',
  dialogue_doctor: 'Dialogue doctor',
  scheduler: 'Scheduler',
  general: 'General',
};

export const COACH_MODE_DESCRIPTIONS: Record<CoachMode, string> = {
  development_exec:
    'Industry development exec. Notes on structure, hook, character arc, marketability, comparables.',
  script_reader:
    'Coverage analyst. Logline / synopsis / structural notes / character / dialogue / pass-consider-recommend.',
  dialogue_doctor:
    'Dialogue specialist. Per-character voice analysis, punch-ups, on-the-nose flags.',
  scheduler:
    '1st AD perspective. Reads breakdown + schedule for day-too-long, unbalanced units, missing strips.',
  general: 'Broad filmmaker collaborator across script, story, and production.',
};

export const COACH_MODE_STARTERS: Record<CoachMode, string[]> = {
  development_exec: [
    'Give me development notes on this script.',
    'How marketable is this concept right now?',
    'Where does the character arc fall apart?',
    'What are the closest comparable titles?',
  ],
  script_reader: [
    'Write coverage on the current draft.',
    'What is the one-line logline you would give this?',
    'Summarize the structural beats.',
    'Pass, consider, or recommend?',
  ],
  dialogue_doctor: [
    'Audit each main character’s voice for distinctness.',
    'Which lines are on-the-nose?',
    'Punch up the dialogue in scene 4.',
    'Flag any era/accent inconsistencies.',
  ],
  scheduler: [
    'Is day 1 too long?',
    'Which scenes are still unscheduled?',
    'Are the units balanced?',
    'Flag any missing strips.',
  ],
  general: [
    'Walk me through where this project is right now.',
    'What should I work on next?',
    'Read me scene 3 and tell me what is working.',
    'Add a beat to the outline document.',
  ],
};

export function isCoachMode(value: unknown): value is CoachMode {
  return (
    typeof value === 'string' &&
    (COACH_MODE_VALUES as readonly string[]).includes(value)
  );
}

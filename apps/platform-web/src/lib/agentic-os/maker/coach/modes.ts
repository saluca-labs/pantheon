/**
 * Maker OS coach — mode taxonomy.
 *
 * Shared by the migration CHECK constraint, the session repo, the
 * system-prompt builder, the API route validators, and the UI mode
 * picker. Keeping a single source of truth for the four locked modes
 * means a typo in one layer surfaces as a type / test error in every
 * other layer.
 *
 * @license MIT — Tiresias Maker OS Phase 7 (internal).
 */

export const COACH_MODE_VALUES = [
  'procurement_advisor',
  'build_planner',
  'shop_safety',
  'general',
] as const;

export type CoachMode = (typeof COACH_MODE_VALUES)[number];

export const COACH_MODE_LABELS: Record<CoachMode, string> = {
  procurement_advisor: 'Procurement advisor',
  build_planner: 'Build planner',
  shop_safety: 'Shop safety',
  general: 'General',
};

export const COACH_MODE_DESCRIPTIONS: Record<CoachMode, string> = {
  procurement_advisor:
    "Sources parts. Reads the project's BOM, supplier links, and part variants; flags missing suppliers, suggests alternatives, and estimates costs.",
  build_planner:
    "Sequences the build. Reads steps, milestones (with deadlines), open dependencies, and tools required; flags deadline conflicts, missing tools, and cross-project blockers.",
  shop_safety:
    'Workshop safety advisor. Reads the tools list, overdue maintenance, worn-out consumables, and the current build step; recommends PPE, flags tool-status warnings, and calls out ventilation / fume risks.',
  general:
    'Broad workshop collaborator. Has read access to projects, BOMs, tools, references, and blockers — no domain filter.',
};

export const COACH_MODE_STARTERS: Record<CoachMode, string[]> = {
  procurement_advisor: [
    'Walk me through the BOM — what should I order first?',
    'Which parts have no supplier linked yet?',
    'Suggest cheaper alternatives for the biggest line items.',
    'Estimate the total parts cost for this build.',
  ],
  build_planner: [
    'What should I build first on this project?',
    'Flag any deadline conflicts across my milestones.',
    'Which tools do I need that I do not own yet?',
    'Are any other projects blocking this one?',
  ],
  shop_safety: [
    'What PPE do I need for the next build step?',
    "Any tool warnings I should know about today?",
    'Which consumables are due for replacement?',
    'Are any of my tools overdue for maintenance?',
  ],
  general: [
    'Give me a status snapshot of this project.',
    'What should I focus on this week?',
    "What's the riskiest part of my current build?",
    "What's in my workshop that I'm under-using?",
  ],
};

export function isCoachMode(value: unknown): value is CoachMode {
  return (
    typeof value === 'string' &&
    (COACH_MODE_VALUES as readonly string[]).includes(value)
  );
}

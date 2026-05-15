/**
 * Research OS Phase 2 — Notebook entry-kind taxonomy.
 *
 * Six lab-notebook entry kinds, with display labels, short descriptions,
 * icon hints, and Tailwind accent tokens. The canonical list lives here so
 * the DB CHECK constraint, the Zod schema on the routes, the filter chips
 * UI, and the per-kind pill component all read from one source of truth.
 *
 * Why six and not seven?
 *  - `note`        — generic free-form
 *  - `observation` — bench/measurement-time record
 *  - `result`      — analysis output / figure / dataset link
 *  - `decision`    — chosen path forward (mirrors Filmmaker "decision" log)
 *  - `question`    — open question that needs answering
 *  - `todo`        — actionable item (indexed for the open-todos widget)
 *
 * The plan doc enumerates exactly these six; no scope creep here.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

export const ENTRY_KINDS = [
  'note',
  'observation',
  'result',
  'decision',
  'question',
  'todo',
] as const;

export type EntryKind = (typeof ENTRY_KINDS)[number];

export const ENTRY_KIND_LABELS: Record<EntryKind, string> = {
  note: 'Note',
  observation: 'Observation',
  result: 'Result',
  decision: 'Decision',
  question: 'Question',
  todo: 'To-do',
};

export const ENTRY_KIND_DESCRIPTIONS: Record<EntryKind, string> = {
  note: 'Free-form lab note. The default catch-all.',
  observation: 'A bench-time measurement, reading, or sensory record.',
  result: 'A finalized analysis output, figure, or summary statistic.',
  decision: 'A chosen path forward worth surfacing on the timeline.',
  question: 'An open question that still needs answering.',
  todo: 'Actionable item to track until done.',
};

/**
 * Tailwind accent tokens for the per-kind pill / filter chip. Reads from
 * the per-kind tokens defined in `globals.css` (W-E.5) so the palette is
 * documented (`tokens.md` §11) and theme-aware rather than raw Tailwind
 * palette literals.
 */
export const ENTRY_KIND_COLOR: Record<EntryKind, string> = {
  note: 'text-text-secondary bg-surface-2 border-border-subtle',
  observation: 'text-kind-observation bg-kind-observation/10 border-kind-observation/30',
  result: 'text-kind-result bg-kind-result/10 border-kind-result/30',
  decision: 'text-kind-decision bg-kind-decision/10 border-kind-decision/30',
  question: 'text-kind-question bg-kind-question/10 border-kind-question/30',
  todo: 'text-kind-todo bg-kind-todo/10 border-kind-todo/30',
};

/**
 * Lucide icon NAME (not the component) for each entry kind. Components
 * resolve this via a switch — keeping the mapping a plain string makes
 * the lib layer free of React imports.
 */
export const ENTRY_KIND_ICON: Record<EntryKind, string> = {
  note: 'StickyNote',
  observation: 'Eye',
  result: 'CheckCircle2',
  decision: 'GitFork',
  question: 'HelpCircle',
  todo: 'Square',
};

/**
 * Type guard / validator for an unknown value claiming to be an entry
 * kind. Returns the typed value or null. Use at write boundaries
 * (route handlers and repo INSERT/UPDATE) as a second line of defence
 * behind the Zod schema.
 */
export function asEntryKind(value: unknown): EntryKind | null {
  if (typeof value !== 'string') return null;
  return (ENTRY_KINDS as readonly string[]).includes(value)
    ? (value as EntryKind)
    : null;
}

/**
 * Return a human-friendly label for a kind value, falling back to the
 * raw string if the kind is unknown. Used by the audit payload + the
 * "no kind found" defensive UI branch.
 */
export function entryKindLabel(value: string): string {
  const k = asEntryKind(value);
  return k ? ENTRY_KIND_LABELS[k] : value;
}

/**
 * Strict validator — throws on invalid input. Used by repo functions
 * that want to fail fast inside a transaction rather than return null
 * up the stack.
 */
export function validateEntryKindStrict(value: unknown): EntryKind {
  const k = asEntryKind(value);
  if (!k) {
    throw new Error(
      `Invalid notebook entry_kind: ${String(value)}. Must be one of: ${ENTRY_KINDS.join(', ')}.`,
    );
  }
  return k;
}

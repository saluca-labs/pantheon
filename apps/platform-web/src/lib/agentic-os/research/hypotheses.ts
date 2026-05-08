/**
 * Research OS — hypothesis ledger domain logic.
 *
 * Provides types and pure-logic helpers for the hypothesis tracker.
 * No DB calls here — those live in repo.ts.
 *
 * The hypothesis model follows the standard scientific structure:
 *   If [independent variable], then [dependent variable], because [rationale].
 *
 * References:
 *   - Scientific method primer (public domain):
 *     https://www.sciencebuddies.org/science-fair-projects/science-fair/steps-of-the-scientific-method
 *   - Experiment design vocabulary from NIH Research Methods Glossary (public domain):
 *     https://www.niaid.nih.gov/research/glossary-of-research-terms
 *
 * @license MIT — Tiresias Research OS (internal).
 */

export type HypothesisStatus =
  | 'draft'
  | 'active'
  | 'testing'
  | 'supported'
  | 'refuted'
  | 'inconclusive'
  | 'archived';

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface Hypothesis {
  id: string;
  userId: string;
  title: string;
  /** The "If X…" part. */
  ifClause: string;
  /** The "…then Y…" part. */
  thenClause: string;
  /** The "…because Z" rationale. */
  becauseClause: string;
  status: HypothesisStatus;
  confidence: ConfidenceLevel;
  tags: string[];
  /** IDs of experiments associated with this hypothesis. */
  experimentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ExperimentDesign {
  id: string;
  hypothesisId: string;
  userId: string;
  title: string;
  independent: string;
  dependent: string;
  controls: string;
  protocol: string;
  successCriteria: string;
  status: 'planned' | 'running' | 'done';
  createdAt: string;
  updatedAt: string;
}

export const HYPOTHESIS_STATUSES: { value: HypothesisStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'testing', label: 'Testing' },
  { value: 'supported', label: 'Supported' },
  { value: 'refuted', label: 'Refuted' },
  { value: 'inconclusive', label: 'Inconclusive' },
  { value: 'archived', label: 'Archived' },
];

export const CONFIDENCE_LEVELS: { value: ConfidenceLevel; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

/**
 * Render a hypothesis as a human-readable "If…then…because…" statement.
 */
export function renderHypothesisStatement(h: Pick<Hypothesis, 'ifClause' | 'thenClause' | 'becauseClause'>): string {
  return `If ${h.ifClause}, then ${h.thenClause}, because ${h.becauseClause}.`;
}

/**
 * Validate that a hypothesis has all three required clauses non-empty.
 * Returns an array of error messages (empty = valid).
 */
export function validateHypothesis(h: {
  ifClause: string;
  thenClause: string;
  becauseClause: string;
  title: string;
}): string[] {
  const errors: string[] = [];
  if (!h.title.trim()) errors.push('Title is required.');
  if (!h.ifClause.trim()) errors.push('"If" clause is required.');
  if (!h.thenClause.trim()) errors.push('"Then" clause is required.');
  if (!h.becauseClause.trim()) errors.push('"Because" rationale is required.');
  return errors;
}

/**
 * Determine whether a status transition is valid.
 * Prevents moving from a terminal state back to draft without going via active.
 *
 * Allowed transitions (simplified ruleset):
 *   draft       → active
 *   active      → testing, archived
 *   testing     → supported, refuted, inconclusive
 *   supported   → archived
 *   refuted     → archived
 *   inconclusive → active, archived
 *   archived    → (none — terminal)
 */
export function isValidStatusTransition(from: HypothesisStatus, to: HypothesisStatus): boolean {
  if (from === to) return true;
  const allowed: Record<HypothesisStatus, HypothesisStatus[]> = {
    draft:        ['active'],
    active:       ['testing', 'archived'],
    testing:      ['supported', 'refuted', 'inconclusive'],
    supported:    ['archived'],
    refuted:      ['archived'],
    inconclusive: ['active', 'archived'],
    archived:     [],
  };
  return allowed[from]?.includes(to) ?? false;
}

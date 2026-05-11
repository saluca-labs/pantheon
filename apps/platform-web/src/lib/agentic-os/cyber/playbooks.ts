/**
 * CyberSec OS - playbooks domain types.
 *
 * Mirrors the `agos_cyber_playbooks`, `agos_cyber_playbook_runs` and `agos_cyber_playbook_step_runs` tables.
 *
 * @license MIT - Tiresias CyberSec OS (internal).
 */

export type PlaybookLifecycle = 'draft' | 'testing' | 'active' | 'deprecated' | 'archived';
export type PlaybookStepKind = 'checklist' | 'input' | 'decision' | 'runbook_step';
export type PlaybookRunStatus = 'in_progress' | 'completed' | 'abandoned';
export type PlaybookStepRunStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'blocked';

export interface PlaybookStepField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox';
  options?: string[];
  required?: boolean;
}

export type PlaybookStep =
  | { kind: 'checklist';    label: string; instructions?: string; fields?: PlaybookStepField[] }
  | { kind: 'input';        label: string; instructions?: string; fields?: PlaybookStepField[] }
  | { kind: 'decision';     label: string; instructions?: string; fields?: PlaybookStepField[] }
  | { kind: 'runbook_step'; label: string; instructions?: string; fields?: PlaybookStepField[] };

export interface Playbook {
  id: string;
  ownerId: string;
  name: string;
  category: string | null;
  description: string | null;
  lifecycle: PlaybookLifecycle;
  tactic: string | null;
  steps: PlaybookStep[];
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PlaybookUpsert {
  name: string;
  category?: string | null;
  description?: string | null;
  lifecycle?: PlaybookLifecycle;
  tactic?: string | null;
  steps?: PlaybookStep[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface PlaybookPatch extends Partial<PlaybookUpsert> {}

export interface PlaybookRun {
  id: string;
  playbookId: string;
  ownerId: string;
  caseId: string | null;
  status: PlaybookRunStatus;
  startedAt: string;
  completedAt: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PlaybookStepRun {
  id: string;
  runId: string;
  stepIndex: number;
  stepSnapshot: PlaybookStep;
  status: PlaybookStepRunStatus;
  input: Record<string, unknown>;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlaybookRunDetail extends PlaybookRun {
  stepRuns: PlaybookStepRun[];
  playbookName: string;
}

export const PLAYBOOK_LIFECYCLE_VALUES = ['draft','testing','active','deprecated','archived'] as const;
export const PLAYBOOK_STEP_KIND_VALUES = ['checklist','input','decision','runbook_step'] as const;
export const PLAYBOOK_RUN_STATUS_VALUES = ['in_progress','completed','abandoned'] as const;
export const PLAYBOOK_STEP_RUN_STATUS_VALUES = ['pending','in_progress','completed','skipped','blocked'] as const;

export const PLAYBOOK_STEP_KINDS: { value: PlaybookStepKind; label: string; icon: string; description: string }[] = [
  { value: 'checklist',    label: 'Checklist',    icon: 'CheckSquare', description: 'A list of items the responder ticks off.' },
  { value: 'input',        label: 'Input',        icon: 'PenLine',     description: 'Collect free-form text or structured fields.' },
  { value: 'decision',     label: 'Decision',     icon: 'GitBranch',   description: 'Branch on a yes/no or option selection.' },
  { value: 'runbook_step', label: 'Runbook step', icon: 'Terminal',    description: 'Execute an instruction and confirm completion.' },
];

export const PLAYBOOK_LIFECYCLES: { value: PlaybookLifecycle; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'testing', label: 'Testing' },
  { value: 'active', label: 'Active' },
  { value: 'deprecated', label: 'Deprecated' },
  { value: 'archived', label: 'Archived' },
];

export const PLAYBOOK_RUN_STATUSES: { value: PlaybookRunStatus; label: string }[] = [
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'abandoned', label: 'Abandoned' },
];

export const PLAYBOOK_STEP_RUN_STATUSES: { value: PlaybookStepRunStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'blocked', label: 'Blocked' },
];

export function isRunTerminal(r: Pick<PlaybookRun, 'status'>): boolean {
  return r.status === 'completed' || r.status === 'abandoned';
}

export function nextPendingStepIndex(run: Pick<PlaybookRun, 'status'>, stepRuns: Pick<PlaybookStepRun, 'stepIndex' | 'status'>[]): number | null {
  if (isRunTerminal(run)) return null;
  let minIndex: number | null = null;
  for (const sr of stepRuns) {
    if (sr.status === 'pending' || sr.status === 'in_progress' || sr.status === 'blocked') {
      if (minIndex === null || sr.stepIndex < minIndex) {
        minIndex = sr.stepIndex;
      }
    }
  }
  return minIndex;
}

export function progressFraction(stepRuns: Pick<PlaybookStepRun, 'status'>[]): number {
  const total = stepRuns.length;
  if (total === 0) return 0;
  const completedOrSkipped = stepRuns.filter(sr => sr.status === 'completed' || sr.status === 'skipped').length;
  const fraction = completedOrSkipped / total;
  return Math.min(Math.max(fraction, 0), 1);
}

export function defaultStepFor(kind: PlaybookStepKind): PlaybookStep {
  return { kind, label: 'New step', instructions: '', fields: [] } as PlaybookStep;
}

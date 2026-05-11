/**
 * CyberSec OS — cases domain types.
 *
 * Mirrors the `agos_cyber_cases` tables from migration 0029_cyber_phase2.
 *
 * @license MIT � Tiresias CyberSec OS (internal).
 */

export type CaseSeverity = 'critical' | 'high' | 'medium' | 'low';
export type CaseStatus = 'open' | 'triage' | 'investigating' | 'contained' | 'eradicated' | 'recovered' | 'closed' | 'false_positive';
export type CasePriority = 'p1' | 'p2' | 'p3' | 'p4' | 'p5';
export type CaseEventKind = 'note' | 'status_change' | 'alert_attached' | 'alert_detached' | 'evidence_added' | 'evidence_removed' | 'task_added' | 'task_completed' | 'task_reopened' | 'assignment_change' | 'severity_change' | 'priority_change';
export type EvidenceKind = 'file' | 'url' | 'command_output' | 'log_excerpt' | 'screenshot' | 'ioc' | 'other';
export type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Case {
  id: string;
  ownerId: string;
  title: string;
  summary: string | null;
  severity: CaseSeverity;
  status: CaseStatus;
  priority: CasePriority;
  assignedTo: string | null;
  tactic: string | null;
  technique: string | null;
  tags: string[];
  closedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CaseUpsert {
  title: string;
  summary?: string | null;
  severity?: CaseSeverity;
  status?: CaseStatus;
  priority?: CasePriority;
  assignedTo?: string | null;
  tactic?: string | null;
  technique?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface CasePatch extends Partial<CaseUpsert> {
  closedAt?: string | null;
}

export interface CaseEvent {
  id: string;
  caseId: string;
  kind: CaseEventKind;
  author: string | null;
  body: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface CaseEventInsert {
  caseId: string;
  kind: CaseEventKind;
  author?: string | null;
  body?: string | null;
  payload?: Record<string, unknown>;
}

export interface Evidence {
  id: string;
  caseId: string;
  kind: EvidenceKind;
  title: string;
  description: string | null;
  url: string | null;
  content: string | null;
  mimeType: string | null;
  sha256: string | null;
  collectedAt: string;
  collectedBy: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceUpsert {
  caseId: string;
  kind: EvidenceKind;
  title: string;
  description?: string | null;
  url?: string | null;
  content?: string | null;
  mimeType?: string | null;
  sha256?: string | null;
  collectedAt?: string;
  collectedBy?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface EvidencePatch extends Omit<EvidenceUpsert, 'caseId'> {}

export interface Task {
  id: string;
  caseId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assignedTo: string | null;
  priority: TaskPriority;
  dueAt: string | null;
  completedAt: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskUpsert {
  caseId: string;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  assignedTo?: string | null;
  priority?: TaskPriority;
  dueAt?: string | null;
  position?: number;
}

export interface TaskPatch extends Omit<TaskUpsert, 'caseId'> {
  completedAt?: string | null;
}

export interface CaseWithCounts extends Case {
  alertCount: number;
  eventCount: number;
  evidenceCount: number;
  openTaskCount: number;
}

export interface CaseDetail extends Case {
  linkedAlerts: {
    id: string;
    title: string;
    severity: string;
    occurredAt: string;
  }[];
  events: CaseEvent[];
  evidence: Evidence[];
  tasks: Task[];
}

export const CASE_SEVERITY_VALUES = ['critical', 'high', 'medium', 'low'] as const;
export const CASE_STATUS_VALUES = ['open', 'triage', 'investigating', 'contained', 'eradicated', 'recovered', 'closed', 'false_positive'] as const;
export const CASE_PRIORITY_VALUES = ['p1', 'p2', 'p3', 'p4', 'p5'] as const;
export const CASE_EVENT_KIND_VALUES = ['note', 'status_change', 'alert_attached', 'alert_detached', 'evidence_added', 'evidence_removed', 'task_added', 'task_completed', 'task_reopened', 'assignment_change', 'severity_change', 'priority_change'] as const;
export const EVIDENCE_KIND_VALUES = ['file', 'url', 'command_output', 'log_excerpt', 'screenshot', 'ioc', 'other'] as const;
export const TASK_STATUS_VALUES = ['open', 'in_progress', 'blocked', 'done', 'cancelled'] as const;
export const TASK_PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent'] as const;

export const CASE_SEVERITIES: { value: CaseSeverity; label: string; order: number; color: string }[] = [
  { value: 'critical', label: 'Critical', order: 0, color: 'text-red-500' },
  { value: 'high', label: 'High', order: 1, color: 'text-orange-500' },
  { value: 'medium', label: 'Medium', order: 2, color: 'text-yellow-500' },
  { value: 'low', label: 'Low', order: 3, color: 'text-blue-500' },
];

export const CASE_STATUSES: { value: CaseStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'triage', label: 'Triage' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'contained', label: 'Contained' },
  { value: 'eradicated', label: 'Eradicated' },
  { value: 'recovered', label: 'Recovered' },
  { value: 'closed', label: 'Closed' },
  { value: 'false_positive', label: 'False Positive' },
];

export const CASE_PRIORITIES: { value: CasePriority; label: string; order: number }[] = [
  { value: 'p1', label: 'P1 � Critical', order: 0 },
  { value: 'p2', label: 'P2 � High', order: 1 },
  { value: 'p3', label: 'P3 � Medium', order: 2 },
  { value: 'p4', label: 'P4 � Low', order: 3 },
  { value: 'p5', label: 'P5 � Backlog', order: 4 },
];

export const CASE_EVENT_KINDS: { value: CaseEventKind; label: string; icon: string }[] = [
  { value: 'note', label: 'Note', icon: 'MessageSquare' },
  { value: 'status_change', label: 'Status Change', icon: 'GitBranch' },
  { value: 'alert_attached', label: 'Alert Attached', icon: 'Link2' },
  { value: 'alert_detached', label: 'Alert Detached', icon: 'Link2' },
  { value: 'evidence_added', label: 'Evidence Added', icon: 'FileText' },
  { value: 'evidence_removed', label: 'Evidence Removed', icon: 'FileText' },
  { value: 'task_added', label: 'Task Added', icon: 'CheckSquare' },
  { value: 'task_completed', label: 'Task Completed', icon: 'CheckSquare' },
  { value: 'task_reopened', label: 'Task Reopened', icon: 'CheckSquare' },
  { value: 'assignment_change', label: 'Assignment Change', icon: 'UserCheck' },
  { value: 'severity_change', label: 'Severity Change', icon: 'TrendingUp' },
  { value: 'priority_change', label: 'Priority Change', icon: 'Flag' },
];

export const EVIDENCE_KINDS: { value: EvidenceKind; label: string; icon: string }[] = [
  { value: 'file', label: 'File', icon: 'File' },
  { value: 'url', label: 'URL', icon: 'Link' },
  { value: 'command_output', label: 'Command Output', icon: 'Terminal' },
  { value: 'log_excerpt', label: 'Log Excerpt', icon: 'ScrollText' },
  { value: 'screenshot', label: 'Screenshot', icon: 'Image' },
  { value: 'ioc', label: 'IOC', icon: 'Target' },
  { value: 'other', label: 'Other', icon: 'Box' },
];

export const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const TASK_PRIORITIES: { value: TaskPriority; label: string; order: number }[] = [
  { value: 'urgent', label: 'Urgent', order: 0 },
  { value: 'high', label: 'High', order: 1 },
  { value: 'medium', label: 'Medium', order: 2 },
  { value: 'low', label: 'Low', order: 3 },
];

export function isCaseClosed(c: Pick<Case, 'status'>): boolean {
  return c.status === 'closed' || c.status === 'false_positive';
}

export function isCaseOpen(c: Pick<Case, 'status'>): boolean {
  return !isCaseClosed(c);
}

export function severityOrder(s: CaseSeverity): number {
  switch (s) {
    case 'critical': return 0;
    case 'high': return 1;
    case 'medium': return 2;
    case 'low': return 3;
  }
}

export function priorityOrder(p: CasePriority): number {
  switch (p) {
    case 'p1': return 1;
    case 'p2': return 2;
    case 'p3': return 3;
    case 'p4': return 4;
    case 'p5': return 5;
  }
}

export function isTaskTerminal(t: Pick<Task, 'status'>): boolean {
  return t.status === 'done' || t.status === 'cancelled';
}

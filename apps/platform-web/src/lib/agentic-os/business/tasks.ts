/**
 * Business OS Phase 3 — task domain types + pure helpers.
 *
 * DB calls live in `tasks-repo.ts`.
 *
 * @license MIT — Tiresias Business OS Phase 3 (internal).
 */

// ─── Constants ────────────────────────────────────────────────────────────

export const TASK_STATUSES = [
  'todo',
  'in_progress',
  'blocked',
  'done',
  'cancelled',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

// ─── Domain type ──────────────────────────────────────────────────────────

export interface Task {
  id: string;
  userId: string;
  projectId: string;
  title: string;
  descriptionMd: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeText: string | null;
  dueOn: string | null;
  completedAt: string | null;
  billingRateCents: number | null;
  isBillable: boolean;
  position: number;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─── Create / update inputs ───────────────────────────────────────────────

export interface CreateTaskInput {
  title: string;
  projectId: string;
  descriptionMd?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeText?: string | null;
  dueOn?: string | null;
  billingRateCents?: number | null;
  isBillable?: boolean;
  position?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export type UpdateTaskInput = Partial<{
  title: string;
  projectId: string;
  descriptionMd: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeText: string | null;
  dueOn: string | null;
  billingRateCents: number | null;
  isBillable: boolean;
  position: number;
  tags: string[];
  metadata: Record<string, unknown>;
}>;

// ─── List filter ──────────────────────────────────────────────────────────

export interface TasksListOpts {
  projectId: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueBefore?: string;
  dueAfter?: string;
  isBillable?: boolean;
  assigneeText?: string;
  tag?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

// ─── Validators ───────────────────────────────────────────────────────────

export function isValidTaskStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === 'string' &&
    (TASK_STATUSES as readonly string[]).includes(value)
  );
}

export function isValidTaskPriority(value: unknown): value is TaskPriority {
  return (
    typeof value === 'string' &&
    (TASK_PRIORITIES as readonly string[]).includes(value)
  );
}

export function validateTaskTitle(value: unknown): string | null {
  if (typeof value !== 'string') return 'must be a string';
  if (value.trim().length === 0) return 'cannot be empty';
  if (value.length > 300) return 'too long (max 300 chars)';
  return null;
}

/**
 * Returns true when a task is overdue — not done/cancelled and past its
 * due date.  A task without a `dueOn` is never overdue.
 */
export function isTaskOverdue(task: Task): boolean {
  if (!task.dueOn) return false;
  if (task.status === 'done' || task.status === 'cancelled') return false;
  const due = new Date(task.dueOn);
  due.setHours(23, 59, 59, 999); // end of due day
  return new Date() > due;
}

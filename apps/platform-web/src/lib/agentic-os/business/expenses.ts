/**
 * Business OS Phase 5 — expense domain types + pure helpers.
 *
 * DB calls live in `expenses-repo.ts`.
 *
 * @license MIT — Tiresias Business OS Phase 5 (internal).
 */

// ─── Constants ────────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = [
  'general',
  'software',
  'hardware',
  'travel',
  'meals',
  'marketing',
  'contractor',
  'office',
  'utilities',
  'insurance',
  'professional_services',
  'education',
  'taxes',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

// ─── Domain type ──────────────────────────────────────────────────────────

export interface Expense {
  id: string;
  userId: string;
  projectId: string | null;
  category: ExpenseCategory;
  vendor: string | null;
  description: string;
  amountCents: number;
  currency: string;
  incurredOn: string;
  paidOn: string | null;
  receiptUrl: string | null;
  isReimbursable: boolean;
  reimbursedAt: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─── Create / update inputs ───────────────────────────────────────────────

export interface CreateExpenseInput {
  projectId?: string | null;
  category?: ExpenseCategory;
  vendor?: string | null;
  description?: string;
  amountCents: number;
  currency?: string;
  incurredOn: string;
  paidOn?: string | null;
  receiptUrl?: string | null;
  isReimbursable?: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export type UpdateExpenseInput = Partial<{
  projectId: string | null;
  category: ExpenseCategory;
  vendor: string | null;
  description: string;
  amountCents: number;
  currency: string;
  incurredOn: string;
  paidOn: string | null;
  receiptUrl: string | null;
  isReimbursable: boolean;
  tags: string[];
  metadata: Record<string, unknown>;
}>;

// ─── List filter ──────────────────────────────────────────────────────────

export interface ExpensesListOpts {
  category?: ExpenseCategory | ExpenseCategory[];
  projectId?: string;
  from?: string;
  to?: string;
  tag?: string;
  reimbursable?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}

// ─── Validators ───────────────────────────────────────────────────────────

export function isValidExpenseCategory(
  value: unknown,
): value is ExpenseCategory {
  return (
    typeof value === 'string' &&
    (EXPENSE_CATEGORIES as readonly string[]).includes(value)
  );
}

export function validateExpenseDescription(value: unknown): string | null {
  if (typeof value !== 'string') return 'must be a string';
  if (value.length > 500) return 'too long (max 500 chars)';
  return null;
}

export function validateExpenseAmount(value: unknown): string | null {
  if (typeof value !== 'number') return 'must be a number';
  if (!Number.isFinite(value)) return 'must be finite';
  if (value <= 0) return 'must be positive';
  if (!Number.isSafeInteger(value)) return 'must be a safe integer (cents)';
  return null;
}

export function validateExpenseVendor(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return 'must be a string';
  if (value.length > 300) return 'too long (max 300 chars)';
  return null;
}

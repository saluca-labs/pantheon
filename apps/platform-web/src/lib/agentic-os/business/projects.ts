/**
 * Business OS Phase 3 — project domain types + pure helpers.
 *
 * DB calls live in `projects-repo.ts`.
 *
 * @license MIT — Tiresias Business OS Phase 3 (internal).
 */

// ─── Constants ────────────────────────────────────────────────────────────

export const PROJECT_STATUSES = [
  'proposed',
  'active',
  'on_hold',
  'completed',
  'cancelled',
  'archived',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const BILLING_MODELS = [
  'hourly',
  'fixed',
  'retainer',
  'milestone',
  'free',
] as const;

export type BillingModel = (typeof BILLING_MODELS)[number];

// ─── Domain type ──────────────────────────────────────────────────────────

export interface Project {
  id: string;
  userId: string;
  contactId: string | null;
  dealId: string | null;
  title: string;
  slug: string;
  descriptionMd: string;
  status: ProjectStatus;
  billingModel: BillingModel;
  defaultRateCents: number | null;
  budgetCents: number | null;
  currency: string;
  startDate: string | null;
  targetCompletionDate: string | null;
  coverImageUrl: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Create / update inputs ───────────────────────────────────────────────

export interface CreateProjectInput {
  title: string;
  slug: string;
  contactId?: string | null;
  dealId?: string | null;
  descriptionMd?: string;
  status?: ProjectStatus;
  billingModel?: BillingModel;
  defaultRateCents?: number | null;
  budgetCents?: number | null;
  currency?: string;
  startDate?: string | null;
  targetCompletionDate?: string | null;
  coverImageUrl?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export type UpdateProjectInput = Partial<{
  title: string;
  slug: string;
  contactId: string | null;
  dealId: string | null;
  descriptionMd: string;
  status: ProjectStatus;
  billingModel: BillingModel;
  defaultRateCents: number | null;
  budgetCents: number | null;
  currency: string;
  startDate: string | null;
  targetCompletionDate: string | null;
  coverImageUrl: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
}>;

// ─── List filter ──────────────────────────────────────────────────────────

export interface ProjectsListOpts {
  archived?: boolean;
  status?: ProjectStatus | ProjectStatus[];
  billingModel?: BillingModel;
  contactId?: string;
  dealId?: string;
  tag?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

// ─── Validators ───────────────────────────────────────────────────────────

export function isValidProjectStatus(value: unknown): value is ProjectStatus {
  return (
    typeof value === 'string' &&
    (PROJECT_STATUSES as readonly string[]).includes(value)
  );
}

export function isValidBillingModel(value: unknown): value is BillingModel {
  return (
    typeof value === 'string' &&
    (BILLING_MODELS as readonly string[]).includes(value)
  );
}

export function validateProjectTitle(value: unknown): string | null {
  if (typeof value !== 'string') return 'must be a string';
  if (value.trim().length === 0) return 'cannot be empty';
  if (value.length > 200) return 'too long (max 200 chars)';
  return null;
}

export function validateProjectSlug(value: unknown): string | null {
  if (typeof value !== 'string') return 'must be a string';
  if (value.trim().length === 0) return 'cannot be empty';
  if (value.length > 120) return 'too long (max 120 chars)';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))
    return 'must be lowercase alphanumeric with hyphens (e.g. "my-project")';
  return null;
}

/**
 * Generate a URL-safe slug from a title string.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

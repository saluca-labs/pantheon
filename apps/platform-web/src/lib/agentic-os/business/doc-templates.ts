/**
 * Business OS Phase 6 — document template domain types + pure helpers.
 *
 * DB calls live in `doc-templates-repo.ts`.
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

// ─── Constants ────────────────────────────────────────────────────────────

export const DOC_TEMPLATE_KINDS = [
  'nda',
  'sow',
  'msa',
  'proposal',
  '1099',
  'invoice_terms',
  'other',
] as const;

export type DocTemplateKind = (typeof DOC_TEMPLATE_KINDS)[number];

// ─── Domain type ──────────────────────────────────────────────────────────

export interface DocTemplate {
  id: string;
  userId: string;
  title: string;
  kind: DocTemplateKind;
  bodyMd: string;
  version: string;
  parentTemplateId: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─── Create / update inputs ───────────────────────────────────────────────

export interface CreateDocTemplateInput {
  title: string;
  kind?: DocTemplateKind;
  bodyMd?: string;
  version?: string;
  parentTemplateId?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export type UpdateDocTemplateInput = Partial<{
  title: string;
  kind: DocTemplateKind;
  bodyMd: string;
  version: string;
  tags: string[];
  metadata: Record<string, unknown>;
}>;

// ─── List filter ──────────────────────────────────────────────────────────

export interface DocTemplatesListOpts {
  kind?: DocTemplateKind;
  q?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

// ─── Validators ───────────────────────────────────────────────────────────

export function isValidDocTemplateKind(
  value: unknown,
): value is DocTemplateKind {
  return (
    typeof value === 'string' &&
    (DOC_TEMPLATE_KINDS as readonly string[]).includes(value)
  );
}

export function validateTemplateTitle(value: unknown): string | null {
  if (typeof value !== 'string') return 'must be a string';
  if (value.trim().length === 0) return 'cannot be empty';
  if (value.length > 300) return 'too long (max 300 chars)';
  return null;
}

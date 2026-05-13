/**
 * Business OS Phase 6 — document domain types + pure helpers.
 *
 * DB calls live in `documents-repo.ts`.
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

// ─── Constants ────────────────────────────────────────────────────────────

export const DOCUMENT_STATUSES = [
  'draft',
  'sent',
  'signed',
  'declined',
  'expired',
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

// ─── Domain type ──────────────────────────────────────────────────────────

export interface BusinessDocument {
  id: string;
  userId: string;
  templateId: string | null;
  projectId: string | null;
  dealId: string | null;
  contactId: string | null;
  title: string;
  bodyMd: string;
  status: DocumentStatus;
  sentAt: string | null;
  signedAt: string | null;
  pdfUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────

/**
 * Substitutes {{var}} patterns in a template body.
 * Supported vars: client_name, project_title, rate, total.
 * Unmatched patterns are left as-is.
 */
export function substituteTemplateVars(
  body: string,
  vars: Record<string, string>,
): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// ─── Create / update inputs ───────────────────────────────────────────────

export interface CreateDocumentInput {
  title: string;
  templateId?: string | null;
  projectId?: string | null;
  dealId?: string | null;
  contactId?: string | null;
  bodyMd?: string;
}

export type UpdateDocumentInput = Partial<{
  title: string;
  bodyMd: string;
  contactId: string | null;
  projectId: string | null;
  dealId: string | null;
  metadata: Record<string, unknown>;
}>;

// ─── List filter ──────────────────────────────────────────────────────────

export interface DocumentsListOpts {
  status?: DocumentStatus;
  kind?: string;
  projectId?: string;
  dealId?: string;
  contactId?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

// ─── Validators ───────────────────────────────────────────────────────────

export function isValidDocumentStatus(
  value: unknown,
): value is DocumentStatus {
  return (
    typeof value === 'string' &&
    (DOCUMENT_STATUSES as readonly string[]).includes(value)
  );
}

export function validateDocumentTitle(value: unknown): string | null {
  if (typeof value !== 'string') return 'must be a string';
  if (value.trim().length === 0) return 'cannot be empty';
  if (value.length > 300) return 'too long (max 300 chars)';
  return null;
}

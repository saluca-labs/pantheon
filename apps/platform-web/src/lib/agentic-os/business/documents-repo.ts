/**
 * Business OS Phase 6 — documents DB repository.
 *
 * Cross-ownership contract: every read / write filters by `user_id`
 * directly. A document id belonging to another user returns null on get /
 * update / delete.
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getBusinessPool } from './session';
import { getTemplate } from './doc-templates-repo';
import {
  DOCUMENT_STATUSES,
  substituteTemplateVars,
  type BusinessDocument,
  type DocumentStatus,
  type CreateDocumentInput,
  type UpdateDocumentInput,
  type DocumentsListOpts,
} from './documents';

const COLUMNS = `id, user_id, template_id, project_id, deal_id, contact_id,
                  title, body_md, status, sent_at, signed_at, pdf_url,
                  metadata, created_at, updated_at`;

// ─── Row mapper ───────────────────────────────────────────────────────────

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function toIsoOrNull(v: unknown): string | null {
  if (v == null) return null;
  return toIso(v);
}

function rowToDocument(row: any): BusinessDocument {
  return {
    id: row.id,
    userId: row.user_id,
    templateId: row.template_id ?? null,
    projectId: row.project_id ?? null,
    dealId: row.deal_id ?? null,
    contactId: row.contact_id ?? null,
    title: row.title ?? '',
    bodyMd: row.body_md ?? '',
    status: row.status as DocumentStatus,
    sentAt: toIsoOrNull(row.sent_at),
    signedAt: toIsoOrNull(row.signed_at),
    pdfUrl: row.pdf_url ?? null,
    metadata: row.metadata ?? {} as Record<string, unknown>,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── List ─────────────────────────────────────────────────────────────────

export async function listDocuments(
  userId: string,
  opts: DocumentsListOpts = {},
): Promise<BusinessDocument[]> {
  const pool = getBusinessPool();
  const clauses: string[] = ['d.user_id = $1'];
  const params: any[] = [userId];
  let idx = 2;

  if (opts.status) {
    clauses.push(`d.status = $${idx++}`);
    params.push(opts.status);
  }
  if (opts.projectId) {
    clauses.push(`d.project_id = $${idx++}`);
    params.push(opts.projectId);
  }
  if (opts.dealId) {
    clauses.push(`d.deal_id = $${idx++}`);
    params.push(opts.dealId);
  }
  if (opts.contactId) {
    clauses.push(`d.contact_id = $${idx++}`);
    params.push(opts.contactId);
  }
  if (opts.kind) {
    clauses.push(
      `EXISTS (SELECT 1 FROM agos_business_doc_templates t WHERE t.id = d.template_id AND t.kind = $${idx})`
    );
    params.push(opts.kind);
    idx++;
  }
  if (opts.q) {
    clauses.push(`d.title ILIKE $${idx}`);
    params.push(`%${opts.q}%`);
    idx++;
  }

  const where = clauses.join(' AND ');
  const limit = opts.limit ?? 200;
  const offset = opts.offset ?? 0;

  const sql = `SELECT d.* FROM agos_business_documents d
               WHERE ${where}
               ORDER BY d.updated_at DESC
               LIMIT $${idx} OFFSET $${idx + 1}`;
  params.push(limit, offset);

  const { rows } = await pool.query(sql, params);
  return rows.map(rowToDocument);
}

// ─── Get ──────────────────────────────────────────────────────────────────

export async function getDocument(
  id: string,
  userId: string,
): Promise<BusinessDocument | null> {
  const pool = getBusinessPool();
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM agos_business_documents
     WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return rows.length > 0 ? rowToDocument(rows[0]) : null;
}

// ─── Create ───────────────────────────────────────────────────────────────

export async function createDocument(
  userId: string,
  input: CreateDocumentInput,
): Promise<BusinessDocument> {
  const pool = getBusinessPool();
  const id = randomUUID();

  let bodyMd = input.bodyMd ?? '';

  // If a template is referenced, load it and apply variable substitution
  if (input.templateId) {
    const template = await getTemplate(input.templateId, userId);
    if (template) {
      bodyMd = bodyMd || template.bodyMd;
      // Apply substitution with empty vars (caller can override via bodyMd or later edits)
      bodyMd = substituteTemplateVars(bodyMd, {});
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO agos_business_documents
       (id, user_id, template_id, project_id, deal_id, contact_id, title, body_md, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${COLUMNS}`,
    [
      id,
      userId,
      input.templateId ?? null,
      input.projectId ?? null,
      input.dealId ?? null,
      input.contactId ?? null,
      input.title,
      bodyMd,
      JSON.stringify({}),
    ],
  );

  return rowToDocument(rows[0]);
}

// ─── Update ───────────────────────────────────────────────────────────────

export async function updateDocument(
  id: string,
  userId: string,
  patch: UpdateDocumentInput,
): Promise<
  | { kind: 'ok'; doc: BusinessDocument }
  | { kind: 'not_found' }
  | { kind: 'not_draft'; reason: string }
> {
  const existing = await getDocument(id, userId);
  if (!existing) return { kind: 'not_found' };
  if (existing.status !== 'draft') {
    return {
      kind: 'not_draft',
      reason: `Document is in '${existing.status}' status. Only draft documents can be edited.`,
    };
  }

  const pool = getBusinessPool();
  const setClauses: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (patch.title !== undefined) {
    setClauses.push(`title = $${idx++}`);
    params.push(patch.title);
  }
  if (patch.bodyMd !== undefined) {
    setClauses.push(`body_md = $${idx++}`);
    params.push(patch.bodyMd);
  }
  if (patch.contactId !== undefined) {
    setClauses.push(`contact_id = $${idx++}`);
    params.push(patch.contactId);
  }
  if (patch.projectId !== undefined) {
    setClauses.push(`project_id = $${idx++}`);
    params.push(patch.projectId);
  }
  if (patch.dealId !== undefined) {
    setClauses.push(`deal_id = $${idx++}`);
    params.push(patch.dealId);
  }
  if (patch.metadata !== undefined) {
    setClauses.push(`metadata = $${idx++}`);
    params.push(JSON.stringify(patch.metadata));
  }

  if (setClauses.length === 0) return { kind: 'ok', doc: existing };

  setClauses.push(`updated_at = now()`);
  params.push(id, userId);

  const { rows } = await pool.query(
    `UPDATE agos_business_documents
     SET ${setClauses.join(', ')}
     WHERE id = $${idx} AND user_id = $${idx + 1}
     RETURNING ${COLUMNS}`,
    params,
  );

  return { kind: 'ok', doc: rowToDocument(rows[0]) };
}

// ─── Delete ───────────────────────────────────────────────────────────────

export async function deleteDocument(
  id: string,
  userId: string,
): Promise<{ kind: 'ok' } | { kind: 'not_found' }> {
  const pool = getBusinessPool();
  const { rowCount } = await pool.query(
    `DELETE FROM agos_business_documents WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if (rowCount === 0) return { kind: 'not_found' };
  return { kind: 'ok' };
}

// ─── Send ─────────────────────────────────────────────────────────────────

export async function sendDocument(
  id: string,
  userId: string,
): Promise<
  | { kind: 'ok'; doc: BusinessDocument }
  | { kind: 'not_found' }
  | { kind: 'invalid_transition'; reason: string }
> {
  const existing = await getDocument(id, userId);
  if (!existing) return { kind: 'not_found' };
  if (existing.status !== 'draft') {
    return {
      kind: 'invalid_transition',
      reason: `Cannot send a document in '${existing.status}' status. Only draft documents can be sent.`,
    };
  }

  const pool = getBusinessPool();
  const { rows } = await pool.query(
    `UPDATE agos_business_documents
     SET status = 'sent', sent_at = now(), updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING ${COLUMNS}`,
    [id, userId],
  );

  return { kind: 'ok', doc: rowToDocument(rows[0]) };
}

// ─── Sign ─────────────────────────────────────────────────────────────────

export async function signDocument(
  id: string,
  userId: string,
): Promise<
  | { kind: 'ok'; doc: BusinessDocument }
  | { kind: 'not_found' }
  | { kind: 'invalid_transition'; reason: string }
> {
  const existing = await getDocument(id, userId);
  if (!existing) return { kind: 'not_found' };
  if (existing.status !== 'sent') {
    return {
      kind: 'invalid_transition',
      reason: `Cannot sign a document in '${existing.status}' status. Only sent documents can be signed.`,
    };
  }

  const pool = getBusinessPool();
  const { rows } = await pool.query(
    `UPDATE agos_business_documents
     SET status = 'signed', signed_at = now(), updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING ${COLUMNS}`,
    [id, userId],
  );

  return { kind: 'ok', doc: rowToDocument(rows[0]) };
}

// ─── Decline ──────────────────────────────────────────────────────────────

export async function declineDocument(
  id: string,
  userId: string,
): Promise<
  | { kind: 'ok'; doc: BusinessDocument }
  | { kind: 'not_found' }
  | { kind: 'invalid_transition'; reason: string }
> {
  const existing = await getDocument(id, userId);
  if (!existing) return { kind: 'not_found' };
  if (existing.status !== 'sent') {
    return {
      kind: 'invalid_transition',
      reason: `Cannot decline a document in '${existing.status}' status. Only sent documents can be declined.`,
    };
  }

  const pool = getBusinessPool();
  const { rows } = await pool.query(
    `UPDATE agos_business_documents
     SET status = 'declined', updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING ${COLUMNS}`,
    [id, userId],
  );

  return { kind: 'ok', doc: rowToDocument(rows[0]) };
}

// ─── Set PDF URL ──────────────────────────────────────────────────────────

export async function setDocumentPdfUrl(
  id: string,
  userId: string,
  pdfUrl: string,
): Promise<BusinessDocument | null> {
  const pool = getBusinessPool();
  const { rows } = await pool.query(
    `UPDATE agos_business_documents
     SET pdf_url = $1, updated_at = now()
     WHERE id = $2 AND user_id = $3
     RETURNING ${COLUMNS}`,
    [pdfUrl, id, userId],
  );
  return rows.length > 0 ? rowToDocument(rows[0]) : null;
}

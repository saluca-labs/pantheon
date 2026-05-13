/**
 * Business OS Phase 6 — document templates DB repository.
 *
 * Cross-ownership contract: every read / write filters by `user_id`
 * directly. A template id belonging to another user returns null on get /
 * update / delete.
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getBusinessPool } from './session';
import {
  DOC_TEMPLATE_KINDS,
  type DocTemplate,
  type DocTemplateKind,
  type CreateDocTemplateInput,
  type UpdateDocTemplateInput,
  type DocTemplatesListOpts,
} from './doc-templates';

const COLUMNS = `id, user_id, title, kind, body_md, version,
                  parent_template_id, tags, metadata, created_at, updated_at`;

// ─── Row mapper ───────────────────────────────────────────────────────────

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function rowToTemplate(row: any): DocTemplate {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title ?? '',
    kind: row.kind as DocTemplateKind,
    bodyMd: row.body_md ?? '',
    version: row.version ?? '1.0',
    parentTemplateId: row.parent_template_id ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    metadata: row.metadata ?? {} as Record<string, unknown>,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── List ─────────────────────────────────────────────────────────────────

export async function listTemplates(
  userId: string,
  opts: DocTemplatesListOpts = {},
): Promise<DocTemplate[]> {
  const pool = getBusinessPool();
  const clauses: string[] = ['user_id = $1'];
  const params: any[] = [userId];
  let idx = 2;

  if (opts.kind) {
    clauses.push(`kind = $${idx++}`);
    params.push(opts.kind);
  }
  if (opts.tag) {
    clauses.push(`tags @> ARRAY[$${idx++}]::text[]`);
    params.push(opts.tag);
  }
  if (opts.q) {
    clauses.push(`(title ILIKE $${idx} OR body_md ILIKE $${idx})`);
    params.push(`%${opts.q}%`);
    idx++;
  }

  const where = clauses.join(' AND ');
  const limit = opts.limit ?? 200;
  const offset = opts.offset ?? 0;

  const sql = `SELECT ${COLUMNS} FROM agos_business_doc_templates
               WHERE ${where}
               ORDER BY updated_at DESC
               LIMIT $${idx} OFFSET $${idx + 1}`;
  params.push(limit, offset);

  const { rows } = await pool.query(sql, params);
  return rows.map(rowToTemplate);
}

// ─── Get ──────────────────────────────────────────────────────────────────

export async function getTemplate(
  id: string,
  userId: string,
): Promise<DocTemplate | null> {
  const pool = getBusinessPool();
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM agos_business_doc_templates
     WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return rows.length > 0 ? rowToTemplate(rows[0]) : null;
}

// ─── Create ───────────────────────────────────────────────────────────────

export async function createTemplate(
  userId: string,
  input: CreateDocTemplateInput,
): Promise<DocTemplate> {
  const pool = getBusinessPool();
  const id = randomUUID();

  const { rows } = await pool.query(
    `INSERT INTO agos_business_doc_templates
       (id, user_id, title, kind, body_md, version, parent_template_id, tags, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${COLUMNS}`,
    [
      id,
      userId,
      input.title,
      input.kind ?? 'sow',
      input.bodyMd ?? '',
      input.version ?? '1.0',
      input.parentTemplateId ?? null,
      input.tags ?? [],
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  return rowToTemplate(rows[0]);
}

// ─── Update ───────────────────────────────────────────────────────────────

export async function updateTemplate(
  id: string,
  userId: string,
  patch: UpdateDocTemplateInput,
): Promise<{ kind: 'ok'; template: DocTemplate } | { kind: 'not_found' }> {
  const pool = getBusinessPool();
  const existing = await getTemplate(id, userId);
  if (!existing) return { kind: 'not_found' };

  const setClauses: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (patch.title !== undefined) {
    setClauses.push(`title = $${idx++}`);
    params.push(patch.title);
  }
  if (patch.kind !== undefined) {
    setClauses.push(`kind = $${idx++}`);
    params.push(patch.kind);
  }
  if (patch.bodyMd !== undefined) {
    setClauses.push(`body_md = $${idx++}`);
    params.push(patch.bodyMd);
  }
  if (patch.version !== undefined) {
    setClauses.push(`version = $${idx++}`);
    params.push(patch.version);
  }
  if (patch.tags !== undefined) {
    setClauses.push(`tags = $${idx++}`);
    params.push(patch.tags);
  }
  if (patch.metadata !== undefined) {
    setClauses.push(`metadata = $${idx++}`);
    params.push(JSON.stringify(patch.metadata));
  }

  if (setClauses.length === 0) return { kind: 'ok', template: existing };

  setClauses.push(`updated_at = now()`);
  params.push(id, userId);

  const { rows } = await pool.query(
    `UPDATE agos_business_doc_templates
     SET ${setClauses.join(', ')}
     WHERE id = $${idx} AND user_id = $${idx + 1}
     RETURNING ${COLUMNS}`,
    params,
  );

  return { kind: 'ok', template: rowToTemplate(rows[0]) };
}

// ─── Delete ───────────────────────────────────────────────────────────────

export async function deleteTemplate(
  id: string,
  userId: string,
): Promise<{ kind: 'ok' } | { kind: 'not_found' }> {
  const pool = getBusinessPool();
  const { rowCount } = await pool.query(
    `DELETE FROM agos_business_doc_templates WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if (rowCount === 0) return { kind: 'not_found' };
  return { kind: 'ok' };
}

// ─── Bump version ─────────────────────────────────────────────────────────

export async function bumpVersion(
  id: string,
  userId: string,
  newVersion?: string,
  bodyMd?: string,
): Promise<DocTemplate | null> {
  const pool = getBusinessPool();
  const existing = await getTemplate(id, userId);
  if (!existing) return null;

  const currentVersion = parseFloat(existing.version) || 0;
  const bumpedVersion = newVersion ?? String((currentVersion + 1).toFixed(1));
  const newBodyMd = bodyMd ?? existing.bodyMd;

  const newId = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO agos_business_doc_templates
       (id, user_id, title, kind, body_md, version, parent_template_id, tags, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${COLUMNS}`,
    [
      newId,
      userId,
      existing.title,
      existing.kind,
      newBodyMd,
      bumpedVersion,
      id,
      existing.tags,
      JSON.stringify(existing.metadata),
    ],
  );

  return rowToTemplate(rows[0]);
}

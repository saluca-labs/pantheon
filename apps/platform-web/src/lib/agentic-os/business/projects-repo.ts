/**
 * Business OS Phase 3 — projects DB repository.
 *
 * Cross-ownership contract: every read / write filters by `user_id`
 * directly. A project id belonging to another user returns null on get /
 * update / archive / restore.
 *
 * @license MIT — Tiresias Business OS Phase 3 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getBusinessPool } from './session';
import {
  PROJECT_STATUSES,
  type Project,
  type ProjectStatus,
  type BillingModel,
  type CreateProjectInput,
  type UpdateProjectInput,
  type ProjectsListOpts,
  slugify,
} from './projects';

const PROJECT_COLUMNS = `id, user_id, contact_id, deal_id, title, slug,
                           description_md, status, billing_model,
                           default_rate_cents, budget_cents, currency,
                           start_date, target_completion_date, cover_image_url,
                           tags, metadata, archived_at, created_at, updated_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function toIsoOrNull(v: unknown): string | null {
  if (v == null) return null;
  return toIso(v);
}

function parseDateOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string') return v.slice(0, 10);
  return null;
}

interface RawProjectRow {
  id: string;
  user_id: string;
  contact_id: string | null;
  deal_id: string | null;
  title: string;
  slug: string;
  description_md: string | null;
  status: string;
  billing_model: string;
  default_rate_cents: number | string | null;
  budget_cents: number | string | null;
  currency: string | null;
  start_date: Date | string | null;
  target_completion_date: Date | string | null;
  cover_image_url: string | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  archived_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function rowToProject(row: RawProjectRow): Project {
  return {
    id: row.id,
    userId: row.user_id,
    contactId: row.contact_id ?? null,
    dealId: row.deal_id ?? null,
    title: row.title,
    slug: row.slug,
    descriptionMd: row.description_md ?? '',
    status: row.status as ProjectStatus,
    billingModel: row.billing_model as BillingModel,
    defaultRateCents:
      row.default_rate_cents != null ? Number(row.default_rate_cents) : null,
    budgetCents: row.budget_cents != null ? Number(row.budget_cents) : null,
    currency: row.currency ?? 'USD',
    startDate: parseDateOrNull(row.start_date),
    targetCompletionDate: parseDateOrNull(row.target_completion_date),
    coverImageUrl: row.cover_image_url ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    archivedAt: toIsoOrNull(row.archived_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── List ─────────────────────────────────────────────────────────────────

export async function listProjects(
  userId: string,
  opts: ProjectsListOpts = {},
): Promise<Project[]> {
  const pool = getBusinessPool();
  const params: unknown[] =[userId];
  const where: string[] = [`user_id = $1`];

  if (opts.archived === true) {
    where.push(`archived_at IS NOT NULL`);
  } else {
    where.push(`archived_at IS NULL`);
  }

  if (opts.status) {
    const statuses = Array.isArray(opts.status) ? opts.status : [opts.status];
    const placeholders = statuses.map(() => {
      params.push(null);
      return `$${params.length}`;
    });
    params.splice(
      params.length - statuses.length,
      statuses.length,
      ...statuses,
    );
    where.push(`status IN (${placeholders.join(', ')})`);
  }

  if (opts.billingModel) {
    params.push(opts.billingModel);
    where.push(`billing_model = $${params.length}`);
  }

  if (opts.contactId) {
    params.push(opts.contactId);
    where.push(`contact_id = $${params.length}`);
  }

  if (opts.dealId) {
    params.push(opts.dealId);
    where.push(`deal_id = $${params.length}`);
  }

  if (opts.tag && opts.tag.trim()) {
    params.push(opts.tag.trim().toLowerCase());
    where.push(`$${params.length} = ANY(tags)`);
  }

  if (opts.q && opts.q.trim()) {
    params.push(`%${opts.q.trim().toLowerCase()}%`);
    where.push(
      `(LOWER(title) LIKE $${params.length}
        OR LOWER(COALESCE(description_md, '')) LIKE $${params.length})`,
    );
  }

  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${PROJECT_COLUMNS}
       FROM agos_business_projects
      WHERE ${where.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToProject);
}

// ─── Get one ──────────────────────────────────────────────────────────────

export async function getProject(
  id: string,
  userId: string,
): Promise<Project | null> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT ${PROJECT_COLUMNS}
       FROM agos_business_projects
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToProject(r.rows[0]);
}

export async function getProjectBySlug(
  slug: string,
  userId: string,
): Promise<Project | null> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT ${PROJECT_COLUMNS}
       FROM agos_business_projects
      WHERE slug = $1 AND user_id = $2
      LIMIT 1`,
    [slug, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToProject(r.rows[0]);
}

// ─── Create ───────────────────────────────────────────────────────────────

export async function createProject(
  userId: string,
  data: CreateProjectInput,
): Promise<Project> {
  const pool = getBusinessPool();
  const id = randomUUID();
  const resolvedSlug = data.slug || slugify(data.title);
  await pool.query(
    `INSERT INTO agos_business_projects
       (id, user_id, contact_id, deal_id, title, slug, description_md,
        status, billing_model, default_rate_cents, budget_cents, currency,
        start_date, target_completion_date, cover_image_url, tags, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::text[],$17::jsonb)`,
    [
      id,
      userId,
      data.contactId ?? null,
      data.dealId ?? null,
      data.title,
      resolvedSlug,
      data.descriptionMd ?? '',
      data.status ?? 'active',
      data.billingModel ?? 'hourly',
      data.defaultRateCents ?? null,
      data.budgetCents ?? null,
      data.currency ?? 'USD',
      data.startDate ?? null,
      data.targetCompletionDate ?? null,
      data.coverImageUrl ?? null,
      data.tags ?? [],
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const after = await getProject(id, userId);
  if (!after) throw new Error('Failed to create project');
  return after;
}

// ─── Update ───────────────────────────────────────────────────────────────

export type UpdateProjectOutcome =
  | { kind: 'ok'; project: Project }
  | { kind: 'not_found' };

export async function updateProject(
  id: string,
  userId: string,
  patch: UpdateProjectInput,
): Promise<UpdateProjectOutcome> {
  const pool = getBusinessPool();
  const set: string[] = [];
  const params: unknown[] =[id, userId];
  let n = 2;

  if (patch.title !== undefined) {
    params.push(patch.title);
    n += 1;
    set.push(`title = $${n}`);
  }
  if (patch.slug !== undefined) {
    params.push(patch.slug);
    n += 1;
    set.push(`slug = $${n}`);
  }
  if (patch.contactId !== undefined) {
    params.push(patch.contactId);
    n += 1;
    set.push(`contact_id = $${n}`);
  }
  if (patch.dealId !== undefined) {
    params.push(patch.dealId);
    n += 1;
    set.push(`deal_id = $${n}`);
  }
  if (patch.descriptionMd !== undefined) {
    params.push(patch.descriptionMd);
    n += 1;
    set.push(`description_md = $${n}`);
  }
  if (patch.status !== undefined) {
    params.push(patch.status);
    n += 1;
    set.push(`status = $${n}`);
  }
  if (patch.billingModel !== undefined) {
    params.push(patch.billingModel);
    n += 1;
    set.push(`billing_model = $${n}`);
  }
  if (patch.defaultRateCents !== undefined) {
    params.push(patch.defaultRateCents);
    n += 1;
    set.push(`default_rate_cents = $${n}`);
  }
  if (patch.budgetCents !== undefined) {
    params.push(patch.budgetCents);
    n += 1;
    set.push(`budget_cents = $${n}`);
  }
  if (patch.currency !== undefined) {
    params.push(patch.currency);
    n += 1;
    set.push(`currency = $${n}`);
  }
  if (patch.startDate !== undefined) {
    params.push(patch.startDate);
    n += 1;
    set.push(`start_date = $${n}`);
  }
  if (patch.targetCompletionDate !== undefined) {
    params.push(patch.targetCompletionDate);
    n += 1;
    set.push(`target_completion_date = $${n}`);
  }
  if (patch.coverImageUrl !== undefined) {
    params.push(patch.coverImageUrl);
    n += 1;
    set.push(`cover_image_url = $${n}`);
  }
  if (patch.tags !== undefined) {
    params.push(patch.tags);
    n += 1;
    set.push(`tags = $${n}::text[]`);
  }
  if (patch.metadata !== undefined) {
    params.push(JSON.stringify(patch.metadata));
    n += 1;
    set.push(`metadata = $${n}::jsonb`);
  }

  if (set.length === 0) {
    const current = await getProject(id, userId);
    return current
      ? { kind: 'ok', project: current }
      : { kind: 'not_found' };
  }

  set.push(`updated_at = now()`);

  const r = await pool.query(
    `UPDATE agos_business_projects
        SET ${set.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    params,
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };
  const after = await getProject(id, userId);
  if (!after) return { kind: 'not_found' };
  return { kind: 'ok', project: after };
}

// ─── Archive / restore ────────────────────────────────────────────────────

export async function archiveProject(
  id: string,
  userId: string,
): Promise<Project | null> {
  const pool = getBusinessPool();
  await pool.query(
    `UPDATE agos_business_projects
        SET archived_at = now(),
            updated_at  = now()
      WHERE id = $1 AND user_id = $2
        AND archived_at IS NULL`,
    [id, userId],
  );
  return getProject(id, userId);
}

export async function restoreProject(
  id: string,
  userId: string,
): Promise<
  | { project: Project; alreadyActive: false }
  | { project: Project; alreadyActive: true }
  | null
> {
  const before = await getProject(id, userId);
  if (!before) return null;
  if (before.archivedAt == null) {
    return { project: before, alreadyActive: true };
  }
  const pool = getBusinessPool();
  await pool.query(
    `UPDATE agos_business_projects
        SET archived_at = NULL,
            updated_at  = now()
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  const after = await getProject(id, userId);
  if (!after) return null;
  return { project: after, alreadyActive: false };
}

// ─── Ownership check ──────────────────────────────────────────────────────

export async function validateProjectOwnership(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_business_projects
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

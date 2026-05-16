/**
 * Business OS Phase 2 — deals DB repository.
 *
 * Cross-ownership contract: every read / write filters by `user_id`
 * directly. A deal id belonging to another user returns null on get /
 * update / archive / restore.
 *
 * @license MIT — Tiresias Business OS Phase 2 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getBusinessPool } from './session';
import {
  DEAL_STAGES,
  type Deal,
  type DealStage,
  type CreateDealInput,
  type UpdateDealInput,
  type StageTransitionInput,
  type DealsListOpts,
} from './deals';

const DEAL_COLUMNS = `id, user_id, contact_id, organization_id, title,
                       description_md, stage, value_cents, currency,
                       probability_pct, expected_close_date, closed_at,
                       lost_reason, source, tags, metadata,
                       archived_at, created_at, updated_at`;

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

interface RawDealRow {
  id: string;
  user_id: string;
  contact_id: string | null;
  organization_id: string | null;
  title: string;
  description_md: string | null;
  stage: string;
  value_cents: number | string | null;
  currency: string | null;
  probability_pct: number | string | null;
  expected_close_date: Date | string | null;
  closed_at: Date | string | null;
  lost_reason: string | null;
  source: string | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  archived_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function rowToDeal(row: RawDealRow): Deal {
  return {
    id: row.id,
    userId: row.user_id,
    contactId: row.contact_id ?? null,
    organizationId: row.organization_id ?? null,
    title: row.title,
    descriptionMd: row.description_md ?? '',
    stage: row.stage as DealStage,
    valueCents: row.value_cents != null ? Number(row.value_cents) : null,
    currency: row.currency ?? 'USD',
    probabilityPct: Number(row.probability_pct ?? 50),
    expectedCloseDate: parseDateOrNull(row.expected_close_date),
    closedAt: toIsoOrNull(row.closed_at),
    lostReason: row.lost_reason ?? null,
    source: row.source ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    archivedAt: toIsoOrNull(row.archived_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── List ─────────────────────────────────────────────────────────────────

export async function listDeals(
  userId: string,
  opts: DealsListOpts = {},
): Promise<Deal[]> {
  const pool = getBusinessPool();
  const params: unknown[] = [userId];
  const where: string[] = [`user_id = $1`];

  if (opts.archived === true) {
    where.push(`archived_at IS NOT NULL`);
  } else {
    where.push(`archived_at IS NULL`);
  }

  if (opts.stage) {
    const stages = Array.isArray(opts.stage) ? opts.stage : [opts.stage];
    const placeholders = stages.map(() => {
      params.push(null);
      return `$${params.length}`;
    });
    params.splice(
      params.length - stages.length,
      stages.length,
      ...stages,
    );
    where.push(`stage IN (${placeholders.join(', ')})`);
  }

  if (opts.contactId) {
    params.push(opts.contactId);
    where.push(`contact_id = $${params.length}`);
  }

  if (opts.organizationId) {
    params.push(opts.organizationId);
    where.push(`organization_id = $${params.length}`);
  }

  if (opts.source && opts.source.trim()) {
    params.push(opts.source.trim().toLowerCase());
    where.push(`LOWER(COALESCE(source, '')) = $${params.length}`);
  }

  if (opts.tag && opts.tag.trim()) {
    params.push(opts.tag.trim().toLowerCase());
    where.push(`$${params.length} = ANY(tags)`);
  }

  if (opts.open === true) {
    where.push(`stage NOT IN ('won', 'lost')`);
  }

  if (opts.q && opts.q.trim()) {
    params.push(`%${opts.q.trim().toLowerCase()}%`);
    where.push(
      `(LOWER(title) LIKE $${params.length}
        OR LOWER(COALESCE(description_md, '')) LIKE $${params.length}
        OR LOWER(COALESCE(lost_reason, '')) LIKE $${params.length})`,
    );
  }

  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${DEAL_COLUMNS}
       FROM agos_business_deals
      WHERE ${where.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToDeal);
}

// ─── Get one ──────────────────────────────────────────────────────────────

export async function getDeal(id: string, userId: string): Promise<Deal | null> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT ${DEAL_COLUMNS}
       FROM agos_business_deals
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToDeal(r.rows[0]);
}

// ─── Create ───────────────────────────────────────────────────────────────

export async function createDeal(
  userId: string,
  data: CreateDealInput,
): Promise<Deal> {
  const pool = getBusinessPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_business_deals
       (id, user_id, contact_id, organization_id, title, description_md,
        stage, value_cents, currency, probability_pct, expected_close_date,
        source, tags, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::text[],$14::jsonb)`,
    [
      id,
      userId,
      data.contactId ?? null,
      data.organizationId ?? null,
      data.title,
      data.descriptionMd ?? '',
      data.stage ?? 'lead',
      data.valueCents ?? null,
      data.currency ?? 'USD',
      data.probabilityPct ?? 50,
      data.expectedCloseDate ?? null,
      data.source ?? null,
      data.tags ?? [],
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const after = await getDeal(id, userId);
  if (!after) throw new Error('Failed to create deal');
  return after;
}

// ─── Update ───────────────────────────────────────────────────────────────

export type UpdateDealOutcome =
  | { kind: 'ok'; deal: Deal }
  | { kind: 'not_found' };

export async function updateDeal(
  id: string,
  userId: string,
  patch: UpdateDealInput,
): Promise<UpdateDealOutcome> {
  const pool = getBusinessPool();
  const set: string[] = [];
  const params: unknown[] = [id, userId];
  let n = 2;

  if (patch.title !== undefined) {
    params.push(patch.title);
    n += 1;
    set.push(`title = $${n}`);
  }
  if (patch.contactId !== undefined) {
    params.push(patch.contactId);
    n += 1;
    set.push(`contact_id = $${n}`);
  }
  if (patch.organizationId !== undefined) {
    params.push(patch.organizationId);
    n += 1;
    set.push(`organization_id = $${n}`);
  }
  if (patch.descriptionMd !== undefined) {
    params.push(patch.descriptionMd);
    n += 1;
    set.push(`description_md = $${n}`);
  }
  if (patch.stage !== undefined) {
    params.push(patch.stage);
    n += 1;
    set.push(`stage = $${n}`);
  }
  if (patch.valueCents !== undefined) {
    params.push(patch.valueCents);
    n += 1;
    set.push(`value_cents = $${n}`);
  }
  if (patch.currency !== undefined) {
    params.push(patch.currency);
    n += 1;
    set.push(`currency = $${n}`);
  }
  if (patch.probabilityPct !== undefined) {
    params.push(patch.probabilityPct);
    n += 1;
    set.push(`probability_pct = $${n}`);
  }
  if (patch.expectedCloseDate !== undefined) {
    params.push(patch.expectedCloseDate);
    n += 1;
    set.push(`expected_close_date = $${n}`);
  }
  if (patch.lostReason !== undefined) {
    params.push(patch.lostReason);
    n += 1;
    set.push(`lost_reason = $${n}`);
  }
  if (patch.source !== undefined) {
    params.push(patch.source);
    n += 1;
    set.push(`source = $${n}`);
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
    const current = await getDeal(id, userId);
    return current ? { kind: 'ok', deal: current } : { kind: 'not_found' };
  }

  set.push(`updated_at = now()`);

  const r = await pool.query(
    `UPDATE agos_business_deals
        SET ${set.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    params,
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };
  const after = await getDeal(id, userId);
  if (!after) return { kind: 'not_found' };
  return { kind: 'ok', deal: after };
}

// ─── Stage transition ─────────────────────────────────────────────────────

export type StageTransitionOutcome =
  | { kind: 'ok'; deal: Deal }
  | { kind: 'not_found' }
  | { kind: 'invalid_transition'; reason: string };

export async function transitionDealStage(
  id: string,
  userId: string,
  data: StageTransitionInput,
): Promise<StageTransitionOutcome> {
  const before = await getDeal(id, userId);
  if (!before) return { kind: 'not_found' };

  if (before.stage === data.stage) {
    return {
      kind: 'invalid_transition',
      reason: `Deal is already in stage "${data.stage}"`,
    };
  }

  const pool = getBusinessPool();
  const now = new Date().toISOString();

  // Set closed_at when moving to terminal stages, clear it when reopening
  const terminalStages: DealStage[] = ['won', 'lost'];
  const closedAt =
    terminalStages.includes(data.stage)
      ? now
      : terminalStages.includes(before.stage)
        ? null
        : before.closedAt;

  const r = await pool.query(
    `UPDATE agos_business_deals
        SET stage = $3,
            closed_at = $4,
            updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [id, userId, data.stage, closedAt],
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };

  const after = await getDeal(id, userId);
  if (!after) return { kind: 'not_found' };
  return { kind: 'ok', deal: after };
}

// ─── Archive / restore ────────────────────────────────────────────────────

export async function archiveDeal(
  id: string,
  userId: string,
): Promise<Deal | null> {
  const pool = getBusinessPool();
  await pool.query(
    `UPDATE agos_business_deals
        SET archived_at = now(),
            updated_at  = now()
      WHERE id = $1 AND user_id = $2
        AND archived_at IS NULL`,
    [id, userId],
  );
  return getDeal(id, userId);
}

export async function restoreDeal(
  id: string,
  userId: string,
): Promise<
  | { deal: Deal; alreadyActive: false }
  | { deal: Deal; alreadyActive: true }
  | null
> {
  const before = await getDeal(id, userId);
  if (!before) return null;
  if (before.archivedAt == null) {
    return { deal: before, alreadyActive: true };
  }
  const pool = getBusinessPool();
  await pool.query(
    `UPDATE agos_business_deals
        SET archived_at = NULL,
            updated_at  = now()
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  const after = await getDeal(id, userId);
  if (!after) return null;
  return { deal: after, alreadyActive: false };
}

// ─── Ownership checks ─────────────────────────────────────────────────────

export async function validateDealOwnership(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_business_deals
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function validateContactOwnership(
  contactId: string,
  userId: string,
): Promise<boolean> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_business_people
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [contactId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function validateOrganizationOwnership(
  orgId: string,
  userId: string,
): Promise<boolean> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_business_orgs
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [orgId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

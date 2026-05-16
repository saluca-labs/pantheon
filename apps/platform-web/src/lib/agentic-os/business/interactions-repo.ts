/**
 * Business OS Phase 1 — interactions DB repository.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getBusinessPool } from './session';
import {
  INTERACTION_TYPES,
  type Interaction,
  type InteractionType,
  type CreateInteractionInput,
  type UpdateInteractionInput,
  type InteractionsListOpts,
} from './interactions';

const INTERACTION_COLUMNS = `id, user_id, person_id, organization_id, deal_id,
                             interaction_type, summary, occurred_at, created_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

interface RawInteractionRow {
  id: string;
  user_id: string;
  person_id: string | null;
  organization_id: string | null;
  deal_id: string | null;
  interaction_type: string;
  summary: string;
  occurred_at: Date | string;
  created_at: Date | string;
}

function rowToInteraction(row: RawInteractionRow): Interaction {
  return {
    id: row.id,
    userId: row.user_id,
    personId: row.person_id ?? null,
    organizationId: row.organization_id ?? null,
    dealId: row.deal_id ?? null,
    interactionType: row.interaction_type as InteractionType,
    summary: row.summary,
    occurredAt: toIso(row.occurred_at),
    createdAt: toIso(row.created_at),
  };
}

// ─── List ─────────────────────────────────────────────────────────────────

export async function listInteractions(
  userId: string,
  opts: InteractionsListOpts = {},
): Promise<Interaction[]> {
  const pool = getBusinessPool();
  const params: unknown[] =[userId];
  const where: string[] = [`user_id = $1`];

  if (opts.personId) {
    params.push(opts.personId);
    where.push(`person_id = $${params.length}`);
  }
  if (opts.organizationId) {
    params.push(opts.organizationId);
    where.push(`organization_id = $${params.length}`);
  }
  if (opts.dealId) {
    params.push(opts.dealId);
    where.push(`deal_id = $${params.length}`);
  }
  if (opts.interactionType) {
    if (!(INTERACTION_TYPES as readonly string[]).includes(opts.interactionType)) {
      throw new Error(`Invalid interaction_type filter: ${opts.interactionType}`);
    }
    params.push(opts.interactionType);
    where.push(`interaction_type = $${params.length}`);
  }
  if (opts.from) {
    params.push(opts.from);
    where.push(`occurred_at >= $${params.length}`);
  }
  if (opts.to) {
    params.push(opts.to);
    where.push(`occurred_at <= $${params.length}`);
  }

  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${INTERACTION_COLUMNS}
       FROM agos_business_interactions
      WHERE ${where.join(' AND ')}
      ORDER BY occurred_at DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToInteraction);
}

// ─── Get one ─────────────────────────────────────────────────────────────

export async function getInteraction(
  id: string,
  userId: string,
): Promise<Interaction | null> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT ${INTERACTION_COLUMNS}
       FROM agos_business_interactions
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToInteraction(r.rows[0]);
}

// ─── Create ──────────────────────────────────────────────────────────────

export async function createInteraction(
  userId: string,
  data: CreateInteractionInput,
): Promise<Interaction> {
  if (!(INTERACTION_TYPES as readonly string[]).includes(data.interactionType)) {
    throw new Error(`Invalid interaction_type: ${data.interactionType}`);
  }
  const pool = getBusinessPool();
  const id = randomUUID();
  const occurredAt = data.occurredAt ?? new Date().toISOString();
  await pool.query(
    `INSERT INTO agos_business_interactions
       (id, user_id, person_id, organization_id, deal_id, interaction_type, summary, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      id,
      userId,
      data.personId ?? null,
      data.organizationId ?? null,
      data.dealId ?? null,
      data.interactionType,
      data.summary,
      occurredAt,
    ],
  );
  const after = await getInteraction(id, userId);
  if (!after) throw new Error('Failed to create interaction');
  return after;
}

// ─── Update ──────────────────────────────────────────────────────────────

export type UpdateInteractionOutcome =
  | { kind: 'ok'; interaction: Interaction }
  | { kind: 'not_found' };

export async function updateInteraction(
  id: string,
  userId: string,
  patch: UpdateInteractionInput,
): Promise<UpdateInteractionOutcome> {
  if (
    patch.interactionType !== undefined &&
    !(INTERACTION_TYPES as readonly string[]).includes(patch.interactionType)
  ) {
    throw new Error(`Invalid interaction_type: ${patch.interactionType}`);
  }
  const pool = getBusinessPool();
  const set: string[] = [];
  const params: unknown[] =[id, userId];
  let n = 2;

  if (patch.personId !== undefined) {
    params.push(patch.personId);
    n += 1;
    set.push(`person_id = $${n}`);
  }
  if (patch.organizationId !== undefined) {
    params.push(patch.organizationId);
    n += 1;
    set.push(`organization_id = $${n}`);
  }
  if (patch.dealId !== undefined) {
    params.push(patch.dealId);
    n += 1;
    set.push(`deal_id = $${n}`);
  }
  if (patch.interactionType !== undefined) {
    params.push(patch.interactionType);
    n += 1;
    set.push(`interaction_type = $${n}`);
  }
  if (patch.summary !== undefined) {
    params.push(patch.summary);
    n += 1;
    set.push(`summary = $${n}`);
  }
  if (patch.occurredAt !== undefined) {
    params.push(patch.occurredAt);
    n += 1;
    set.push(`occurred_at = $${n}`);
  }

  if (set.length === 0) {
    const current = await getInteraction(id, userId);
    return current ? { kind: 'ok', interaction: current } : { kind: 'not_found' };
  }

  const r = await pool.query(
    `UPDATE agos_business_interactions
        SET ${set.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    params,
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };
  const after = await getInteraction(id, userId);
  if (!after) return { kind: 'not_found' };
  return { kind: 'ok', interaction: after };
}

// ─── Delete (hard) ──────────────────────────────────────────────────────

export async function deleteInteraction(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `DELETE FROM agos_business_interactions
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

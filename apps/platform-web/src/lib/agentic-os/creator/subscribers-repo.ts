/**
 * Creator OS Phase 2 — subscribers DB repository.
 *
 * Cross-ownership contract: every read / write filters by `user_id`
 * directly. A subscriber id belonging to another user returns null on get /
 * update / delete.
 *
 * @license MIT — Tiresias Creator OS Phase 2 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getCreatorPool } from './session';
import { recordAudit } from '../_shared/audit';
import type {
  CreatorSubscriber,
  AddSubscriberInput,
  ListSubscribersOpts,
  SubscriberStatus,
} from './subscribers';

const SUB_COLUMNS = `id, user_id, email, name, status,
                      source, created_at, updated_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

interface RawSubscriberRow {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  status: string;
  source: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function rowToSubscriber(row: RawSubscriberRow): CreatorSubscriber {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    name: row.name ?? null,
    status: row.status as SubscriberStatus,
    source: row.source ?? null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listSubscribers(
  userId: string,
  opts: ListSubscribersOpts = {},
): Promise<CreatorSubscriber[]> {
  const pool = getCreatorPool();
  const params: unknown[] = [userId];
  const where: string[] = [`user_id = $1`];

  if (opts.status) {
    params.push(opts.status);
    where.push(`status = $${params.length}`);
  }

  if (opts.search && opts.search.trim()) {
    params.push(`%${opts.search.trim().toLowerCase()}%`);
    where.push(
      `(LOWER(email) LIKE $${params.length}
        OR LOWER(COALESCE(name, '')) LIKE $${params.length})`,
    );
  }

  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${SUB_COLUMNS}
       FROM agos_creator_subscribers
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToSubscriber);
}

// ─── Get one ──────────────────────────────────────────────────────────────────

export async function getSubscriber(
  id: string,
  userId: string,
): Promise<CreatorSubscriber | null> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `SELECT ${SUB_COLUMNS}
       FROM agos_creator_subscribers
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToSubscriber(r.rows[0]);
}

// ─── Add (upsert semantics) ───────────────────────────────────────────────────

export async function addSubscriber(
  input: AddSubscriberInput,
  userId: string,
): Promise<{ subscriber: CreatorSubscriber; created: boolean }> {
  const pool = getCreatorPool();
  const id = randomUUID();

  // Upsert: if (user_id, email) already exists, reactivate if unsubscribed
  const r = await pool.query(
    `INSERT INTO agos_creator_subscribers
       (id, user_id, email, name, status, source)
     VALUES ($1,$2,$3,$4,'active',$5)
     ON CONFLICT (user_id, email)
     DO UPDATE SET name = COALESCE(EXCLUDED.name, agos_creator_subscribers.name),
                   source = COALESCE(EXCLUDED.source, agos_creator_subscribers.source),
                   status = CASE
                     WHEN agos_creator_subscribers.status = 'unsubscribed'
                     THEN 'active'
                     ELSE agos_creator_subscribers.status
                   END,
                   updated_at = now()
     RETURNING id,
       (xmax = 0) AS created`,
    [
      id,
      userId,
      input.email.toLowerCase().trim(),
      input.name ?? null,
      input.source ?? null,
    ],
  );

  const created = r.rows[0]?.created ?? false;

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: created ? 'creator.subscriber.added' : 'creator.subscriber.updated',
    payload: { subscriberId: r.rows[0]?.id ?? id, email: input.email },
  });

  const sub = await getSubscriber(r.rows[0]?.id ?? id, userId);
  if (!sub) throw new Error('Failed to add subscriber');
  return { subscriber: sub, created };
}

// ─── Update status ────────────────────────────────────────────────────────────

export async function updateSubscriberStatus(
  id: string,
  newStatus: SubscriberStatus,
  userId: string,
): Promise<CreatorSubscriber | null> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `UPDATE agos_creator_subscribers
        SET status = $3
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [id, userId, newStatus],
  );
  if ((r.rowCount ?? 0) === 0) return null;

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.subscriber.status_changed',
    payload: { subscriberId: id, newStatus },
  });

  return getSubscriber(id, userId);
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteSubscriber(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `DELETE FROM agos_creator_subscribers
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [id, userId],
  );

  const deleted = (r.rowCount ?? 0) > 0;
  if (deleted) {
    await recordAudit({
      pool,
      osSlug: 'creator',
      actorId: userId,
      action: 'creator.subscriber.deleted',
      payload: { subscriberId: id },
    });
  }

  return deleted;
}

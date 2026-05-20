/**
 * Creator OS — Publishing-targets DB repository.
 *
 * Cross-ownership contract: every read / write joins with
 * `agos_creator_books` and filters by `user_id`. A target whose parent
 * book belongs to another user returns null on get / update / delete.
 *
 * @license MIT — Tiresias Creator OS (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getCreatorPool } from './session';
import { recordAudit } from '../_shared/audit';
import type {
  PublishingTarget,
  CreatePublishingTargetInput,
  UpdatePublishingTargetInput,
} from './publishing-targets';

const TARGET_COLUMNS = `t.id, t.book_id, t.platform, t.format,
                         t.trim_size, t.isbn, t.bisac_codes,
                         t.price_usd, t.status, t.notes,
                         t.created_at, t.updated_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

interface RawTargetRow {
  id: string;
  book_id: string;
  platform: PublishingTarget['platform'];
  format: PublishingTarget['format'];
  trim_size: string | null;
  isbn: string | null;
  bisac_codes: string[] | null;
  price_usd: number | string | null;
  status: PublishingTarget['status'];
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function rowToTarget(row: RawTargetRow): PublishingTarget {
  return {
    id: row.id,
    bookId: row.book_id,
    platform: row.platform,
    format: row.format,
    trimSize: row.trim_size ?? null,
    isbn: row.isbn ?? null,
    bisacCodes: row.bisac_codes ?? [],
    priceUsd: row.price_usd == null ? null : Number(row.price_usd),
    status: row.status,
    notes: row.notes ?? null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── List ────────────────────────────────────────────────────────────────────

export async function listTargets(
  bookId: string,
  userId: string,
): Promise<PublishingTarget[]> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `SELECT ${TARGET_COLUMNS}
       FROM agos_creator_book_publishing_targets t
       JOIN agos_creator_books b ON t.book_id = b.id
      WHERE t.book_id = $1 AND b.user_id = $2
      ORDER BY t.created_at ASC`,
    [bookId, userId],
  );
  return r.rows.map(rowToTarget);
}

// ─── Get one ─────────────────────────────────────────────────────────────────

export async function getTarget(
  targetId: string,
  bookId: string,
  userId: string,
): Promise<PublishingTarget | null> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `SELECT ${TARGET_COLUMNS}
       FROM agos_creator_book_publishing_targets t
       JOIN agos_creator_books b ON t.book_id = b.id
      WHERE t.id = $1 AND t.book_id = $2 AND b.user_id = $3
      LIMIT 1`,
    [targetId, bookId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToTarget(r.rows[0]);
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createTarget(
  bookId: string,
  userId: string,
  input: CreatePublishingTargetInput,
): Promise<PublishingTarget | null> {
  const pool = getCreatorPool();

  // Verify book ownership first via the same JOIN guard the other queries use.
  const owns = await pool.query(
    `SELECT 1 FROM agos_creator_books
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [bookId, userId],
  );
  if ((owns.rowCount ?? 0) === 0) return null;

  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_creator_book_publishing_targets
       (id, book_id, platform, format, trim_size, isbn,
        bisac_codes, price_usd, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,'draft'),$10)`,
    [
      id,
      bookId,
      input.platform,
      input.format,
      input.trimSize ?? null,
      input.isbn ?? null,
      input.bisacCodes ?? [],
      input.priceUsd ?? null,
      input.status ?? null,
      input.notes ?? null,
    ],
  );

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.publishing_target.created',
    payload: {
      bookId,
      targetId: id,
      platform: input.platform,
      format: input.format,
    },
  });

  return getTarget(id, bookId, userId);
}

// ─── Update ──────────────────────────────────────────────────────────────────

export type UpdateTargetOutcome =
  | { kind: 'ok'; target: PublishingTarget }
  | { kind: 'not_found' };

export async function updateTarget(
  targetId: string,
  bookId: string,
  userId: string,
  patch: UpdatePublishingTargetInput,
): Promise<UpdateTargetOutcome> {
  const pool = getCreatorPool();
  const set: string[] = [];
  const params: unknown[] = [targetId, bookId, userId];
  let n = 3;

  if (patch.platform !== undefined) {
    params.push(patch.platform);
    n += 1;
    set.push(`platform = $${n}`);
  }
  if (patch.format !== undefined) {
    params.push(patch.format);
    n += 1;
    set.push(`format = $${n}`);
  }
  if (patch.trimSize !== undefined) {
    params.push(patch.trimSize);
    n += 1;
    set.push(`trim_size = $${n}`);
  }
  if (patch.isbn !== undefined) {
    params.push(patch.isbn);
    n += 1;
    set.push(`isbn = $${n}`);
  }
  if (patch.bisacCodes !== undefined) {
    params.push(patch.bisacCodes);
    n += 1;
    set.push(`bisac_codes = $${n}`);
  }
  if (patch.priceUsd !== undefined) {
    params.push(patch.priceUsd);
    n += 1;
    set.push(`price_usd = $${n}`);
  }
  if (patch.status !== undefined) {
    params.push(patch.status);
    n += 1;
    set.push(`status = $${n}`);
  }
  if (patch.notes !== undefined) {
    params.push(patch.notes);
    n += 1;
    set.push(`notes = $${n}`);
  }

  if (set.length === 0) {
    const current = await getTarget(targetId, bookId, userId);
    return current
      ? { kind: 'ok', target: current }
      : { kind: 'not_found' };
  }

  const r = await pool.query(
    `UPDATE agos_creator_book_publishing_targets t
        SET ${set.join(', ')}
       FROM agos_creator_books b
      WHERE t.id = $1 AND t.book_id = $2
        AND t.book_id = b.id AND b.user_id = $3
      RETURNING t.id`,
    params,
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };

  const after = await getTarget(targetId, bookId, userId);
  if (!after) return { kind: 'not_found' };

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.publishing_target.updated',
    payload: { bookId, targetId, fields: Object.keys(patch) },
  });

  return { kind: 'ok', target: after };
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export async function deleteTarget(
  targetId: string,
  bookId: string,
  userId: string,
): Promise<boolean> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `DELETE FROM agos_creator_book_publishing_targets t
      USING agos_creator_books b
      WHERE t.id = $1 AND t.book_id = $2
        AND t.book_id = b.id AND b.user_id = $3
      RETURNING t.id`,
    [targetId, bookId, userId],
  );

  const deleted = (r.rowCount ?? 0) > 0;
  if (deleted) {
    await recordAudit({
      pool,
      osSlug: 'creator',
      actorId: userId,
      action: 'creator.publishing_target.deleted',
      payload: { bookId, targetId },
    });
  }

  return deleted;
}

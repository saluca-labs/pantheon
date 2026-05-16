/**
 * Autobiographer OS — Arcs repo.
 *
 * CRUD against `agos_autobiographer_arcs` from migration
 * `0046_autobiographer_phase5`. Every read filters by `user_id`. Arc
 * creation requires the caller own the target book — the route layer
 * probes book ownership before calling `createArc`.
 *
 * is_primary single-active invariant
 * ----------------------------------
 * At most one arc per book has `is_primary = true`. `setArcPrimary`
 * wraps the bit-flip in a transaction that first clears the bit on
 * every other arc for the book, then sets it on the target. Mirrors the
 * Phase 3 voice-profile `activateProfile` pattern.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAutobiographerPool } from './session';
import {
  ARC_DESCRIPTION_MAX,
  ARC_KINDS,
  ARC_TITLE_MAX,
  type ArcKind,
} from './arcs';

export interface AutobiographerArc {
  id: string;
  userId: string;
  bookId: string;
  title: string;
  kind: ArcKind;
  description: string | null;
  isPrimary: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateArcInput {
  bookId: string;
  title: string;
  kind?: ArcKind;
  description?: string | null;
  isPrimary?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdateArcInput {
  title?: string;
  kind?: ArcKind;
  description?: string | null;
  isPrimary?: boolean;
  metadata?: Record<string, unknown>;
}

const ARC_COLUMNS = `id, user_id, book_id, title, kind, description,
                     is_primary, metadata, created_at, updated_at`;

interface RawArcRow {
  id: string;
  user_id: string;
  book_id: string;
  title: string;
  kind: string | null;
  description: string | null;
  is_primary: boolean;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function rowToArc(row: RawArcRow): AutobiographerArc {
  return {
    id: row.id,
    userId: row.user_id,
    bookId: row.book_id,
    title: row.title,
    kind: (row.kind as ArcKind) ?? 'chronological',
    description: row.description ?? null,
    isPrimary: Boolean(row.is_primary),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

export async function userOwnsBook(
  bookId: string,
  userId: string,
): Promise<boolean> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_autobiographer_books
      WHERE id = $1 AND user_id = $2`,
    [bookId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function listArcsForBook(
  bookId: string,
  userId: string,
): Promise<AutobiographerArc[]> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${ARC_COLUMNS}
       FROM agos_autobiographer_arcs
      WHERE book_id = $1 AND user_id = $2
      ORDER BY is_primary DESC, created_at ASC`,
    [bookId, userId],
  );
  return r.rows.map(rowToArc);
}

export async function getArc(
  id: string,
  userId: string,
): Promise<AutobiographerArc | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${ARC_COLUMNS}
       FROM agos_autobiographer_arcs
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToArc(r.rows[0]);
}

/**
 * Get the primary arc for a book (the one whose `is_primary = true`).
 * Returns null when no arc carries the flag.
 */
export async function getPrimaryArcForBook(
  bookId: string,
  userId: string,
): Promise<AutobiographerArc | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${ARC_COLUMNS}
       FROM agos_autobiographer_arcs
      WHERE book_id = $1 AND user_id = $2 AND is_primary = true
      LIMIT 1`,
    [bookId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToArc(r.rows[0]);
}

export async function createArc(
  userId: string,
  data: CreateArcInput,
): Promise<AutobiographerArc> {
  if (!data.title || data.title.trim().length === 0) {
    throw new Error('Arc title is required');
  }
  if (data.title.length > ARC_TITLE_MAX) {
    throw new Error(`Arc title exceeds ${ARC_TITLE_MAX} characters`);
  }
  const kind: ArcKind = data.kind ?? 'chronological';
  if (!(ARC_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`Invalid arc kind: ${kind}`);
  }
  if (
    data.description &&
    data.description.length > ARC_DESCRIPTION_MAX
  ) {
    throw new Error(`Description exceeds ${ARC_DESCRIPTION_MAX} characters`);
  }
  const id = randomUUID();
  const pool = getAutobiographerPool();

  // If isPrimary is requested at creation, flip every existing arc for
  // the book to is_primary = false first inside a transaction. The
  // partial UNIQUE index then admits the new winner.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (data.isPrimary) {
      await client.query(
        `UPDATE agos_autobiographer_arcs
            SET is_primary = false,
                updated_at = now()
          WHERE book_id = $1 AND user_id = $2 AND is_primary = true`,
        [data.bookId, userId],
      );
    }
    await client.query(
      `INSERT INTO agos_autobiographer_arcs
         (id, user_id, book_id, title, kind, description, is_primary, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        id,
        userId,
        data.bookId,
        data.title.trim(),
        kind,
        data.description ?? null,
        data.isPrimary ?? false,
        JSON.stringify(data.metadata ?? {}),
      ],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
  const arc = await getArc(id, userId);
  if (!arc) throw new Error('Failed to create arc');
  return arc;
}

export async function updateArc(
  id: string,
  userId: string,
  patch: UpdateArcInput,
): Promise<AutobiographerArc | null> {
  if (patch.title !== undefined && patch.title.length > ARC_TITLE_MAX) {
    throw new Error(`Arc title exceeds ${ARC_TITLE_MAX} characters`);
  }
  if (
    patch.kind !== undefined &&
    !(ARC_KINDS as readonly string[]).includes(patch.kind)
  ) {
    throw new Error(`Invalid arc kind: ${patch.kind}`);
  }
  if (
    patch.description &&
    patch.description.length > ARC_DESCRIPTION_MAX
  ) {
    throw new Error(`Description exceeds ${ARC_DESCRIPTION_MAX} characters`);
  }
  const pool = getAutobiographerPool();

  // is_primary transitions require a transaction because flipping to
  // true must first clear every sibling on the same book.
  if (patch.isPrimary === true) {
    const existing = await getArc(id, userId);
    if (!existing) return null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Verify ownership inside transaction.
      const owns = await client.query(
        `SELECT book_id FROM agos_autobiographer_arcs
          WHERE id = $1 AND user_id = $2
          FOR UPDATE`,
        [id, userId],
      );
      if ((owns.rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      const bookId = owns.rows[0].book_id;
      await client.query(
        `UPDATE agos_autobiographer_arcs
            SET is_primary = false,
                updated_at = now()
          WHERE book_id = $1 AND user_id = $2 AND id <> $3 AND is_primary = true`,
        [bookId, userId, id],
      );
      await client.query(
        `UPDATE agos_autobiographer_arcs
            SET title       = COALESCE($3, title),
                kind        = COALESCE($4, kind),
                description = CASE WHEN $5::boolean THEN $6 ELSE description END,
                is_primary  = true,
                metadata    = COALESCE($7::jsonb, metadata),
                updated_at  = now()
          WHERE id = $1 AND user_id = $2`,
        [
          id,
          userId,
          patch.title ?? null,
          patch.kind ?? null,
          Object.prototype.hasOwnProperty.call(patch, 'description'),
          patch.description ?? null,
          patch.metadata ? JSON.stringify(patch.metadata) : null,
        ],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    return getArc(id, userId);
  }

  // Plain patch path (no is_primary transition, or transition to false).
  await pool.query(
    `UPDATE agos_autobiographer_arcs
        SET title       = COALESCE($3, title),
            kind        = COALESCE($4, kind),
            description = CASE WHEN $5::boolean THEN $6 ELSE description END,
            is_primary  = CASE WHEN $7::boolean THEN $8 ELSE is_primary END,
            metadata    = COALESCE($9::jsonb, metadata),
            updated_at  = now()
      WHERE id = $1 AND user_id = $2`,
    [
      id,
      userId,
      patch.title ?? null,
      patch.kind ?? null,
      Object.prototype.hasOwnProperty.call(patch, 'description'),
      patch.description ?? null,
      patch.isPrimary !== undefined,
      patch.isPrimary ?? false,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  return getArc(id, userId);
}

/**
 * Make this arc the primary one for its book. Clears the primary bit on
 * every sibling arc in a single transaction. Returns null if the arc
 * does not exist for the caller.
 */
export async function setArcPrimary(
  id: string,
  userId: string,
): Promise<AutobiographerArc | null> {
  const pool = getAutobiographerPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const owns = await client.query(
      `SELECT book_id FROM agos_autobiographer_arcs
        WHERE id = $1 AND user_id = $2
        FOR UPDATE`,
      [id, userId],
    );
    if ((owns.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const bookId = owns.rows[0].book_id;
    await client.query(
      `UPDATE agos_autobiographer_arcs
          SET is_primary = false, updated_at = now()
        WHERE book_id = $1 AND user_id = $2 AND id <> $3 AND is_primary = true`,
      [bookId, userId, id],
    );
    await client.query(
      `UPDATE agos_autobiographer_arcs
          SET is_primary = true, updated_at = now()
        WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
  return getArc(id, userId);
}

export async function deleteArc(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `DELETE FROM agos_autobiographer_arcs
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

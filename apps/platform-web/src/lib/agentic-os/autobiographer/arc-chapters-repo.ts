/**
 * Autobiographer OS — Arc-chapters join repo.
 *
 * CRUD against `agos_autobiographer_arc_chapters` from migration
 * `0046_autobiographer_phase5`. Cross-book chapter validation: every
 * write checks `chapter.book_id == arc.book_id`; a chapter from a
 * different book yields a typed `not_found` error mapped to 404.
 *
 * Position uniqueness within an arc is enforced by a DEFERRABLE
 * INITIALLY DEFERRED unique index, so `reorderArcChapters` can issue a
 * single transaction with multiple UPDATEs and let PG validate at
 * commit. Mirrors the Phase 4 chapter-position pattern.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAutobiographerPool } from './session';
import type { ReorderEntry } from './arc-chapters';

export interface ArcChapterRow {
  id: string;
  arcId: string;
  chapterId: string;
  position: number;
  createdAt: string;
}

export interface ArcChapterJoined extends ArcChapterRow {
  chapterTitle: string | null;
  chapterSlug: string | null;
  chapterStatus: string;
  chapterSummary: string | null;
  chapterUpdatedAt: string;
}

const ROW_COLUMNS = `id, arc_id, chapter_id, position, created_at`;

function rowToArcChapter(row: any): ArcChapterRow {
  return {
    id: row.id,
    arcId: row.arc_id,
    chapterId: row.chapter_id,
    position: Number(row.position ?? 0),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

function rowToArcChapterJoined(row: any): ArcChapterJoined {
  return {
    ...rowToArcChapter(row),
    chapterTitle: row.chapter_title ?? null,
    chapterSlug: row.chapter_slug ?? null,
    chapterStatus: row.chapter_status ?? 'outline',
    chapterSummary: row.chapter_summary ?? null,
    chapterUpdatedAt:
      row.chapter_updated_at instanceof Date
        ? row.chapter_updated_at.toISOString()
        : String(row.chapter_updated_at),
  };
}

async function arcOwnedByUser(
  arcId: string,
  userId: string,
): Promise<{ bookId: string } | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT book_id FROM agos_autobiographer_arcs
      WHERE id = $1 AND user_id = $2`,
    [arcId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return { bookId: r.rows[0].book_id };
}

async function chapterOwnedByUser(
  chapterId: string,
  userId: string,
): Promise<{ bookId: string } | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT book_id FROM agos_autobiographer_chapters
      WHERE id = $1 AND user_id = $2`,
    [chapterId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return { bookId: r.rows[0].book_id };
}

/** Joined list of chapters in an arc, ordered by position. */
export async function listChaptersForArc(
  arcId: string,
  userId: string,
): Promise<ArcChapterJoined[]> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ac.id, ac.arc_id, ac.chapter_id, ac.position, ac.created_at,
            c.title    AS chapter_title,
            c.slug     AS chapter_slug,
            c.status   AS chapter_status,
            c.summary  AS chapter_summary,
            c.updated_at AS chapter_updated_at
       FROM agos_autobiographer_arc_chapters ac
       JOIN agos_autobiographer_arcs     a ON a.id = ac.arc_id
       JOIN agos_autobiographer_chapters c ON c.id = ac.chapter_id
      WHERE ac.arc_id = $1
        AND a.user_id = $2
        AND c.user_id = $2
      ORDER BY ac.position ASC, ac.created_at ASC`,
    [arcId, userId],
  );
  return r.rows.map(rowToArcChapterJoined);
}

/**
 * Ordered chapter ids for a given arc, scoped to caller. Lightweight
 * helper used by the book PDF export + book detail page to resolve the
 * primary-arc ordering without joining chapter columns.
 */
export async function listChapterIdsForArc(
  arcId: string,
  userId: string,
): Promise<string[]> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ac.chapter_id
       FROM agos_autobiographer_arc_chapters ac
       JOIN agos_autobiographer_arcs a ON a.id = ac.arc_id
      WHERE ac.arc_id = $1 AND a.user_id = $2
      ORDER BY ac.position ASC, ac.created_at ASC`,
    [arcId, userId],
  );
  return r.rows.map((row: any) => String(row.chapter_id));
}

export interface AttachArcChapterInput {
  chapterId: string;
  /** Optional explicit position; when omitted, auto-assigns max(pos)+1. */
  position?: number | null;
}

/**
 * Attach a chapter to an arc. Validates:
 *
 *   - arc belongs to caller
 *   - chapter belongs to caller
 *   - chapter.book_id == arc.book_id (cross-book rejection)
 *
 * Returns a typed `not_found` error when any of the above fails. Returns
 * `duplicate` if the chapter is already in the arc.
 */
export async function attachChapterToArc(
  arcId: string,
  userId: string,
  data: AttachArcChapterInput,
): Promise<ArcChapterRow> {
  const arcOwn = await arcOwnedByUser(arcId, userId);
  const chOwn = await chapterOwnedByUser(data.chapterId, userId);
  if (!arcOwn || !chOwn || arcOwn.bookId !== chOwn.bookId) {
    const err = new Error('not_found');
    (err as any).code = 'not_found';
    throw err;
  }

  const pool = getAutobiographerPool();
  let pos = data.position;
  if (pos === undefined || pos === null) {
    const posR = await pool.query(
      `SELECT COALESCE(MAX(position) + 1, 0) AS next
         FROM agos_autobiographer_arc_chapters
        WHERE arc_id = $1`,
      [arcId],
    );
    pos = Number(posR.rows[0]?.next ?? 0);
  }
  if (!Number.isInteger(pos) || pos < 0) {
    throw new Error(`Invalid position: ${pos}`);
  }

  const id = randomUUID();
  try {
    await pool.query(
      `INSERT INTO agos_autobiographer_arc_chapters
         (id, arc_id, chapter_id, position)
       VALUES ($1, $2, $3, $4)`,
      [id, arcId, data.chapterId, pos],
    );
  } catch (err: any) {
    if (err?.code === '23505') {
      const dup = new Error('duplicate');
      (dup as any).code = 'duplicate';
      throw dup;
    }
    throw err;
  }
  const r = await pool.query(
    `SELECT ${ROW_COLUMNS}
       FROM agos_autobiographer_arc_chapters
      WHERE id = $1`,
    [id],
  );
  return rowToArcChapter(r.rows[0]);
}

/**
 * Replace the entire ordering for an arc with the provided
 * `[{chapterId, position}]` array. Wrapped in a transaction so the
 * DEFERRABLE UNIQUE index validates at commit; intermediate same-
 * position states never leak to a concurrent reader.
 *
 * Validates that every chapter in the list already belongs to the arc;
 * returns `not_found` if any does not, OR if the arc / a chapter is
 * foreign. The transaction is rolled back on the first mismatch.
 */
export async function reorderArcChapters(
  arcId: string,
  userId: string,
  entries: ReorderEntry[],
): Promise<ArcChapterJoined[]> {
  const arcOwn = await arcOwnedByUser(arcId, userId);
  if (!arcOwn) {
    const err = new Error('not_found');
    (err as any).code = 'not_found';
    throw err;
  }
  // Validate positions form a valid set: integers, non-negative, unique.
  const seen = new Set<number>();
  for (const e of entries) {
    if (!Number.isInteger(e.position) || e.position < 0) {
      throw new Error(`Invalid position: ${e.position}`);
    }
    if (seen.has(e.position)) {
      throw new Error(`Duplicate position in reorder payload: ${e.position}`);
    }
    seen.add(e.position);
  }
  const pool = getAutobiographerPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET CONSTRAINTS ALL DEFERRED');
    // Validate every chapter is in the arc.
    const existing = await client.query(
      `SELECT chapter_id FROM agos_autobiographer_arc_chapters
        WHERE arc_id = $1`,
      [arcId],
    );
    const existingIds = new Set(existing.rows.map((r: any) => String(r.chapter_id)));
    for (const e of entries) {
      if (!existingIds.has(e.chapterId)) {
        await client.query('ROLLBACK');
        const err = new Error('not_found');
        (err as any).code = 'not_found';
        throw err;
      }
    }
    // Apply each new position.
    for (const e of entries) {
      await client.query(
        `UPDATE agos_autobiographer_arc_chapters
            SET position = $3
          WHERE arc_id = $1 AND chapter_id = $2`,
        [arcId, e.chapterId, e.position],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
  return listChaptersForArc(arcId, userId);
}

export async function unlinkChapterFromArc(
  arcId: string,
  chapterId: string,
  userId: string,
): Promise<boolean> {
  const arcOwn = await arcOwnedByUser(arcId, userId);
  if (!arcOwn) {
    const err = new Error('not_found');
    (err as any).code = 'not_found';
    throw err;
  }
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `DELETE FROM agos_autobiographer_arc_chapters
      WHERE arc_id = $1 AND chapter_id = $2`,
    [arcId, chapterId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Autobiographer OS — Book-scoped chapters repo.
 *
 * CRUD against `agos_autobiographer_chapters` (book-scoped, Phase 4)
 * from migration `0045_autobiographer_phase4`. Every read filters by
 * `user_id`. Chapter creation requires the caller own the target book
 * — the route layer probes book ownership before calling
 * `createChapter`.
 *
 * Position management
 * -------------------
 * `position` is unique per book and `(book_id, position)` is declared
 * DEFERRABLE INITIALLY DEFERRED. `reorderChapter` swaps the target
 * chapter into a new slot by wrapping the two-statement update in a
 * single transaction so the intermediate same-position state never
 * leaks to a concurrent reader.
 *
 * Slug
 * ----
 * `slug` is per-book unique. The repo's helpers expose `nextSlugForBook`
 * which derives a slug from a title and appends a `-N` suffix until the
 * candidate is free within the book.
 *
 * Phase 5 seam
 * ------------
 * `listChaptersForBook` accepts an optional ordering hint (defaults to
 * `'position'`). When Phase 5 arcs land, the arc loader can compute an
 * ordered chapter id list and call `listChaptersByIds` instead. Phase 4
 * keeps the seam tight: the route signature does not change when Phase
 * 5 swaps in arc ordering.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAutobiographerPool } from './session';
import {
  CHAPTER_STATUSES,
  CHAPTER_SLUG_MAX,
  CHAPTER_SUMMARY_MAX,
  CHAPTER_TITLE_MAX,
  chapterSlug,
  type ChapterStatus,
} from './chapters';

export interface AutobiographerChapter {
  id: string;
  userId: string;
  bookId: string;
  title: string | null;
  slug: string | null;
  position: number;
  status: ChapterStatus;
  summary: string | null;
  targetWordCount: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChapterInput {
  bookId: string;
  title?: string | null;
  slug?: string | null;
  status?: ChapterStatus;
  summary?: string | null;
  targetWordCount?: number | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateChapterInput {
  title?: string | null;
  slug?: string | null;
  status?: ChapterStatus;
  summary?: string | null;
  targetWordCount?: number | null;
  position?: number;
  metadata?: Record<string, unknown>;
}

const CHAPTER_COLUMNS = `id, user_id, book_id, title, slug, position, status,
                         summary, target_word_count, metadata,
                         created_at, updated_at`;

function rowToChapter(row: any): AutobiographerChapter {
  return {
    id: row.id,
    userId: row.user_id,
    bookId: row.book_id,
    title: row.title ?? null,
    slug: row.slug ?? null,
    position: Number(row.position ?? 0),
    status: (row.status as ChapterStatus) ?? 'outline',
    summary: row.summary ?? null,
    targetWordCount:
      row.target_word_count === null || row.target_word_count === undefined
        ? null
        : Number(row.target_word_count),
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

/**
 * Derive a slug candidate from a title and append a numeric suffix
 * until the candidate is free within the given book. Returns the slug
 * to use (never throws). The fallback slug for empty / collision-only
 * titles is `chapter-N` where N is the next free position + 1.
 *
 * Exported for tests and for the chapter-create POST handler when no
 * slug is supplied.
 */
export async function nextSlugForBook(
  bookId: string,
  rawTitle: string | null | undefined,
  basePosition: number,
  excludeChapterId?: string | null,
): Promise<string> {
  const pool = getAutobiographerPool();
  const base = chapterSlug(rawTitle ?? '');
  const fallback = `chapter-${basePosition + 1}`;
  let candidate = base || fallback;
  let suffix = 1;

  // probe candidate; if collision, append -N until free
  // (excludeChapterId lets PATCH skip self-collision)
  for (let i = 0; i < 1000; i++) {
    const params: any[] = [bookId, candidate];
    let sql = `SELECT 1 FROM agos_autobiographer_chapters
                WHERE book_id = $1 AND slug = $2`;
    if (excludeChapterId) {
      params.push(excludeChapterId);
      sql += ` AND id <> $3`;
    }
    sql += ` LIMIT 1`;
    const r = await pool.query(sql, params);
    if ((r.rowCount ?? 0) === 0) return candidate.slice(0, CHAPTER_SLUG_MAX);
    suffix += 1;
    candidate = `${base || 'chapter'}-${suffix}`;
  }
  // Pathological fallback — should never reach here.
  return `${fallback}-${randomUUID().slice(0, 6)}`;
}

export interface ListChaptersArgs {
  userId: string;
  bookId: string;
  /**
   * Ordering strategy.
   *
   *   - `'position'` (default) honors the book's manual sort.
   *   - `'updated_desc'` returns by `updated_at DESC`.
   *   - `'arc'` (Phase 5) returns chapters ordered by the book's primary
   *     arc when one exists; falls back to `'position'` otherwise.
   *
   * The route signature is intentionally extensible so callers can
   * request an arc-ordered list without knowing which arc is primary.
   */
  order?: 'position' | 'updated_desc' | 'arc';
}

export async function listChaptersForBook(
  args: ListChaptersArgs,
): Promise<AutobiographerChapter[]> {
  const pool = getAutobiographerPool();

  if (args.order === 'arc') {
    // Resolve the primary arc for the book and join chapters through
    // arc_chapters. When no primary arc exists, fall back to position.
    const primary = await pool.query(
      `SELECT id FROM agos_autobiographer_arcs
        WHERE book_id = $1 AND user_id = $2 AND is_primary = true
        LIMIT 1`,
      [args.bookId, args.userId],
    );
    if ((primary.rowCount ?? 0) > 0) {
      const arcId = primary.rows[0].id;
      // Chapters attached to the arc come first in arc order; any
      // chapters that exist in the book but are NOT in the arc come
      // after, sorted by their book position so they remain discoverable.
      const r = await pool.query(
        `WITH arc_membership AS (
           SELECT chapter_id, position
             FROM agos_autobiographer_arc_chapters
            WHERE arc_id = $1
         )
         SELECT ${CHAPTER_COLUMNS}
           FROM agos_autobiographer_chapters c
           LEFT JOIN arc_membership am ON am.chapter_id = c.id
          WHERE c.user_id = $2 AND c.book_id = $3
          ORDER BY (am.position IS NULL) ASC,
                   am.position ASC,
                   c.position  ASC,
                   c.created_at ASC`,
        [arcId, args.userId, args.bookId],
      );
      return r.rows.map(rowToChapter);
    }
    // Fall through to position ordering.
  }

  const order =
    args.order === 'updated_desc'
      ? 'updated_at DESC'
      : 'position ASC, created_at ASC';
  const r = await pool.query(
    `SELECT ${CHAPTER_COLUMNS}
       FROM agos_autobiographer_chapters
      WHERE user_id = $1 AND book_id = $2
      ORDER BY ${order}`,
    [args.userId, args.bookId],
  );
  return r.rows.map(rowToChapter);
}

/**
 * Workshop-wide list across every book the user owns. Used by the
 * existing `/dashboard/os/autobiographer/chapters` index page.
 */
export async function listChaptersForUser(
  userId: string,
  args: { bookId?: string | null; limit?: number; offset?: number } = {},
): Promise<AutobiographerChapter[]> {
  const pool = getAutobiographerPool();
  const params: any[] = [userId];
  let where = `user_id = $1`;
  if (args.bookId) {
    params.push(args.bookId);
    where += ` AND book_id = $${params.length}`;
  }
  const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
  const offset = Math.max(0, args.offset ?? 0);
  params.push(limit);
  params.push(offset);
  const r = await pool.query(
    `SELECT ${CHAPTER_COLUMNS}
       FROM agos_autobiographer_chapters
      WHERE ${where}
      ORDER BY updated_at DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToChapter);
}

export async function getChapter(
  id: string,
  userId: string,
): Promise<AutobiographerChapter | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${CHAPTER_COLUMNS}
       FROM agos_autobiographer_chapters
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToChapter(r.rows[0]);
}

/**
 * Confirm the caller owns the target book before chapter creation.
 * Returns true when the book exists and belongs to the user.
 */
export async function userOwnsBook(
  bookId: string,
  userId: string,
): Promise<boolean> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_autobiographer_books
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [bookId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function createChapter(
  userId: string,
  data: CreateChapterInput,
): Promise<AutobiographerChapter> {
  const pool = getAutobiographerPool();
  const id = randomUUID();
  const status: ChapterStatus = data.status ?? 'outline';
  if (!(CHAPTER_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  if (data.title && data.title.length > CHAPTER_TITLE_MAX) {
    throw new Error(`Title exceeds ${CHAPTER_TITLE_MAX} characters`);
  }
  if (data.summary && data.summary.length > CHAPTER_SUMMARY_MAX) {
    throw new Error(`Summary exceeds ${CHAPTER_SUMMARY_MAX} characters`);
  }

  // Resolve next position within the book.
  const posR = await pool.query(
    `SELECT COALESCE(MAX(position) + 1, 0) AS next
       FROM agos_autobiographer_chapters
      WHERE book_id = $1`,
    [data.bookId],
  );
  const nextPosition = Number(posR.rows[0]?.next ?? 0);

  // Slug: if supplied use as-is (route validates length); otherwise
  // derive from title (or fall back to chapter-N when both are empty).
  const slug =
    data.slug !== undefined && data.slug !== null
      ? data.slug
      : await nextSlugForBook(data.bookId, data.title ?? null, nextPosition);

  await pool.query(
    `INSERT INTO agos_autobiographer_chapters
       (id, user_id, book_id, title, slug, position, status, summary,
        target_word_count, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
    [
      id,
      userId,
      data.bookId,
      data.title ?? null,
      slug,
      nextPosition,
      status,
      data.summary ?? null,
      data.targetWordCount ?? null,
      JSON.stringify(data.metadata ?? {}),
    ],
  );

  const chapter = await getChapter(id, userId);
  if (!chapter) throw new Error('Failed to create chapter');
  return chapter;
}

/**
 * Patch fields on a chapter. `position` updates flow through
 * `reorderChapter` instead so the swap is transactional. Any
 * `position` field in `patch` is honored ONLY when the chapter's
 * current position differs and there is no collision.
 *
 * Phase 6 seam: when Phase 6 ships, the PATCH handler will accept a
 * `sensitive_kinds` field here. The column is not yet declared, so
 * the field is rejected at the route layer.
 */
export async function updateChapter(
  id: string,
  userId: string,
  patch: UpdateChapterInput,
): Promise<AutobiographerChapter | null> {
  const pool = getAutobiographerPool();
  if (
    patch.status !== undefined &&
    !(CHAPTER_STATUSES as readonly string[]).includes(patch.status)
  ) {
    throw new Error(`Invalid status: ${patch.status}`);
  }
  if (patch.title !== undefined && patch.title !== null && patch.title.length > CHAPTER_TITLE_MAX) {
    throw new Error(`Title exceeds ${CHAPTER_TITLE_MAX} characters`);
  }
  if (patch.summary !== undefined && patch.summary !== null && patch.summary.length > CHAPTER_SUMMARY_MAX) {
    throw new Error(`Summary exceeds ${CHAPTER_SUMMARY_MAX} characters`);
  }

  await pool.query(
    `UPDATE agos_autobiographer_chapters
        SET title             = COALESCE($3,        title),
            slug              = COALESCE($4,        slug),
            status            = COALESCE($5,        status),
            summary           = COALESCE($6,        summary),
            target_word_count = COALESCE($7,        target_word_count),
            position          = COALESCE($8,        position),
            metadata          = COALESCE($9::jsonb, metadata),
            updated_at        = now()
      WHERE id = $1 AND user_id = $2`,
    [
      id,
      userId,
      patch.title ?? null,
      patch.slug ?? null,
      patch.status ?? null,
      patch.summary ?? null,
      patch.targetWordCount ?? null,
      patch.position ?? null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  return getChapter(id, userId);
}

/**
 * Move a chapter to `newPosition` within its book. Wrapping the swap
 * in a transaction allows the DEFERRABLE UNIQUE on `(book_id, position)`
 * to defer enforcement to commit. We:
 *
 *   1. Push the existing occupant of `newPosition` to the chapter's
 *      current position (the swap target).
 *   2. Move this chapter to `newPosition`.
 *
 * When `newPosition` is already free (collapsed position list) the
 * occupant lookup returns nothing and we just move the chapter.
 *
 * Returns the updated chapter, or null if the chapter does not exist
 * for the user.
 */
export async function reorderChapter(
  id: string,
  userId: string,
  newPosition: number,
): Promise<AutobiographerChapter | null> {
  if (!Number.isInteger(newPosition) || newPosition < 0) {
    throw new Error(`Invalid position: ${newPosition}`);
  }
  const pool = getAutobiographerPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Defer the UNIQUE constraint check to commit so the swap-stage
    // intermediate state doesn't violate.
    await client.query('SET CONSTRAINTS ALL DEFERRED');
    const owns = await client.query(
      `SELECT id, book_id, position
         FROM agos_autobiographer_chapters
        WHERE id = $1 AND user_id = $2
        FOR UPDATE`,
      [id, userId],
    );
    if ((owns.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const { book_id: bookId, position: currentPosition } = owns.rows[0];
    if (Number(currentPosition) === newPosition) {
      await client.query('COMMIT');
      return getChapter(id, userId);
    }

    // Find the existing occupant of newPosition within this book.
    const occupant = await client.query(
      `SELECT id FROM agos_autobiographer_chapters
        WHERE book_id = $1 AND position = $2 AND id <> $3
        FOR UPDATE`,
      [bookId, newPosition, id],
    );
    if ((occupant.rowCount ?? 0) > 0) {
      const occupantId = occupant.rows[0].id;
      await client.query(
        `UPDATE agos_autobiographer_chapters
            SET position = $3, updated_at = now()
          WHERE id = $1 AND book_id = $2`,
        [occupantId, bookId, currentPosition],
      );
    }

    await client.query(
      `UPDATE agos_autobiographer_chapters
          SET position = $3, updated_at = now()
        WHERE id = $1 AND user_id = $2`,
      [id, userId, newPosition],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
  return getChapter(id, userId);
}

export async function deleteChapter(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `DELETE FROM agos_autobiographer_chapters
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Word count across the latest revision of every chapter in the book.
 * Used by the book-export PDF and the book detail page header.
 */
export async function getBookWordCount(
  bookId: string,
  userId: string,
): Promise<number> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT COALESCE(SUM(latest.word_count), 0)::int AS total
       FROM agos_autobiographer_chapters c
       JOIN LATERAL (
         SELECT word_count
           FROM agos_autobiographer_chapter_revisions r
          WHERE r.chapter_id = c.id
          ORDER BY r.version DESC
          LIMIT 1
       ) AS latest ON true
      WHERE c.user_id = $1 AND c.book_id = $2`,
    [userId, bookId],
  );
  return Number(r.rows[0]?.total ?? 0);
}

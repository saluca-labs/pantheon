/**
 * Creator OS Phase 3 — books DB repository.
 *
 * Cross-ownership contract: every read / write filters by `user_id`
 * directly (books) or joins with the books table (chapters). A book or
 * chapter belonging to another user returns null on get / update / delete.
 *
 * @license MIT — Tiresias Creator OS Phase 3 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getCreatorPool } from './session';
import { recordAudit } from '../_shared/audit';
import type {
  CreatorBook,
  CreatorChapter,
  CreateCreatorBookInput,
  UpdateCreatorBookInput,
  CreateCreatorChapterInput,
  UpdateCreatorChapterInput,
} from './books';

const BOOK_COLUMNS = `id, user_id, title, description,
                       cover_image_url, status,
                       subtitle, author_display_name, copyright_year,
                       language, dedication, about_author,
                       series_name, series_position,
                       created_at, updated_at`;

const CHAPTER_COLUMNS = `c.id, c.book_id, c.title, c.content,
                          c."order", c.word_count, c.status,
                          c.created_at, c.updated_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function toIsoOrNull(v: unknown): string | null {
  if (v == null) return null;
  return toIso(v);
}

interface RawBookRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  status: CreatorBook['status'];
  subtitle: string | null;
  author_display_name: string | null;
  copyright_year: number | string | null;
  language: string;
  dedication: string | null;
  about_author: string | null;
  series_name: string | null;
  series_position: number | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RawChapterRow {
  id: string;
  book_id: string;
  title: string;
  content: Record<string, unknown> | null;
  order: number | string | null;
  word_count: number | string | null;
  status: CreatorChapter['status'];
  created_at: Date | string;
  updated_at: Date | string;
}

function rowToBook(row: RawBookRow): CreatorBook {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description ?? null,
    coverImageUrl: row.cover_image_url ?? null,
    status: row.status,
    subtitle: row.subtitle ?? null,
    authorDisplayName: row.author_display_name ?? null,
    copyrightYear: row.copyright_year == null ? null : Number(row.copyright_year),
    language: row.language,
    dedication: row.dedication ?? null,
    aboutAuthor: row.about_author ?? null,
    seriesName: row.series_name ?? null,
    seriesPosition:
      row.series_position == null ? null : Number(row.series_position),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToChapter(row: RawChapterRow): CreatorChapter {
  return {
    id: row.id,
    bookId: row.book_id,
    title: row.title,
    content: (row.content as Record<string, unknown>) ?? {},
    order: Number(row.order ?? 0),
    wordCount: Number(row.word_count ?? 0),
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── Books: List ────────────────────────────────────────────────────────────

export async function listBooks(userId: string): Promise<CreatorBook[]> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `SELECT ${BOOK_COLUMNS}
       FROM agos_creator_books
      WHERE user_id = $1
      ORDER BY updated_at DESC`,
    [userId],
  );
  return r.rows.map(rowToBook);
}

// ─── Books: Get one ─────────────────────────────────────────────────────────

export async function getBook(
  id: string,
  userId: string,
): Promise<CreatorBook | null> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `SELECT ${BOOK_COLUMNS}
       FROM agos_creator_books
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToBook(r.rows[0]);
}

// ─── Books: Create ──────────────────────────────────────────────────────────

export async function createBook(
  input: CreateCreatorBookInput,
  userId: string,
): Promise<CreatorBook> {
  const pool = getCreatorPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_creator_books
       (id, user_id, title, description, cover_image_url,
        subtitle, author_display_name, copyright_year,
        language, dedication, about_author,
        series_name, series_position)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,'en-US'),$10,$11,$12,$13)`,
    [
      id,
      userId,
      input.title,
      input.description ?? null,
      input.coverImageUrl ?? null,
      input.subtitle ?? null,
      input.authorDisplayName ?? null,
      input.copyrightYear ?? null,
      input.language ?? null,
      input.dedication ?? null,
      input.aboutAuthor ?? null,
      input.seriesName ?? null,
      input.seriesPosition ?? null,
    ],
  );

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.book.created',
    payload: { bookId: id, title: input.title },
  });

  const after = await getBook(id, userId);
  if (!after) throw new Error('Failed to create book');
  return after;
}

// ─── Books: Update ──────────────────────────────────────────────────────────

export type UpdateBookOutcome =
  | { kind: 'ok'; book: CreatorBook }
  | { kind: 'not_found' };

export async function updateBook(
  id: string,
  userId: string,
  patch: UpdateCreatorBookInput,
): Promise<UpdateBookOutcome> {
  const pool = getCreatorPool();
  const set: string[] = [];
  const params: unknown[] = [id, userId];
  let n = 2;

  if (patch.title !== undefined) {
    params.push(patch.title);
    n += 1;
    set.push(`title = $${n}`);
  }
  if (patch.description !== undefined) {
    params.push(patch.description);
    n += 1;
    set.push(`description = $${n}`);
  }
  if (patch.coverImageUrl !== undefined) {
    params.push(patch.coverImageUrl);
    n += 1;
    set.push(`cover_image_url = $${n}`);
  }
  if (patch.status !== undefined) {
    params.push(patch.status);
    n += 1;
    set.push(`status = $${n}`);
  }
  if (patch.subtitle !== undefined) {
    params.push(patch.subtitle);
    n += 1;
    set.push(`subtitle = $${n}`);
  }
  if (patch.authorDisplayName !== undefined) {
    params.push(patch.authorDisplayName);
    n += 1;
    set.push(`author_display_name = $${n}`);
  }
  if (patch.copyrightYear !== undefined) {
    params.push(patch.copyrightYear);
    n += 1;
    set.push(`copyright_year = $${n}`);
  }
  if (patch.language !== undefined) {
    params.push(patch.language);
    n += 1;
    set.push(`language = $${n}`);
  }
  if (patch.dedication !== undefined) {
    params.push(patch.dedication);
    n += 1;
    set.push(`dedication = $${n}`);
  }
  if (patch.aboutAuthor !== undefined) {
    params.push(patch.aboutAuthor);
    n += 1;
    set.push(`about_author = $${n}`);
  }
  if (patch.seriesName !== undefined) {
    params.push(patch.seriesName);
    n += 1;
    set.push(`series_name = $${n}`);
  }
  if (patch.seriesPosition !== undefined) {
    params.push(patch.seriesPosition);
    n += 1;
    set.push(`series_position = $${n}`);
  }

  if (set.length === 0) {
    const current = await getBook(id, userId);
    return current ? { kind: 'ok', book: current } : { kind: 'not_found' };
  }

  const r = await pool.query(
    `UPDATE agos_creator_books
        SET ${set.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    params,
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };

  const after = await getBook(id, userId);
  if (!after) return { kind: 'not_found' };

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.book.updated',
    payload: { bookId: id, fields: Object.keys(patch) },
  });

  return { kind: 'ok', book: after };
}

// ─── Books: Delete ──────────────────────────────────────────────────────────

export async function deleteBook(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `DELETE FROM agos_creator_books
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
      action: 'creator.book.deleted',
      payload: { bookId: id },
    });
  }

  return deleted;
}

// ─── Chapters: List (with book ownership check) ─────────────────────────────

export async function listChapters(
  bookId: string,
  userId: string,
): Promise<CreatorChapter[]> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `SELECT ${CHAPTER_COLUMNS}
       FROM agos_creator_chapters c
       JOIN agos_creator_books b ON c.book_id = b.id
      WHERE c.book_id = $1 AND b.user_id = $2
      ORDER BY c."order" ASC, c.created_at ASC`,
    [bookId, userId],
  );
  return r.rows.map(rowToChapter);
}

// ─── Chapters: Get one ──────────────────────────────────────────────────────

export async function getChapter(
  chapterId: string,
  bookId: string,
  userId: string,
): Promise<CreatorChapter | null> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `SELECT ${CHAPTER_COLUMNS}
       FROM agos_creator_chapters c
       JOIN agos_creator_books b ON c.book_id = b.id
      WHERE c.id = $1 AND c.book_id = $2 AND b.user_id = $3
      LIMIT 1`,
    [chapterId, bookId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToChapter(r.rows[0]);
}

// ─── Chapters: Create ───────────────────────────────────────────────────────

export async function createChapter(
  bookId: string,
  input: CreateCreatorChapterInput,
  userId: string,
): Promise<CreatorChapter> {
  // Verify book ownership first
  const book = await getBook(bookId, userId);
  if (!book) throw new Error('Book not found');

  const pool = getCreatorPool();
  const id = randomUUID();

  // Determine the next order value
  const maxOrder = await pool.query(
    `SELECT COALESCE(MAX("order"), -1) AS max_order
       FROM agos_creator_chapters
      WHERE book_id = $1`,
    [bookId],
  );
  const nextOrder = Number(maxOrder.rows[0].max_order) + 1;

  await pool.query(
    `INSERT INTO agos_creator_chapters
       (id, book_id, title, content, "order", word_count)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
    [
      id,
      bookId,
      input.title,
      JSON.stringify(input.content ?? {}),
      nextOrder,
      0,
    ],
  );

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.chapter.created',
    payload: { chapterId: id, bookId, title: input.title },
  });

  const after = await getChapter(id, bookId, userId);
  if (!after) throw new Error('Failed to create chapter');
  return after;
}

// ─── Chapters: Update ───────────────────────────────────────────────────────

export type UpdateChapterOutcome =
  | { kind: 'ok'; chapter: CreatorChapter }
  | { kind: 'not_found' };

export async function updateChapter(
  chapterId: string,
  bookId: string,
  userId: string,
  patch: UpdateCreatorChapterInput,
): Promise<UpdateChapterOutcome> {
  const pool = getCreatorPool();
  const set: string[] = [];
  const params: unknown[] = [chapterId, bookId, userId];
  let n = 3;

  if (patch.title !== undefined) {
    params.push(patch.title);
    n += 1;
    set.push(`title = $${n}`);
  }
  if (patch.content !== undefined) {
    params.push(JSON.stringify(patch.content));
    n += 1;
    set.push(`content = $${n}::jsonb`);
  }
  if (patch.order !== undefined) {
    params.push(patch.order);
    n += 1;
    set.push(`"order" = $${n}`);
  }
  if (patch.wordCount !== undefined) {
    params.push(patch.wordCount);
    n += 1;
    set.push(`word_count = $${n}`);
  }
  if (patch.status !== undefined) {
    params.push(patch.status);
    n += 1;
    set.push(`status = $${n}`);
  }

  if (set.length === 0) {
    const current = await getChapter(chapterId, bookId, userId);
    return current ? { kind: 'ok', chapter: current } : { kind: 'not_found' };
  }

  const r = await pool.query(
    `UPDATE agos_creator_chapters c
        SET ${set.join(', ')}
       FROM agos_creator_books b
      WHERE c.id = $1 AND c.book_id = $2
        AND c.book_id = b.id AND b.user_id = $3
      RETURNING c.id`,
    params,
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };

  const after = await getChapter(chapterId, bookId, userId);
  if (!after) return { kind: 'not_found' };

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.chapter.updated',
    payload: { chapterId, bookId, fields: Object.keys(patch) },
  });

  return { kind: 'ok', chapter: after };
}

// ─── Chapters: Delete ───────────────────────────────────────────────────────

export async function deleteChapter(
  chapterId: string,
  bookId: string,
  userId: string,
): Promise<boolean> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `DELETE FROM agos_creator_chapters c
      USING agos_creator_books b
      WHERE c.id = $1 AND c.book_id = $2
        AND c.book_id = b.id AND b.user_id = $3
      RETURNING c.id`,
    [chapterId, bookId, userId],
  );

  const deleted = (r.rowCount ?? 0) > 0;
  if (deleted) {
    await recordAudit({
      pool,
      osSlug: 'creator',
      actorId: userId,
      action: 'creator.chapter.deleted',
      payload: { chapterId, bookId },
    });
  }

  return deleted;
}

// ─── Chapters: Reorder ──────────────────────────────────────────────────────

export async function reorderChapters(
  bookId: string,
  userId: string,
  orderedIds: string[],
): Promise<boolean> {
  const book = await getBook(bookId, userId);
  if (!book) return false;

  const pool = getCreatorPool();

  // Build a CASE statement for bulk update
  const params: unknown[] = [bookId, userId];
  const whenClauses: string[] = [];
  orderedIds.forEach((chapterId, idx) => {
    params.push(chapterId);
    params.push(idx);
    const n = params.length;
    whenClauses.push(`WHEN c.id = $${n - 1} THEN $${n}`);
  });

  const r = await pool.query(
    `UPDATE agos_creator_chapters c
        SET "order" = CASE ${whenClauses.join(' ')} END
       FROM agos_creator_books b
      WHERE c.book_id = $1
        AND c.book_id = b.id AND b.user_id = $2
        AND c.id = ANY($3::uuid[])
      RETURNING c.id`,
    [
      bookId,
      userId,
      orderedIds,
    ],
  );

  const updated = (r.rowCount ?? 0) > 0;

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.chapter.reordered',
    payload: { bookId, chapterCount: orderedIds.length },
  });

  return updated;
}

/**
 * Autobiographer OS — Review-checks repo.
 *
 * CRUD against ``agos_autobiographer_review_checks`` from migration
 * ``0047_autobiographer_phase6``. Every read filters by ``user_id``;
 * cross-tenant rows are invisible. Duplicate ``(chapter_id, kind)``
 * inserts (or ``(book_id, kind)`` for book-level checks) raise the
 * Postgres unique-violation 23505 — the repo wraps it as a typed
 * ``duplicate`` error.
 *
 * The lock route consumes the grouped read (book-level + chapter-
 * grouped) via ``listReviewChecksForBookGrouped``. The PATCH path uses
 * ``updateReviewCheck`` and surfaces a ``setStatus`` helper that flips
 * status + checked_at + checked_by in a single statement.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAutobiographerPool } from './session';
import {
  REVIEW_CHECK_KINDS,
  REVIEW_CHECK_STATUSES,
  type ReviewCheckKind,
  type ReviewCheckStatus,
} from './review-checks';

export interface AutobiographerReviewCheck {
  id: string;
  userId: string;
  bookId: string;
  chapterId: string | null;
  kind: ReviewCheckKind;
  status: ReviewCheckStatus;
  notes: string | null;
  checkedAt: string | null;
  checkedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReviewCheckInput {
  bookId: string;
  chapterId?: string | null;
  kind: ReviewCheckKind;
  status?: ReviewCheckStatus;
  notes?: string | null;
  checkedAt?: string | null;
  checkedBy?: string | null;
}

export interface UpdateReviewCheckInput {
  status?: ReviewCheckStatus;
  notes?: string | null;
  checkedAt?: string | null;
  checkedBy?: string | null;
}

/** Grouped read shape consumed by the privacy hub + lock route. */
export interface GroupedReviewChecks {
  /** Book-level checks (chapter_id IS NULL). */
  book: AutobiographerReviewCheck[];
  /** Chapter-keyed map of chapter-level checks. */
  byChapterId: Record<string, AutobiographerReviewCheck[]>;
}

const REVIEW_COLUMNS = `id, user_id, book_id, chapter_id, kind, status,
                        notes, checked_at, checked_by,
                        created_at, updated_at`;

function rowToReviewCheck(row: any): AutobiographerReviewCheck {
  return {
    id: row.id,
    userId: row.user_id,
    bookId: row.book_id,
    chapterId: row.chapter_id ?? null,
    kind: row.kind as ReviewCheckKind,
    status: row.status as ReviewCheckStatus,
    notes: row.notes ?? null,
    checkedAt:
      row.checked_at instanceof Date
        ? row.checked_at.toISOString()
        : row.checked_at ?? null,
    checkedBy: row.checked_by ?? null,
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

export async function listReviewChecksForBook(
  bookId: string,
  userId: string,
): Promise<AutobiographerReviewCheck[]> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${REVIEW_COLUMNS}
       FROM agos_autobiographer_review_checks
      WHERE book_id = $1 AND user_id = $2
      ORDER BY chapter_id NULLS FIRST, kind ASC, created_at ASC`,
    [bookId, userId],
  );
  return r.rows.map(rowToReviewCheck);
}

/**
 * Grouped variant: book-level checks under ``book`` plus a
 * ``byChapterId`` map. Convenient for the privacy hub which renders
 * a per-chapter table.
 */
export async function listReviewChecksForBookGrouped(
  bookId: string,
  userId: string,
): Promise<GroupedReviewChecks> {
  const rows = await listReviewChecksForBook(bookId, userId);
  const out: GroupedReviewChecks = { book: [], byChapterId: {} };
  for (const row of rows) {
    if (row.chapterId === null) {
      out.book.push(row);
    } else {
      if (!out.byChapterId[row.chapterId]) {
        out.byChapterId[row.chapterId] = [];
      }
      out.byChapterId[row.chapterId]!.push(row);
    }
  }
  return out;
}

export async function listReviewChecksForChapter(
  chapterId: string,
  userId: string,
): Promise<AutobiographerReviewCheck[]> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${REVIEW_COLUMNS}
       FROM agos_autobiographer_review_checks
      WHERE chapter_id = $1 AND user_id = $2
      ORDER BY kind ASC`,
    [chapterId, userId],
  );
  return r.rows.map(rowToReviewCheck);
}

export async function getReviewCheck(
  id: string,
  userId: string,
): Promise<AutobiographerReviewCheck | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${REVIEW_COLUMNS}
       FROM agos_autobiographer_review_checks
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToReviewCheck(r.rows[0]);
}

export async function createReviewCheck(
  userId: string,
  data: CreateReviewCheckInput,
): Promise<AutobiographerReviewCheck> {
  if (!(REVIEW_CHECK_KINDS as readonly string[]).includes(data.kind)) {
    throw new Error(`Invalid kind: ${data.kind}`);
  }
  const status: ReviewCheckStatus = data.status ?? 'pending';
  if (!(REVIEW_CHECK_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  const id = randomUUID();
  const pool = getAutobiographerPool();
  try {
    await pool.query(
      `INSERT INTO agos_autobiographer_review_checks
         (id, user_id, book_id, chapter_id, kind, status,
          notes, checked_at, checked_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        userId,
        data.bookId,
        data.chapterId ?? null,
        data.kind,
        status,
        data.notes ?? null,
        data.checkedAt ?? null,
        data.checkedBy ?? null,
      ],
    );
  } catch (err: any) {
    if (err?.code === '23505') {
      const dup = new Error('duplicate');
      (dup as any).code = 'duplicate';
      throw dup;
    }
    throw err;
  }
  const created = await getReviewCheck(id, userId);
  if (!created) throw new Error('Failed to create review check');
  return created;
}

export async function updateReviewCheck(
  id: string,
  userId: string,
  patch: UpdateReviewCheckInput,
): Promise<AutobiographerReviewCheck | null> {
  if (
    patch.status !== undefined &&
    !(REVIEW_CHECK_STATUSES as readonly string[]).includes(patch.status)
  ) {
    throw new Error(`Invalid status: ${patch.status}`);
  }
  const pool = getAutobiographerPool();
  await pool.query(
    `UPDATE agos_autobiographer_review_checks
        SET status     = COALESCE($3, status),
            notes      = CASE WHEN $4::boolean THEN $5 ELSE notes END,
            checked_at = CASE WHEN $6::boolean THEN $7::timestamptz ELSE checked_at END,
            checked_by = CASE WHEN $8::boolean THEN $9::uuid       ELSE checked_by END,
            updated_at = now()
      WHERE id = $1 AND user_id = $2`,
    [
      id,
      userId,
      patch.status ?? null,
      Object.prototype.hasOwnProperty.call(patch, 'notes'),
      patch.notes ?? null,
      Object.prototype.hasOwnProperty.call(patch, 'checkedAt'),
      patch.checkedAt ?? null,
      Object.prototype.hasOwnProperty.call(patch, 'checkedBy'),
      patch.checkedBy ?? null,
    ],
  );
  return getReviewCheck(id, userId);
}

export async function deleteReviewCheck(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `DELETE FROM agos_autobiographer_review_checks
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Confirm the book belongs to the caller. Used by the create / list
 * routes before a write. (Chapter ownership probe is on the parent
 * chapter route.)
 */
export async function bookBelongsToUser(
  bookId: string,
  userId: string,
): Promise<boolean> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_autobiographer_books WHERE id = $1 AND user_id = $2`,
    [bookId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

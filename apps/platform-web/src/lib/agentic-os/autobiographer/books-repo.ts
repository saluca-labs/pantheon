/**
 * Autobiographer OS — Books repo.
 *
 * CRUD against `agos_autobiographer_books` from migration
 * `0041_autobiographer_phase1`. Every read filters by `user_id` so a row
 * is only ever visible to the user who created it.
 *
 * `softDeleteBook` flips the status to `archived` while preserving the row;
 * `deleteBook` issues a hard DELETE that detaches attached memories via
 * the `ON DELETE SET NULL` FK on `agos_autobiographer_memories.book_id`.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAutobiographerPool } from './session';
import {
  BOOK_STATUSES,
  bookPhaseProgressDefault,
  coerceBookPhaseProgress,
  normalizeBookTags,
  type BookPhaseProgress,
  type BookStatus,
} from './books';

export interface AutobiographerBook {
  id: string;
  userId: string;
  title: string;
  subtitle: string | null;
  coverImageUrl: string | null;
  description: string | null;
  status: BookStatus;
  targetCompletionDate: string | null;
  targetAudience: string | null;
  tags: string[];
  phaseProgress: BookPhaseProgress;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBookInput {
  title: string;
  subtitle?: string | null;
  coverImageUrl?: string | null;
  description?: string | null;
  status?: BookStatus;
  targetCompletionDate?: string | null;
  targetAudience?: string | null;
  tags?: string[];
  phaseProgress?: BookPhaseProgress;
  metadata?: Record<string, unknown>;
}

export type UpdateBookInput = Partial<CreateBookInput>;

const BOOK_COLUMNS = `id, user_id, title, subtitle, cover_image_url, description,
                      status, target_completion_date, target_audience,
                      tags, phase_progress, metadata,
                      created_at, updated_at`;

interface RawBookRow {
  id: string;
  user_id: string;
  title: string;
  subtitle: string | null;
  cover_image_url: string | null;
  description: string | null;
  status: string | null;
  target_completion_date: Date | string | null;
  target_audience: string | null;
  tags: string[] | null;
  phase_progress: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function rowToBook(row: RawBookRow): AutobiographerBook {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    subtitle: row.subtitle ?? null,
    coverImageUrl: row.cover_image_url ?? null,
    description: row.description ?? null,
    status: (row.status as BookStatus) ?? 'drafting',
    targetCompletionDate: row.target_completion_date
      ? new Date(row.target_completion_date).toISOString().slice(0, 10)
      : null,
    targetAudience: row.target_audience ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    phaseProgress: coerceBookPhaseProgress(row.phase_progress),
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

export interface ListBooksArgs {
  userId: string;
  status?: BookStatus;
  tag?: string;
  limit?: number;
  offset?: number;
}

export async function listBooks(args: ListBooksArgs): Promise<AutobiographerBook[]> {
  const pool = getAutobiographerPool();
  const params: unknown[] = [args.userId];
  const where: string[] = ['user_id = $1'];

  if (args.status) {
    if (!(BOOK_STATUSES as readonly string[]).includes(args.status)) {
      throw new Error(`Invalid status: ${args.status}`);
    }
    params.push(args.status);
    where.push(`status = $${params.length}`);
  }
  if (args.tag && args.tag.trim()) {
    params.push(args.tag.trim());
    where.push(`$${params.length} = ANY(tags)`);
  }

  const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
  const offset = Math.max(0, args.offset ?? 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${BOOK_COLUMNS}
       FROM agos_autobiographer_books
      WHERE ${where.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToBook);
}

export async function getBook(
  id: string,
  userId: string,
): Promise<AutobiographerBook | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${BOOK_COLUMNS}
       FROM agos_autobiographer_books
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToBook(r.rows[0]);
}

export interface BookWithMemoryCount extends AutobiographerBook {
  memoryCount: number;
}

/** Like `getBook` but joins the count of memories attached to this book. */
export async function getBookWithCounts(
  id: string,
  userId: string,
): Promise<BookWithMemoryCount | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${BOOK_COLUMNS.split(',')
      .map((c) => `b.${c.trim()}`)
      .join(', ')},
            (SELECT COUNT(*)::int
               FROM agos_autobiographer_memories m
              WHERE m.book_id = b.id) AS memory_count
       FROM agos_autobiographer_books b
      WHERE b.id = $1 AND b.user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  const row = r.rows[0];
  return {
    ...rowToBook(row),
    memoryCount: Number(row.memory_count ?? 0),
  };
}

export async function createBook(
  userId: string,
  data: CreateBookInput,
): Promise<AutobiographerBook> {
  const pool = getAutobiographerPool();
  const id = randomUUID();

  const status: BookStatus = data.status ?? 'drafting';
  if (!(BOOK_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  const phaseProgress = data.phaseProgress ?? bookPhaseProgressDefault();
  const tags = normalizeBookTags(data.tags ?? []);

  await pool.query(
    `INSERT INTO agos_autobiographer_books
       (id, user_id, title, subtitle, cover_image_url, description,
        status, target_completion_date, target_audience,
        tags, phase_progress, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text[],$11::jsonb,$12::jsonb)`,
    [
      id,
      userId,
      data.title,
      data.subtitle ?? null,
      data.coverImageUrl ?? null,
      data.description ?? null,
      status,
      data.targetCompletionDate ?? null,
      data.targetAudience ?? null,
      tags,
      JSON.stringify(phaseProgress),
      JSON.stringify(data.metadata ?? {}),
    ],
  );

  const book = await getBook(id, userId);
  if (!book) throw new Error('Failed to create book');
  return book;
}

export async function updateBook(
  id: string,
  userId: string,
  patch: UpdateBookInput,
): Promise<AutobiographerBook | null> {
  const pool = getAutobiographerPool();
  if (
    patch.status !== undefined &&
    !(BOOK_STATUSES as readonly string[]).includes(patch.status)
  ) {
    throw new Error(`Invalid status: ${patch.status}`);
  }
  const tags = patch.tags ? normalizeBookTags(patch.tags) : null;

  await pool.query(
    `UPDATE agos_autobiographer_books
        SET title                  = COALESCE($3,  title),
            subtitle               = COALESCE($4,  subtitle),
            cover_image_url        = COALESCE($5,  cover_image_url),
            description            = COALESCE($6,  description),
            status                 = COALESCE($7,  status),
            target_completion_date = COALESCE($8,  target_completion_date),
            target_audience        = COALESCE($9,  target_audience),
            tags                   = COALESCE($10::text[], tags),
            phase_progress         = COALESCE($11::jsonb,  phase_progress),
            metadata               = COALESCE($12::jsonb,  metadata),
            updated_at             = now()
      WHERE id = $1 AND user_id = $2`,
    [
      id,
      userId,
      patch.title ?? null,
      patch.subtitle ?? null,
      patch.coverImageUrl ?? null,
      patch.description ?? null,
      patch.status ?? null,
      patch.targetCompletionDate ?? null,
      patch.targetAudience ?? null,
      tags,
      patch.phaseProgress ? JSON.stringify(patch.phaseProgress) : null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  return getBook(id, userId);
}

/**
 * Soft-delete: set status to 'archived' without removing the row. Attached
 * memories stay attached and the user can restore by patching status back.
 */
export async function softDeleteBook(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `UPDATE agos_autobiographer_books
        SET status = 'archived', updated_at = now()
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Hard-delete: remove the row. Attached memories survive via the
 * `ON DELETE SET NULL` FK on `agos_autobiographer_memories.book_id`.
 */
export async function deleteBook(id: string, userId: string): Promise<boolean> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `DELETE FROM agos_autobiographer_books WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

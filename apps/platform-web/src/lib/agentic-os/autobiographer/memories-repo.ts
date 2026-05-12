/**
 * Autobiographer OS — Memories repo.
 *
 * CRUD against `agos_autobiographer_memories` from migration
 * `0041_autobiographer_phase1`. Memories are workshop-global; a memory
 * may be attached to a book via `book_id` (nullable). Cross-ownership
 * is enforced by always filtering reads/writes on `user_id`, and by
 * `attachMemoryToBook` validating the target book belongs to the caller
 * before persisting.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAutobiographerPool } from './session';
import {
  MEMORY_SOURCES,
  normalizeMemoryTags,
  normalizePhotoUrls,
  type MemorySource,
} from './memories';
import {
  validateSensitiveKindsStrict,
  type SensitiveKind,
} from './sensitive-kinds';

export interface AutobiographerMemory {
  id: string;
  userId: string;
  bookId: string | null;
  title: string;
  bodyMarkdown: string;
  transcript: string | null;
  audioUrl: string | null;
  photoUrls: string[];
  whenInLife: string | null;
  eraDateEstimate: string | null;
  location: string | null;
  emotionTags: string[];
  contentTags: string[];
  isSensitive: boolean;
  source: MemorySource;
  /** Phase 6 — sensitive-kind tags. Empty array when untagged. */
  sensitiveKinds: SensitiveKind[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMemoryInput {
  bookId?: string | null;
  title: string;
  bodyMarkdown: string;
  transcript?: string | null;
  audioUrl?: string | null;
  photoUrls?: string[];
  whenInLife?: string | null;
  eraDateEstimate?: string | null;
  location?: string | null;
  emotionTags?: string[];
  contentTags?: string[];
  isSensitive?: boolean;
  source?: MemorySource;
  /** Phase 6 — sensitive-kind tags (whitelisted enum, validated app-side). */
  sensitiveKinds?: readonly string[];
  metadata?: Record<string, unknown>;
}

export type UpdateMemoryInput = Partial<CreateMemoryInput>;

const MEMORY_COLUMNS = `id, user_id, book_id, title, body_markdown, transcript,
                        audio_url, photo_urls,
                        when_in_life, era_date_estimate, location,
                        emotion_tags, content_tags, is_sensitive, source,
                        sensitive_kinds,
                        metadata, created_at, updated_at`;

function rowToMemory(row: any): AutobiographerMemory {
  return {
    id: row.id,
    userId: row.user_id,
    bookId: row.book_id ?? null,
    title: row.title,
    bodyMarkdown: row.body_markdown ?? '',
    transcript: row.transcript ?? null,
    audioUrl: row.audio_url ?? null,
    photoUrls: Array.isArray(row.photo_urls) ? row.photo_urls : [],
    whenInLife: row.when_in_life ?? null,
    eraDateEstimate: row.era_date_estimate
      ? new Date(row.era_date_estimate).toISOString().slice(0, 10)
      : null,
    location: row.location ?? null,
    emotionTags: Array.isArray(row.emotion_tags) ? row.emotion_tags : [],
    contentTags: Array.isArray(row.content_tags) ? row.content_tags : [],
    isSensitive: Boolean(row.is_sensitive),
    source: (row.source as MemorySource) ?? 'text',
    sensitiveKinds: Array.isArray(row.sensitive_kinds)
      ? (row.sensitive_kinds.filter((k: unknown) =>
          typeof k === 'string',
        ) as SensitiveKind[])
      : [],
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

export interface ListMemoriesArgs {
  userId: string;
  bookId?: string | null;
  /** Filter on a specific `content_tags` entry. */
  contentTag?: string;
  /** Filter on a specific `emotion_tags` entry. */
  emotionTag?: string;
  isSensitive?: boolean;
  /** Inclusive lower bound on `era_date_estimate` (YYYY-MM-DD). */
  eraAfter?: string;
  /** Inclusive upper bound on `era_date_estimate` (YYYY-MM-DD). */
  eraBefore?: string;
  limit?: number;
  offset?: number;
}

export async function listMemories(
  args: ListMemoriesArgs,
): Promise<AutobiographerMemory[]> {
  const pool = getAutobiographerPool();
  const params: any[] = [args.userId];
  const where: string[] = ['user_id = $1'];

  if (args.bookId !== undefined) {
    if (args.bookId === null) {
      where.push(`book_id IS NULL`);
    } else {
      params.push(args.bookId);
      where.push(`book_id = $${params.length}`);
    }
  }
  if (args.contentTag && args.contentTag.trim()) {
    params.push(args.contentTag.trim());
    where.push(`$${params.length} = ANY(content_tags)`);
  }
  if (args.emotionTag && args.emotionTag.trim()) {
    params.push(args.emotionTag.trim());
    where.push(`$${params.length} = ANY(emotion_tags)`);
  }
  if (args.isSensitive !== undefined) {
    params.push(args.isSensitive);
    where.push(`is_sensitive = $${params.length}`);
  }
  if (args.eraAfter) {
    params.push(args.eraAfter);
    where.push(`era_date_estimate >= $${params.length}`);
  }
  if (args.eraBefore) {
    params.push(args.eraBefore);
    where.push(`era_date_estimate <= $${params.length}`);
  }

  const limit = Math.max(1, Math.min(args.limit ?? 25, 100));
  const offset = Math.max(0, args.offset ?? 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${MEMORY_COLUMNS}
       FROM agos_autobiographer_memories
      WHERE ${where.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToMemory);
}

export async function getMemory(
  id: string,
  userId: string,
): Promise<AutobiographerMemory | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${MEMORY_COLUMNS}
       FROM agos_autobiographer_memories
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToMemory(r.rows[0]);
}

/**
 * Check that a given book belongs to `userId`. Returns true if the book
 * exists and is owned by the user, false otherwise. Used by
 * `createMemory` and `attachMemoryToBook` to enforce cross-ownership.
 */
async function bookBelongsToUser(
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

export async function createMemory(
  userId: string,
  data: CreateMemoryInput,
): Promise<AutobiographerMemory> {
  const pool = getAutobiographerPool();

  // Cross-ownership safety: if a book_id is supplied, it MUST belong to
  // the caller. Returns a typed error the route layer maps to 404.
  if (data.bookId) {
    const ok = await bookBelongsToUser(data.bookId, userId);
    if (!ok) {
      const err = new Error('book_not_found');
      (err as any).code = 'book_not_found';
      throw err;
    }
  }

  const source: MemorySource = data.source ?? 'text';
  if (!(MEMORY_SOURCES as readonly string[]).includes(source)) {
    throw new Error(`Invalid source: ${source}`);
  }

  const id = randomUUID();
  const contentTags = normalizeMemoryTags(data.contentTags ?? []);
  const emotionTags = normalizeMemoryTags(data.emotionTags ?? []);
  const photoUrls = normalizePhotoUrls(data.photoUrls ?? []);
  const sensitiveKinds = data.sensitiveKinds
    ? validateSensitiveKindsStrict(data.sensitiveKinds)
    : [];

  await pool.query(
    `INSERT INTO agos_autobiographer_memories
       (id, user_id, book_id, title, body_markdown, transcript,
        audio_url, photo_urls,
        when_in_life, era_date_estimate, location,
        emotion_tags, content_tags, is_sensitive, source,
        sensitive_kinds, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::text[],$9,$10,$11,$12::text[],$13::text[],$14,$15,$16::text[],$17::jsonb)`,
    [
      id,
      userId,
      data.bookId ?? null,
      data.title,
      data.bodyMarkdown,
      data.transcript ?? null,
      data.audioUrl ?? null,
      photoUrls,
      data.whenInLife ?? null,
      data.eraDateEstimate ?? null,
      data.location ?? null,
      emotionTags,
      contentTags,
      data.isSensitive ?? false,
      source,
      sensitiveKinds,
      JSON.stringify(data.metadata ?? {}),
    ],
  );

  const memory = await getMemory(id, userId);
  if (!memory) throw new Error('Failed to create memory');
  return memory;
}

export async function updateMemory(
  id: string,
  userId: string,
  patch: UpdateMemoryInput,
): Promise<AutobiographerMemory | null> {
  const pool = getAutobiographerPool();

  // Cross-ownership safety: a book reassignment must point at a book the
  // caller owns. `null` is an explicit "detach" and is always allowed.
  if (patch.bookId) {
    const ok = await bookBelongsToUser(patch.bookId, userId);
    if (!ok) {
      const err = new Error('book_not_found');
      (err as any).code = 'book_not_found';
      throw err;
    }
  }

  if (
    patch.source !== undefined &&
    !(MEMORY_SOURCES as readonly string[]).includes(patch.source)
  ) {
    throw new Error(`Invalid source: ${patch.source}`);
  }

  // Special handling: `bookId === null` is "detach", not "leave unchanged".
  // We pass a sentinel so the UPDATE can distinguish between "not in patch"
  // and "explicitly null".
  const bookIdProvided = Object.prototype.hasOwnProperty.call(patch, 'bookId');
  const contentTags = patch.contentTags
    ? normalizeMemoryTags(patch.contentTags)
    : null;
  const emotionTags = patch.emotionTags
    ? normalizeMemoryTags(patch.emotionTags)
    : null;
  const photoUrls = patch.photoUrls ? normalizePhotoUrls(patch.photoUrls) : null;
  const sensitiveKindsProvided = Object.prototype.hasOwnProperty.call(
    patch,
    'sensitiveKinds',
  );
  const sensitiveKinds = patch.sensitiveKinds
    ? validateSensitiveKindsStrict(patch.sensitiveKinds)
    : [];

  await pool.query(
    `UPDATE agos_autobiographer_memories
        SET book_id            = CASE WHEN $3::boolean THEN $4::uuid ELSE book_id END,
            title              = COALESCE($5,  title),
            body_markdown      = COALESCE($6,  body_markdown),
            transcript         = COALESCE($7,  transcript),
            audio_url          = COALESCE($8,  audio_url),
            photo_urls         = COALESCE($9::text[], photo_urls),
            when_in_life       = COALESCE($10, when_in_life),
            era_date_estimate  = COALESCE($11, era_date_estimate),
            location           = COALESCE($12, location),
            emotion_tags       = COALESCE($13::text[], emotion_tags),
            content_tags       = COALESCE($14::text[], content_tags),
            is_sensitive       = COALESCE($15, is_sensitive),
            source             = COALESCE($16, source),
            sensitive_kinds    = CASE WHEN $17::boolean THEN $18::text[] ELSE sensitive_kinds END,
            metadata           = COALESCE($19::jsonb, metadata),
            updated_at         = now()
      WHERE id = $1 AND user_id = $2`,
    [
      id,
      userId,
      bookIdProvided,
      patch.bookId ?? null,
      patch.title ?? null,
      patch.bodyMarkdown ?? null,
      patch.transcript ?? null,
      patch.audioUrl ?? null,
      photoUrls,
      patch.whenInLife ?? null,
      patch.eraDateEstimate ?? null,
      patch.location ?? null,
      emotionTags,
      contentTags,
      patch.isSensitive ?? null,
      patch.source ?? null,
      sensitiveKindsProvided,
      sensitiveKinds,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );

  return getMemory(id, userId);
}

export async function deleteMemory(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `DELETE FROM agos_autobiographer_memories WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * List memories attached to a single book. Convenience wrapper over
 * `listMemories` used by the per-book route.
 */
export async function listMemoriesForBook(
  bookId: string,
  userId: string,
  args: Pick<ListMemoriesArgs, 'limit' | 'offset'> = {},
): Promise<AutobiographerMemory[]> {
  return listMemories({
    userId,
    bookId,
    limit: args.limit,
    offset: args.offset,
  });
}

/**
 * Bulk fetch memories by id, filtered by user. Used by the Phase 4 PDF
 * export route to resolve citation memory ids to display titles in a
 * single round trip. Returns memories that exist and belong to the
 * user; silently drops unknown / foreign ids.
 */
export async function getMemoriesByIds(
  ids: readonly string[],
  userId: string,
): Promise<AutobiographerMemory[]> {
  if (ids.length === 0) return [];
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${MEMORY_COLUMNS}
       FROM agos_autobiographer_memories
      WHERE id = ANY($1::uuid[]) AND user_id = $2`,
    [Array.from(new Set(ids)), userId],
  );
  return r.rows.map(rowToMemory);
}

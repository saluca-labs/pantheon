/**
 * Autobiographer OS — Voice samples repo.
 *
 * CRUD against `agos_autobiographer_voice_samples` from migration
 * `0044_autobiographer_phase3`. Every read filters by `user_id` so a
 * sample is only ever visible to its owner. When a `memory_id` is
 * supplied, the repo's `createVoiceSample` validates ownership of the
 * memory before insert — a foreign memory yields `not_found` so we
 * preserve the no-existence-leak property the Phase 2 join enforced.
 *
 * `word_count` is computed server-side on every write (create + body
 * update). Soft-archive flips `is_archived`; hard delete removes the
 * row outright.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAutobiographerPool } from './session';
import { countVoiceSampleWords } from './voice-samples';

export interface AutobiographerVoiceSample {
  id: string;
  userId: string;
  memoryId: string | null;
  title: string | null;
  bodyText: string;
  wordCount: number;
  isArchived: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVoiceSampleInput {
  memoryId?: string | null;
  title?: string | null;
  bodyText: string;
  isArchived?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdateVoiceSampleInput {
  title?: string | null;
  bodyText?: string;
  isArchived?: boolean;
  metadata?: Record<string, unknown>;
}

const SAMPLE_COLUMNS = `id, user_id, memory_id, title, body_text, word_count,
                        is_archived, metadata, created_at, updated_at`;

function rowToSample(row: any): AutobiographerVoiceSample {
  return {
    id: row.id,
    userId: row.user_id,
    memoryId: row.memory_id ?? null,
    title: row.title ?? null,
    bodyText: row.body_text,
    wordCount: Number(row.word_count ?? 0),
    isArchived: Boolean(row.is_archived),
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

export interface ListVoiceSamplesArgs {
  userId: string;
  /** Filter by archive state. Omit to return everything. */
  isArchived?: boolean;
  /** Substring search over title + body_text. */
  q?: string;
  /** Only memory-backed (true) / only free-typed (false) / both (undefined). */
  memoryBacked?: boolean;
  limit?: number;
  offset?: number;
}

export async function listVoiceSamples(
  args: ListVoiceSamplesArgs,
): Promise<AutobiographerVoiceSample[]> {
  const pool = getAutobiographerPool();
  const params: any[] = [args.userId];
  const where: string[] = ['user_id = $1'];

  if (args.isArchived !== undefined) {
    params.push(args.isArchived);
    where.push(`is_archived = $${params.length}`);
  }
  if (args.memoryBacked === true) {
    where.push(`memory_id IS NOT NULL`);
  } else if (args.memoryBacked === false) {
    where.push(`memory_id IS NULL`);
  }
  if (args.q && args.q.trim()) {
    params.push(`%${args.q.trim().toLowerCase()}%`);
    where.push(
      `(lower(coalesce(title, '')) LIKE $${params.length} OR lower(body_text) LIKE $${params.length})`,
    );
  }

  const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
  const offset = Math.max(0, args.offset ?? 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${SAMPLE_COLUMNS}
       FROM agos_autobiographer_voice_samples
      WHERE ${where.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToSample);
}

export async function getVoiceSample(
  id: string,
  userId: string,
): Promise<AutobiographerVoiceSample | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${SAMPLE_COLUMNS}
       FROM agos_autobiographer_voice_samples
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToSample(r.rows[0]);
}

/**
 * Find the existing sample for `(userId, memoryId)`, if any. Used by the
 * memory-detail "Mark as voice sample" toggle so it can switch between
 * mark/unmark idempotently without forcing a duplicate insert.
 */
export async function getVoiceSampleByMemory(
  memoryId: string,
  userId: string,
): Promise<AutobiographerVoiceSample | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${SAMPLE_COLUMNS}
       FROM agos_autobiographer_voice_samples
      WHERE memory_id = $1 AND user_id = $2
      ORDER BY created_at ASC
      LIMIT 1`,
    [memoryId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToSample(r.rows[0]);
}

/**
 * Insert a sample row. When `memoryId` is set the caller is expected to
 * have validated ownership; the route layer does that probe so the no-
 * existence-leak property holds at the API boundary.
 */
export async function createVoiceSample(
  userId: string,
  data: CreateVoiceSampleInput,
): Promise<AutobiographerVoiceSample> {
  const pool = getAutobiographerPool();
  const id = randomUUID();
  const body = data.bodyText;
  const wc = countVoiceSampleWords(body);
  await pool.query(
    `INSERT INTO agos_autobiographer_voice_samples
       (id, user_id, memory_id, title, body_text, word_count, is_archived, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [
      id,
      userId,
      data.memoryId ?? null,
      data.title ?? null,
      body,
      wc,
      data.isArchived ?? false,
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const sample = await getVoiceSample(id, userId);
  if (!sample) throw new Error('Failed to create voice sample');
  return sample;
}

/**
 * Partial update with server-side `word_count` recompute when `bodyText`
 * is supplied. `is_archived` is set explicitly when the caller passes a
 * boolean (so `archive`/`unarchive` actions are a single PATCH).
 */
export async function updateVoiceSample(
  id: string,
  userId: string,
  patch: UpdateVoiceSampleInput,
): Promise<AutobiographerVoiceSample | null> {
  const pool = getAutobiographerPool();

  let wc: number | null = null;
  if (patch.bodyText !== undefined) {
    wc = countVoiceSampleWords(patch.bodyText);
  }

  await pool.query(
    `UPDATE agos_autobiographer_voice_samples
        SET title       = COALESCE($3, title),
            body_text   = COALESCE($4, body_text),
            word_count  = COALESCE($5, word_count),
            is_archived = COALESCE($6, is_archived),
            metadata    = COALESCE($7::jsonb, metadata),
            updated_at  = now()
      WHERE id = $1 AND user_id = $2`,
    [
      id,
      userId,
      patch.title ?? null,
      patch.bodyText ?? null,
      wc,
      patch.isArchived === undefined ? null : patch.isArchived,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  return getVoiceSample(id, userId);
}

export async function deleteVoiceSample(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `DELETE FROM agos_autobiographer_voice_samples
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Builder-input helpers ──────────────────────────────────────────────────

export interface VoiceSampleBuilderInput {
  id: string;
  title: string | null;
  bodyText: string;
  wordCount: number;
  memoryId: string | null;
}

/**
 * Fetch the user's active (non-archived) samples in the shape the Phase 3
 * voice builder consumes. Returns the rows ordered oldest-first so the
 * builder's analyses are reproducible across runs.
 */
export async function listSamplesForBuilder(
  userId: string,
): Promise<VoiceSampleBuilderInput[]> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT id, title, body_text, word_count, memory_id
       FROM agos_autobiographer_voice_samples
      WHERE user_id = $1 AND is_archived = false
      ORDER BY created_at ASC`,
    [userId],
  );
  return r.rows.map((row: any) => ({
    id: row.id,
    title: row.title ?? null,
    bodyText: row.body_text,
    wordCount: Number(row.word_count ?? 0),
    memoryId: row.memory_id ?? null,
  }));
}

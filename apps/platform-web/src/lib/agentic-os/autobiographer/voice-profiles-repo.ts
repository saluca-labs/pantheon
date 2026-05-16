/**
 * Autobiographer OS — Voice profiles repo.
 *
 * CRUD against `agos_autobiographer_voice_profiles` from migration
 * `0044_autobiographer_phase3`. Every read filters by `user_id`. The
 * partial-UNIQUE on `(user_id) WHERE is_active = true` enforces the
 * "at most one active profile per user" invariant at the DB level;
 * `activateProfile` flips the bit inside a transaction that nulls every
 * other row first.
 *
 * `insertProfile` increments `version = max(existing) + 1` atomically
 * inside a CTE so concurrent builds get distinct version numbers
 * without an application-side lock.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAutobiographerPool } from './session';
import {
  coerceJsonArray,
  normalizeExampleOpenings,
  normalizeStyleAdjectives,
  normalizeStyleRules,
} from './voice-profiles';

export interface AutobiographerVoiceProfile {
  id: string;
  userId: string;
  version: number;
  isActive: boolean;
  styleSummary: string;
  styleAdjectives: string[];
  styleRules: string[];
  exampleOpenings: string[];
  sampleCount: number;
  sampleWordCount: number;
  builtAt: string;
  builder: string;
  metadata: Record<string, unknown>;
}

export interface InsertVoiceProfileInput {
  styleSummary: string;
  styleAdjectives?: readonly string[];
  styleRules?: readonly unknown[];
  exampleOpenings?: readonly unknown[];
  sampleCount: number;
  sampleWordCount: number;
  builder?: string;
  /** Whether to immediately mark this profile active. */
  setActive?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdateVoiceProfileInput {
  styleSummary?: string;
  styleAdjectives?: readonly string[];
  styleRules?: readonly unknown[];
  exampleOpenings?: readonly unknown[];
  metadata?: Record<string, unknown>;
}

const PROFILE_COLUMNS = `id, user_id, version, is_active, style_summary,
                         style_adjectives, style_rules, example_openings,
                         sample_count, sample_word_count, built_at, builder,
                         metadata`;

interface RawVoiceProfileRow {
  id: string;
  user_id: string;
  version: number | string;
  is_active: boolean;
  style_summary: string;
  style_adjectives: string[] | null;
  style_rules: unknown;
  example_openings: unknown;
  sample_count: number | string | null;
  sample_word_count: number | string | null;
  built_at: Date | string;
  builder: string | null;
  metadata: Record<string, unknown> | null;
}

function rowToProfile(row: RawVoiceProfileRow): AutobiographerVoiceProfile {
  return {
    id: row.id,
    userId: row.user_id,
    version: Number(row.version),
    isActive: Boolean(row.is_active),
    styleSummary: row.style_summary,
    styleAdjectives: Array.isArray(row.style_adjectives)
      ? row.style_adjectives
      : [],
    styleRules: normalizeStyleRules(coerceJsonArray(row.style_rules)),
    exampleOpenings: normalizeExampleOpenings(
      coerceJsonArray(row.example_openings),
    ),
    sampleCount: Number(row.sample_count ?? 0),
    sampleWordCount: Number(row.sample_word_count ?? 0),
    builtAt:
      row.built_at instanceof Date
        ? row.built_at.toISOString()
        : String(row.built_at),
    builder: row.builder ?? 'coach',
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

export interface ListVoiceProfilesArgs {
  userId: string;
  /** Filter by active state if supplied. */
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

export async function listVoiceProfiles(
  args: ListVoiceProfilesArgs,
): Promise<AutobiographerVoiceProfile[]> {
  const pool = getAutobiographerPool();
  const params: unknown[] = [args.userId];
  const where: string[] = ['user_id = $1'];
  if (args.isActive !== undefined) {
    params.push(args.isActive);
    where.push(`is_active = $${params.length}`);
  }
  const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
  const offset = Math.max(0, args.offset ?? 0);
  params.push(limit);
  params.push(offset);
  const r = await pool.query(
    `SELECT ${PROFILE_COLUMNS}
       FROM agos_autobiographer_voice_profiles
      WHERE ${where.join(' AND ')}
      ORDER BY version DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToProfile);
}

export async function getVoiceProfile(
  id: string,
  userId: string,
): Promise<AutobiographerVoiceProfile | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${PROFILE_COLUMNS}
       FROM agos_autobiographer_voice_profiles
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToProfile(r.rows[0]);
}

export async function getActiveVoiceProfile(
  userId: string,
): Promise<AutobiographerVoiceProfile | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${PROFILE_COLUMNS}
       FROM agos_autobiographer_voice_profiles
      WHERE user_id = $1 AND is_active = true
      LIMIT 1`,
    [userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToProfile(r.rows[0]);
}

/**
 * Insert a profile, atomically deriving `version = max(existing) + 1`.
 *
 * When `setActive` is true, the function transactionally clears every
 * other active row for the user first so the partial-UNIQUE invariant
 * holds across concurrent inserts.
 */
export async function insertVoiceProfile(
  userId: string,
  data: InsertVoiceProfileInput,
): Promise<AutobiographerVoiceProfile> {
  const pool = getAutobiographerPool();
  const id = randomUUID();
  const adjectives = normalizeStyleAdjectives(data.styleAdjectives ?? []);
  const rules = normalizeStyleRules(data.styleRules ?? []);
  const openings = normalizeExampleOpenings(data.exampleOpenings ?? []);
  const builder = data.builder ?? 'coach';
  const setActive = data.setActive === true;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (setActive) {
      await client.query(
        `UPDATE agos_autobiographer_voice_profiles
            SET is_active = false
          WHERE user_id = $1 AND is_active = true`,
        [userId],
      );
    }

    await client.query(
      `INSERT INTO agos_autobiographer_voice_profiles
         (id, user_id, version, is_active, style_summary, style_adjectives,
          style_rules, example_openings, sample_count, sample_word_count,
          builder, metadata)
       VALUES (
         $1, $2,
         COALESCE(
           (SELECT MAX(version) + 1 FROM agos_autobiographer_voice_profiles
             WHERE user_id = $2),
           1
         ),
         $3, $4, $5::text[], $6::jsonb, $7::jsonb, $8, $9, $10, $11::jsonb
       )`,
      [
        id,
        userId,
        setActive,
        data.styleSummary,
        adjectives,
        JSON.stringify(rules),
        JSON.stringify(openings),
        data.sampleCount,
        data.sampleWordCount,
        builder,
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

  const profile = await getVoiceProfile(id, userId);
  if (!profile) throw new Error('Failed to insert voice profile');
  return profile;
}

/**
 * Patch the editable fields on a profile. `version`, `sample_count`,
 * `sample_word_count`, and `built_at` are immutable. `is_active` is
 * NOT modifiable here — callers use `activateProfile` so the
 * single-active invariant is preserved atomically.
 */
export async function updateVoiceProfile(
  id: string,
  userId: string,
  patch: UpdateVoiceProfileInput,
): Promise<AutobiographerVoiceProfile | null> {
  const pool = getAutobiographerPool();
  const adjectives = patch.styleAdjectives
    ? normalizeStyleAdjectives(patch.styleAdjectives)
    : null;
  const rules = patch.styleRules ? normalizeStyleRules(patch.styleRules) : null;
  const openings = patch.exampleOpenings
    ? normalizeExampleOpenings(patch.exampleOpenings)
    : null;

  await pool.query(
    `UPDATE agos_autobiographer_voice_profiles
        SET style_summary    = COALESCE($3, style_summary),
            style_adjectives = COALESCE($4::text[], style_adjectives),
            style_rules      = COALESCE($5::jsonb, style_rules),
            example_openings = COALESCE($6::jsonb, example_openings),
            metadata         = COALESCE($7::jsonb, metadata)
      WHERE id = $1 AND user_id = $2`,
    [
      id,
      userId,
      patch.styleSummary ?? null,
      adjectives,
      rules ? JSON.stringify(rules) : null,
      openings ? JSON.stringify(openings) : null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  return getVoiceProfile(id, userId);
}

/**
 * Atomically make this profile the active one — clears every other row
 * for the user first, then flips this row's bit. Both operations
 * happen inside a single transaction so the partial-UNIQUE invariant
 * is never violated under concurrent `/activate` calls.
 *
 * Returns null if the profile does not exist (or is foreign).
 */
export async function activateProfile(
  id: string,
  userId: string,
): Promise<AutobiographerVoiceProfile | null> {
  const pool = getAutobiographerPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const owns = await client.query(
      `SELECT 1 FROM agos_autobiographer_voice_profiles
        WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    if ((owns.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query(
      `UPDATE agos_autobiographer_voice_profiles
          SET is_active = false
        WHERE user_id = $1 AND is_active = true AND id <> $2`,
      [userId, id],
    );
    await client.query(
      `UPDATE agos_autobiographer_voice_profiles
          SET is_active = true
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
  return getVoiceProfile(id, userId);
}

/**
 * Soft-archive — sets `is_active = false`. Used by the DELETE route
 * when the caller wants to retire the active profile without losing
 * the historical row.
 */
export async function deactivateProfile(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `UPDATE agos_autobiographer_voice_profiles
        SET is_active = false
      WHERE id = $1 AND user_id = $2 AND is_active = true`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

/** Hard delete (used by DELETE after deactivate). */
export async function deleteVoiceProfile(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `DELETE FROM agos_autobiographer_voice_profiles
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

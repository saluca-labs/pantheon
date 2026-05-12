/**
 * Autobiographer OS — Memory-themes join-table repo.
 *
 * CRUD against `agos_autobiographer_memory_themes` from migration
 * `0046_autobiographer_phase5`. Cross-ownership safety: every write
 * validates that both endpoints (memory + theme) belong to the caller
 * before touching the join row. A typed `not_found` error fires if
 * either endpoint is missing or foreign so the route layer maps to 404
 * without enumerating which side failed.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import 'server-only';
import { getAutobiographerPool } from './session';
import type { AutobiographerTheme } from './themes-repo';

export interface MemoryThemeLink {
  memoryId: string;
  themeId: string;
  createdAt: string;
}

const LINK_COLUMNS = `memory_id, theme_id, created_at`;

function rowToLink(row: any): MemoryThemeLink {
  return {
    memoryId: row.memory_id,
    themeId: row.theme_id,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

async function memoryBelongsToUser(
  memoryId: string,
  userId: string,
): Promise<boolean> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_autobiographer_memories
      WHERE id = $1 AND user_id = $2`,
    [memoryId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

async function themeBelongsToUser(
  themeId: string,
  userId: string,
): Promise<boolean> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_autobiographer_themes
      WHERE id = $1 AND user_id = $2`,
    [themeId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

/** Joined list of themes attached to `memoryId`, scoped to caller. */
export async function listThemesForMemory(
  memoryId: string,
  userId: string,
): Promise<AutobiographerTheme[]> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT t.id, t.user_id, t.name, t.slug, t.description, t.color,
            t.metadata, t.created_at, t.updated_at
       FROM agos_autobiographer_memory_themes mt
       JOIN agos_autobiographer_themes    t ON t.id = mt.theme_id
       JOIN agos_autobiographer_memories  m ON m.id = mt.memory_id
      WHERE mt.memory_id = $1
        AND t.user_id    = $2
        AND m.user_id    = $2
      ORDER BY lower(t.name) ASC`,
    [memoryId, userId],
  );
  return r.rows.map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    color: row.color ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  }));
}

/** Joined list of memories that carry `themeId`, scoped to caller. */
export interface ThemeMemoryAppearance {
  memoryId: string;
  bookId: string | null;
  title: string;
  whenInLife: string | null;
  eraDateEstimate: string | null;
  updatedAt: string;
}

export async function listMemoriesForTheme(
  themeId: string,
  userId: string,
): Promise<ThemeMemoryAppearance[]> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT m.id AS memory_id, m.book_id, m.title, m.when_in_life,
            m.era_date_estimate, m.updated_at
       FROM agos_autobiographer_memory_themes mt
       JOIN agos_autobiographer_memories m ON m.id = mt.memory_id
       JOIN agos_autobiographer_themes   t ON t.id = mt.theme_id
      WHERE mt.theme_id = $1
        AND m.user_id   = $2
        AND t.user_id   = $2
      ORDER BY m.era_date_estimate ASC NULLS LAST, m.updated_at DESC`,
    [themeId, userId],
  );
  return r.rows.map((row: any) => ({
    memoryId: row.memory_id,
    bookId: row.book_id ?? null,
    title: row.title,
    whenInLife: row.when_in_life ?? null,
    eraDateEstimate: row.era_date_estimate
      ? new Date(row.era_date_estimate).toISOString().slice(0, 10)
      : null,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  }));
}

/**
 * Insert a memory↔theme link. Validates both endpoints belong to the
 * caller before INSERT. Throws `not_found` if either is missing/foreign;
 * throws `duplicate` if the link already exists.
 */
export async function linkThemeToMemory(
  memoryId: string,
  themeId: string,
  userId: string,
): Promise<MemoryThemeLink> {
  const [memOk, themeOk] = await Promise.all([
    memoryBelongsToUser(memoryId, userId),
    themeBelongsToUser(themeId, userId),
  ]);
  if (!memOk || !themeOk) {
    const err = new Error('not_found');
    (err as any).code = 'not_found';
    throw err;
  }
  const pool = getAutobiographerPool();
  try {
    await pool.query(
      `INSERT INTO agos_autobiographer_memory_themes
         (memory_id, theme_id)
       VALUES ($1, $2)`,
      [memoryId, themeId],
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
    `SELECT ${LINK_COLUMNS}
       FROM agos_autobiographer_memory_themes
      WHERE memory_id = $1 AND theme_id = $2`,
    [memoryId, themeId],
  );
  if ((r.rowCount ?? 0) === 0) throw new Error('Failed to create link');
  return rowToLink(r.rows[0]);
}

export async function unlinkThemeFromMemory(
  memoryId: string,
  themeId: string,
  userId: string,
): Promise<boolean> {
  const [memOk, themeOk] = await Promise.all([
    memoryBelongsToUser(memoryId, userId),
    themeBelongsToUser(themeId, userId),
  ]);
  if (!memOk || !themeOk) {
    const err = new Error('not_found');
    (err as any).code = 'not_found';
    throw err;
  }
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `DELETE FROM agos_autobiographer_memory_themes
      WHERE memory_id = $1 AND theme_id = $2`,
    [memoryId, themeId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Bulk theme lookup keyed by memory id — returns a Map of memoryId →
 * theme rows. Used by the timeline composite to attach themes per
 * memory in a single round trip.
 */
export async function listThemesForMemoryIds(
  memoryIds: readonly string[],
  userId: string,
): Promise<Map<string, AutobiographerTheme[]>> {
  const map = new Map<string, AutobiographerTheme[]>();
  if (memoryIds.length === 0) return map;
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT mt.memory_id, t.id, t.user_id, t.name, t.slug, t.description,
            t.color, t.metadata, t.created_at, t.updated_at
       FROM agos_autobiographer_memory_themes mt
       JOIN agos_autobiographer_themes   t ON t.id = mt.theme_id
       JOIN agos_autobiographer_memories m ON m.id = mt.memory_id
      WHERE mt.memory_id = ANY($1::uuid[])
        AND t.user_id    = $2
        AND m.user_id    = $2
      ORDER BY lower(t.name) ASC`,
    [Array.from(new Set(memoryIds)), userId],
  );
  for (const row of r.rows) {
    const memId = String(row.memory_id);
    if (!map.has(memId)) map.set(memId, []);
    map.get(memId)!.push({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      slug: row.slug,
      description: row.description ?? null,
      color: row.color ?? null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : String(row.updated_at),
    });
  }
  return map;
}

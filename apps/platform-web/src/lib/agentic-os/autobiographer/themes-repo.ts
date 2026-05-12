/**
 * Autobiographer OS — Themes repo.
 *
 * CRUD against `agos_autobiographer_themes` from migration
 * `0046_autobiographer_phase5`. Themes are workshop-global; reads filter
 * by `user_id` and duplicate slug / name (case-insensitive) raise the
 * Postgres unique violation code `23505` so the route layer can map to
 * 409 Conflict.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAutobiographerPool } from './session';
import {
  THEME_COLOR_MAX,
  THEME_DESCRIPTION_MAX,
  THEME_NAME_MAX,
  THEME_SLUG_MAX,
  themeSlug,
} from './themes';

export interface AutobiographerTheme {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateThemeInput {
  name: string;
  slug?: string | null;
  description?: string | null;
  color?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateThemeInput {
  name?: string;
  slug?: string;
  description?: string | null;
  color?: string | null;
  metadata?: Record<string, unknown>;
}

const THEME_COLUMNS = `id, user_id, name, slug, description, color,
                       metadata, created_at, updated_at`;

function rowToTheme(row: any): AutobiographerTheme {
  return {
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
  };
}

export interface ListThemesArgs {
  userId: string;
  /** Case-insensitive name/slug substring filter. */
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listThemes(
  args: ListThemesArgs,
): Promise<AutobiographerTheme[]> {
  const pool = getAutobiographerPool();
  const params: any[] = [args.userId];
  let where = `user_id = $1`;
  if (args.search && args.search.trim().length > 0) {
    params.push(`%${args.search.trim().toLowerCase()}%`);
    where += ` AND (lower(name) LIKE $${params.length} OR slug LIKE $${params.length})`;
  }
  const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
  const offset = Math.max(0, args.offset ?? 0);
  params.push(limit);
  params.push(offset);
  const r = await pool.query(
    `SELECT ${THEME_COLUMNS}
       FROM agos_autobiographer_themes
      WHERE ${where}
      ORDER BY lower(name) ASC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToTheme);
}

export async function getTheme(
  id: string,
  userId: string,
): Promise<AutobiographerTheme | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${THEME_COLUMNS}
       FROM agos_autobiographer_themes
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToTheme(r.rows[0]);
}

export async function createTheme(
  userId: string,
  data: CreateThemeInput,
): Promise<AutobiographerTheme> {
  const pool = getAutobiographerPool();
  if (!data.name || data.name.trim().length === 0) {
    throw new Error('Theme name is required');
  }
  if (data.name.length > THEME_NAME_MAX) {
    throw new Error(`Theme name exceeds ${THEME_NAME_MAX} characters`);
  }
  const id = randomUUID();
  const slug = (data.slug && data.slug.trim().length > 0
    ? data.slug.trim()
    : themeSlug(data.name)
  ).slice(0, THEME_SLUG_MAX);
  if (!slug) {
    throw new Error('Theme slug could not be derived');
  }
  if (data.description && data.description.length > THEME_DESCRIPTION_MAX) {
    throw new Error(`Description exceeds ${THEME_DESCRIPTION_MAX} characters`);
  }
  if (data.color && data.color.length > THEME_COLOR_MAX) {
    throw new Error(`Color exceeds ${THEME_COLOR_MAX} characters`);
  }

  try {
    await pool.query(
      `INSERT INTO agos_autobiographer_themes
         (id, user_id, name, slug, description, color, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        id,
        userId,
        data.name.trim(),
        slug,
        data.description ?? null,
        data.color ?? null,
        JSON.stringify(data.metadata ?? {}),
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
  const theme = await getTheme(id, userId);
  if (!theme) throw new Error('Failed to create theme');
  return theme;
}

export async function updateTheme(
  id: string,
  userId: string,
  patch: UpdateThemeInput,
): Promise<AutobiographerTheme | null> {
  const pool = getAutobiographerPool();
  if (patch.name !== undefined && patch.name.length > THEME_NAME_MAX) {
    throw new Error(`Theme name exceeds ${THEME_NAME_MAX} characters`);
  }
  if (patch.slug !== undefined && patch.slug.length > THEME_SLUG_MAX) {
    throw new Error(`Slug exceeds ${THEME_SLUG_MAX} characters`);
  }
  if (
    patch.description &&
    patch.description.length > THEME_DESCRIPTION_MAX
  ) {
    throw new Error(`Description exceeds ${THEME_DESCRIPTION_MAX} characters`);
  }
  if (patch.color && patch.color.length > THEME_COLOR_MAX) {
    throw new Error(`Color exceeds ${THEME_COLOR_MAX} characters`);
  }
  try {
    await pool.query(
      `UPDATE agos_autobiographer_themes
          SET name        = COALESCE($3,        name),
              slug        = COALESCE($4,        slug),
              description = CASE WHEN $5::boolean THEN $6 ELSE description END,
              color       = CASE WHEN $7::boolean THEN $8 ELSE color       END,
              metadata    = COALESCE($9::jsonb, metadata),
              updated_at  = now()
        WHERE id = $1 AND user_id = $2`,
      [
        id,
        userId,
        patch.name ?? null,
        patch.slug ?? null,
        Object.prototype.hasOwnProperty.call(patch, 'description'),
        patch.description ?? null,
        Object.prototype.hasOwnProperty.call(patch, 'color'),
        patch.color ?? null,
        patch.metadata ? JSON.stringify(patch.metadata) : null,
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
  return getTheme(id, userId);
}

export async function deleteTheme(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `DELETE FROM agos_autobiographer_themes
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

/** Bulk lookup by id, filtered by user. */
export async function getThemesByIds(
  ids: readonly string[],
  userId: string,
): Promise<AutobiographerTheme[]> {
  if (ids.length === 0) return [];
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${THEME_COLUMNS}
       FROM agos_autobiographer_themes
      WHERE id = ANY($1::uuid[]) AND user_id = $2`,
    [Array.from(new Set(ids)), userId],
  );
  return r.rows.map(rowToTheme);
}

/**
 * Autobiographer OS — Chapter-themes join-table repo.
 *
 * CRUD against `agos_autobiographer_chapter_themes` from migration
 * `0046_autobiographer_phase5`. Symmetrical to `memory-themes-repo.ts`:
 * both endpoints must belong to the caller before a write is admitted.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import 'server-only';
import { getAutobiographerPool } from './session';
import type { AutobiographerTheme } from './themes-repo';

export interface ChapterThemeLink {
  chapterId: string;
  themeId: string;
  createdAt: string;
}

const LINK_COLUMNS = `chapter_id, theme_id, created_at`;

function rowToLink(row: any): ChapterThemeLink {
  return {
    chapterId: row.chapter_id,
    themeId: row.theme_id,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

async function chapterBelongsToUser(
  chapterId: string,
  userId: string,
): Promise<boolean> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_autobiographer_chapters
      WHERE id = $1 AND user_id = $2`,
    [chapterId, userId],
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

export async function listThemesForChapter(
  chapterId: string,
  userId: string,
): Promise<AutobiographerTheme[]> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT t.id, t.user_id, t.name, t.slug, t.description, t.color,
            t.metadata, t.created_at, t.updated_at
       FROM agos_autobiographer_chapter_themes ct
       JOIN agos_autobiographer_themes   t ON t.id = ct.theme_id
       JOIN agos_autobiographer_chapters c ON c.id = ct.chapter_id
      WHERE ct.chapter_id = $1
        AND t.user_id     = $2
        AND c.user_id     = $2
      ORDER BY lower(t.name) ASC`,
    [chapterId, userId],
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

export interface ThemeChapterAppearance {
  chapterId: string;
  bookId: string;
  title: string | null;
  slug: string | null;
  position: number;
  updatedAt: string;
}

export async function listChaptersForTheme(
  themeId: string,
  userId: string,
): Promise<ThemeChapterAppearance[]> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT c.id AS chapter_id, c.book_id, c.title, c.slug, c.position,
            c.updated_at
       FROM agos_autobiographer_chapter_themes ct
       JOIN agos_autobiographer_chapters c ON c.id = ct.chapter_id
       JOIN agos_autobiographer_themes   t ON t.id = ct.theme_id
      WHERE ct.theme_id = $1
        AND c.user_id   = $2
        AND t.user_id   = $2
      ORDER BY c.book_id ASC, c.position ASC`,
    [themeId, userId],
  );
  return r.rows.map((row: any) => ({
    chapterId: row.chapter_id,
    bookId: row.book_id,
    title: row.title ?? null,
    slug: row.slug ?? null,
    position: Number(row.position ?? 0),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  }));
}

export async function linkThemeToChapter(
  chapterId: string,
  themeId: string,
  userId: string,
): Promise<ChapterThemeLink> {
  const [chOk, themeOk] = await Promise.all([
    chapterBelongsToUser(chapterId, userId),
    themeBelongsToUser(themeId, userId),
  ]);
  if (!chOk || !themeOk) {
    const err = new Error('not_found');
    (err as any).code = 'not_found';
    throw err;
  }
  const pool = getAutobiographerPool();
  try {
    await pool.query(
      `INSERT INTO agos_autobiographer_chapter_themes
         (chapter_id, theme_id)
       VALUES ($1, $2)`,
      [chapterId, themeId],
    );
  } catch (err: unknown) {
    if (!(err instanceof Error)) throw err;
    const errErr = err as Error & { code?: string; constraint?: string };
    if (errErr?.code === '23505') {
      const dup = new Error('duplicate');
      (dup as any).code = 'duplicate';
      throw dup;
    }
    throw err;
  }
  const r = await pool.query(
    `SELECT ${LINK_COLUMNS}
       FROM agos_autobiographer_chapter_themes
      WHERE chapter_id = $1 AND theme_id = $2`,
    [chapterId, themeId],
  );
  if ((r.rowCount ?? 0) === 0) throw new Error('Failed to create link');
  return rowToLink(r.rows[0]);
}

export async function unlinkThemeFromChapter(
  chapterId: string,
  themeId: string,
  userId: string,
): Promise<boolean> {
  const [chOk, themeOk] = await Promise.all([
    chapterBelongsToUser(chapterId, userId),
    themeBelongsToUser(themeId, userId),
  ]);
  if (!chOk || !themeOk) {
    const err = new Error('not_found');
    (err as any).code = 'not_found';
    throw err;
  }
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `DELETE FROM agos_autobiographer_chapter_themes
      WHERE chapter_id = $1 AND theme_id = $2`,
    [chapterId, themeId],
  );
  return (r.rowCount ?? 0) > 0;
}

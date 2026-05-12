/**
 * Autobiographer OS — Timeline composite query.
 *
 * The timeline view is a memory-centric vertical scroll, ordered by life
 * year (NULLS LAST) then created_at ASC. Each entry carries the parent
 * book reference, its themes, and the arc memberships derived from
 * chapters that cite the memory via `chapter_sources`.
 *
 * Composition strategy
 * --------------------
 * 1. Pull memories (filtered by book / theme / kind / decade / person)
 *    in one SELECT.
 * 2. For each memory id, attach themes via a single batch SELECT against
 *    `memory_themes` (in `memory-themes-repo`).
 * 3. For each memory id, attach arc memberships via a single batch
 *    SELECT joining `chapter_sources -> chapters -> arc_chapters -> arcs`.
 *    Each entry returns `{arcId, arcTitle, position}`.
 *
 * Three queries total — no per-memory N+1.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import 'server-only';
import { getAutobiographerPool } from './session';
import type { AutobiographerTheme } from './themes-repo';
import { listThemesForMemoryIds } from './memory-themes-repo';

export interface TimelineMemory {
  id: string;
  bookId: string | null;
  bookTitle: string | null;
  title: string;
  bodyMarkdown: string;
  whenInLife: string | null;
  eraDateEstimate: string | null;
  location: string | null;
  emotionTags: string[];
  contentTags: string[];
  isSensitive: boolean;
  createdAt: string;
  updatedAt: string;
  themes: AutobiographerTheme[];
  arcs: TimelineArcMembership[];
}

export interface TimelineArcMembership {
  arcId: string;
  arcTitle: string;
  bookId: string;
  position: number;
  chapterId: string;
}

export interface ListTimelineArgs {
  userId: string;
  /**
   * Scope. `'book'` requires `bookId`; `'workshop'` returns every memory
   * the caller owns. Defaults to `'workshop'` when `bookId` is omitted,
   * `'book'` when `bookId` is set.
   */
  scope?: 'workshop' | 'book';
  bookId?: string | null;
  /** Optional theme id filter (memory must have ALL of these themes). */
  themeIds?: string[];
  /** Optional content-tag filter (single tag). */
  contentTag?: string;
  /** Optional emotion-tag filter. */
  emotionTag?: string;
  /** Optional decade filter — e.g. `1990` matches `1990-01-01..1999-12-31`. */
  decade?: number;
  /** Optional person id filter (memory must mention the person). */
  personId?: string;
  /** Optional sensitivity filter. */
  isSensitive?: boolean;
  limit?: number;
  offset?: number;
}

const MEM_COLUMNS = `m.id, m.book_id, m.title, m.body_markdown,
                     m.when_in_life, m.era_date_estimate, m.location,
                     m.emotion_tags, m.content_tags, m.is_sensitive,
                     m.created_at, m.updated_at,
                     b.title AS book_title`;

function rowToBase(row: any): Omit<TimelineMemory, 'themes' | 'arcs'> {
  return {
    id: row.id,
    bookId: row.book_id ?? null,
    bookTitle: row.book_title ?? null,
    title: row.title,
    bodyMarkdown: row.body_markdown ?? '',
    whenInLife: row.when_in_life ?? null,
    eraDateEstimate: row.era_date_estimate
      ? new Date(row.era_date_estimate).toISOString().slice(0, 10)
      : null,
    location: row.location ?? null,
    emotionTags: Array.isArray(row.emotion_tags) ? row.emotion_tags : [],
    contentTags: Array.isArray(row.content_tags) ? row.content_tags : [],
    isSensitive: Boolean(row.is_sensitive),
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
 * Run the timeline composite query and return ordered memories with
 * attached themes and arc memberships.
 *
 * The ordering rule is `when_in_life_year ASC NULLS LAST, created_at
 * ASC`. `when_in_life_year` is derived from `era_date_estimate` when
 * present; the column itself is free-form text so we cast the leading
 * YYYY of `era_date_estimate` for an integer sort.
 */
export async function listTimeline(
  args: ListTimelineArgs,
): Promise<TimelineMemory[]> {
  const pool = getAutobiographerPool();
  const params: any[] = [args.userId];
  const where: string[] = ['m.user_id = $1'];

  const scope = args.scope ?? (args.bookId ? 'book' : 'workshop');
  if (scope === 'book') {
    if (!args.bookId) {
      throw new Error('Timeline scope=book requires bookId');
    }
    params.push(args.bookId);
    where.push(`m.book_id = $${params.length}`);
  }

  if (args.contentTag && args.contentTag.trim()) {
    params.push(args.contentTag.trim());
    where.push(`$${params.length} = ANY(m.content_tags)`);
  }
  if (args.emotionTag && args.emotionTag.trim()) {
    params.push(args.emotionTag.trim());
    where.push(`$${params.length} = ANY(m.emotion_tags)`);
  }
  if (args.isSensitive !== undefined) {
    params.push(args.isSensitive);
    where.push(`m.is_sensitive = $${params.length}`);
  }
  if (args.decade !== undefined && Number.isInteger(args.decade)) {
    const decadeStart = args.decade;
    const decadeEnd = args.decade + 9;
    params.push(`${decadeStart}-01-01`);
    where.push(`m.era_date_estimate >= $${params.length}::date`);
    params.push(`${decadeEnd}-12-31`);
    where.push(`m.era_date_estimate <= $${params.length}::date`);
  }
  if (args.themeIds && args.themeIds.length > 0) {
    params.push(args.themeIds);
    where.push(
      `m.id IN (
         SELECT mt.memory_id
           FROM agos_autobiographer_memory_themes mt
          WHERE mt.theme_id = ANY($${params.length}::uuid[])
          GROUP BY mt.memory_id
         HAVING COUNT(DISTINCT mt.theme_id) = ${args.themeIds.length}
       )`,
    );
  }
  if (args.personId) {
    params.push(args.personId);
    where.push(
      `m.id IN (
         SELECT mp.memory_id
           FROM agos_autobiographer_memory_people mp
          WHERE mp.person_id = $${params.length}
       )`,
    );
  }

  const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
  const offset = Math.max(0, args.offset ?? 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${MEM_COLUMNS}
       FROM agos_autobiographer_memories m
       LEFT JOIN agos_autobiographer_books b ON b.id = m.book_id AND b.user_id = m.user_id
      WHERE ${where.join(' AND ')}
      ORDER BY
        CASE
          WHEN m.era_date_estimate IS NOT NULL THEN EXTRACT(YEAR FROM m.era_date_estimate)
          ELSE NULL
        END NULLS LAST,
        m.created_at ASC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  const base = r.rows.map(rowToBase);
  if (base.length === 0) return [];

  const memoryIds = base.map((m) => m.id);
  const themesMap = await listThemesForMemoryIds(memoryIds, args.userId);
  const arcsMap = await listArcMembershipsForMemoryIds(memoryIds, args.userId);

  return base.map((m) => ({
    ...m,
    themes: themesMap.get(m.id) ?? [],
    arcs: arcsMap.get(m.id) ?? [],
  }));
}

/**
 * Resolve every arc membership reachable from each memory id, via:
 *
 *   memory --(chapter_sources)--> chapter --(arc_chapters)--> arc
 *
 * Each row in the result represents one (memory, arc) edge. A memory
 * can carry multiple arc memberships (the memory powers several
 * chapters, each in different arcs). The returned map is keyed by
 * `memoryId` so the timeline composer can attach them per-row.
 */
export async function listArcMembershipsForMemoryIds(
  memoryIds: readonly string[],
  userId: string,
): Promise<Map<string, TimelineArcMembership[]>> {
  const map = new Map<string, TimelineArcMembership[]>();
  if (memoryIds.length === 0) return map;
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT s.memory_id, ac.arc_id, ac.chapter_id, ac.position,
            a.title AS arc_title, a.book_id AS arc_book_id
       FROM agos_autobiographer_chapter_sources s
       JOIN agos_autobiographer_chapters    c ON c.id = s.chapter_id
       JOIN agos_autobiographer_arc_chapters ac ON ac.chapter_id = c.id
       JOIN agos_autobiographer_arcs        a ON a.id = ac.arc_id
       JOIN agos_autobiographer_memories    m ON m.id = s.memory_id
      WHERE s.memory_id = ANY($1::uuid[])
        AND c.user_id   = $2
        AND a.user_id   = $2
        AND m.user_id   = $2
      ORDER BY a.title ASC, ac.position ASC`,
    [Array.from(new Set(memoryIds)), userId],
  );
  for (const row of r.rows) {
    const memId = String(row.memory_id);
    if (!map.has(memId)) map.set(memId, []);
    map.get(memId)!.push({
      arcId: row.arc_id,
      arcTitle: row.arc_title ?? 'Untitled arc',
      bookId: row.arc_book_id,
      position: Number(row.position ?? 0),
      chapterId: row.chapter_id,
    });
  }
  return map;
}

/**
 * Available decades present in the user's memories. Used by the
 * timeline filter UI to populate the decade dropdown without scanning
 * the full memory table client-side.
 */
export async function listAvailableDecades(
  userId: string,
): Promise<number[]> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT DISTINCT
       FLOOR(EXTRACT(YEAR FROM era_date_estimate) / 10)::int * 10 AS decade
       FROM agos_autobiographer_memories
      WHERE user_id = $1 AND era_date_estimate IS NOT NULL
      ORDER BY decade ASC`,
    [userId],
  );
  return r.rows.map((row: any) => Number(row.decade));
}

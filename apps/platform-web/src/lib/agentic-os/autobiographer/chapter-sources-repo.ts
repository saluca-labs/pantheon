/**
 * Autobiographer OS — Chapter sources (provenance) repo.
 *
 * CRUD against `agos_autobiographer_chapter_sources` from migration
 * `0045_autobiographer_phase4`. The route layer validates both the
 * chapter and the memory belong to the caller before linking — the
 * repo does the actual writes after that probe.
 *
 * Duplicate links surface as `unique_violation` (Postgres 23505); the
 * route turns that into a 409 Conflict.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAutobiographerPool } from './session';
import {
  SOURCE_NOTES_MAX,
  coerceSourceWeight,
} from './chapter-sources';

export interface AutobiographerChapterSource {
  id: string;
  chapterId: string;
  memoryId: string;
  weight: number;
  notes: string | null;
}

export interface ChapterSourceWithMemory extends AutobiographerChapterSource {
  memoryTitle: string;
  memoryWhenInLife: string | null;
  memoryEraDate: string | null;
  /** Phase 4 paragraph-citation count derived from the latest revision. */
  paragraphCitationCount: number;
}

export interface LinkChapterSourceInput {
  chapterId: string;
  memoryId: string;
  weight?: number;
  notes?: string | null;
}

export interface UpdateChapterSourceInput {
  weight?: number;
  notes?: string | null;
}

interface RawChapterSourceRow {
  id: string;
  chapter_id: string;
  memory_id: string;
  weight: number | string | null;
  notes: string | null;
}

interface RawChapterSourceJoinedRow extends RawChapterSourceRow {
  memory_title: string | null;
  memory_when_in_life: string | null;
  memory_era_date_estimate: Date | string | null;
  paragraph_citation_count: number | string | null;
}

function rowToSource(row: RawChapterSourceRow): AutobiographerChapterSource {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    memoryId: row.memory_id,
    weight: Number(row.weight ?? 1.0),
    notes: row.notes ?? null,
  };
}

function rowToSourceJoined(row: RawChapterSourceJoinedRow): ChapterSourceWithMemory {
  return {
    ...rowToSource(row),
    memoryTitle: row.memory_title ?? 'Untitled memory',
    memoryWhenInLife: row.memory_when_in_life ?? null,
    memoryEraDate:
      row.memory_era_date_estimate instanceof Date
        ? row.memory_era_date_estimate.toISOString().slice(0, 10)
        : row.memory_era_date_estimate ?? null,
    paragraphCitationCount: Number(row.paragraph_citation_count ?? 0),
  };
}

/**
 * List sources joined with the source memory's display fields. The
 * route's GET returns this shape so the right-rail panel can render
 * "M-2024-08-13 'first move to Albuquerque'" without a second round
 * trip. `paragraph_citation_count` is computed against the latest
 * revision's citations payload, so the right rail can show
 * "3 paragraphs cite this".
 */
export async function listSourcesForChapter(
  chapterId: string,
  userId: string,
): Promise<ChapterSourceWithMemory[]> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `WITH latest_rev AS (
       SELECT citations
         FROM agos_autobiographer_chapter_revisions
        WHERE chapter_id = $1 AND user_id = $2
        ORDER BY version DESC
        LIMIT 1
     ),
     cite_counts AS (
       SELECT memory_id, COUNT(*)::int AS n
         FROM latest_rev,
              jsonb_array_elements(citations) AS c,
              jsonb_array_elements_text(c -> 'memory_ids') AS memory_id_text,
              LATERAL (SELECT memory_id_text::uuid AS memory_id) AS mid
        GROUP BY memory_id
     )
     SELECT s.id, s.chapter_id, s.memory_id, s.weight, s.notes,
            m.title             AS memory_title,
            m.when_in_life      AS memory_when_in_life,
            m.era_date_estimate AS memory_era_date_estimate,
            COALESCE(cc.n, 0)   AS paragraph_citation_count
       FROM agos_autobiographer_chapter_sources s
       JOIN agos_autobiographer_memories m ON m.id = s.memory_id
       LEFT JOIN cite_counts cc ON cc.memory_id = s.memory_id
      WHERE s.chapter_id = $1
        AND m.user_id    = $2
      ORDER BY s.weight DESC, m.title ASC`,
    [chapterId, userId],
  );
  return r.rows.map(rowToSourceJoined);
}

/**
 * Plain row fetch (no join) used by tests and the route's DELETE.
 */
export async function getChapterSource(
  chapterId: string,
  memoryId: string,
  userId: string,
): Promise<AutobiographerChapterSource | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT s.id, s.chapter_id, s.memory_id, s.weight, s.notes
       FROM agos_autobiographer_chapter_sources s
       JOIN agos_autobiographer_chapters c  ON c.id = s.chapter_id
       JOIN agos_autobiographer_memories  m ON m.id = s.memory_id
      WHERE s.chapter_id = $1
        AND s.memory_id  = $2
        AND c.user_id    = $3
        AND m.user_id    = $3
      LIMIT 1`,
    [chapterId, memoryId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToSource(r.rows[0]);
}

/**
 * Link a memory to a chapter as a provenance source. The caller must
 * have verified both the chapter and the memory belong to the user
 * (the route does this). Duplicate links raise the Postgres unique
 * violation; the route maps that to 409.
 */
export async function linkChapterSource(
  data: LinkChapterSourceInput,
): Promise<AutobiographerChapterSource> {
  const pool = getAutobiographerPool();
  const id = randomUUID();
  const weight = coerceSourceWeight(data.weight, 1.0);
  const notes =
    data.notes === undefined || data.notes === null
      ? null
      : data.notes.slice(0, SOURCE_NOTES_MAX);

  await pool.query(
    `INSERT INTO agos_autobiographer_chapter_sources
       (id, chapter_id, memory_id, weight, notes)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, data.chapterId, data.memoryId, weight, notes],
  );

  const row = await pool.query(
    `SELECT id, chapter_id, memory_id, weight, notes
       FROM agos_autobiographer_chapter_sources
      WHERE id = $1`,
    [id],
  );
  return rowToSource(row.rows[0]);
}

/**
 * Patch the weight / notes on an existing link. Returns null when the
 * caller does not own the chapter or memory.
 */
export async function updateChapterSource(
  chapterId: string,
  memoryId: string,
  userId: string,
  patch: UpdateChapterSourceInput,
): Promise<AutobiographerChapterSource | null> {
  // Ownership probe (chapter + memory) before write.
  const existing = await getChapterSource(chapterId, memoryId, userId);
  if (!existing) return null;
  const pool = getAutobiographerPool();
  const weight =
    patch.weight === undefined ? null : coerceSourceWeight(patch.weight, 1.0);
  const notes =
    patch.notes === undefined
      ? null
      : patch.notes === null
        ? null
        : patch.notes.slice(0, SOURCE_NOTES_MAX);
  await pool.query(
    `UPDATE agos_autobiographer_chapter_sources
        SET weight = COALESCE($3, weight),
            notes  = CASE WHEN $4::boolean THEN $5 ELSE notes END
      WHERE chapter_id = $1 AND memory_id = $2`,
    [chapterId, memoryId, weight, patch.notes !== undefined, notes],
  );
  return getChapterSource(chapterId, memoryId, userId);
}

/**
 * Remove a single chapter→memory link. Returns true when a row was
 * removed.
 */
export async function unlinkChapterSource(
  chapterId: string,
  memoryId: string,
  userId: string,
): Promise<boolean> {
  // Ownership probe first so cross-tenant returns false (not 0 rows
  // because the chapter is gone).
  const existing = await getChapterSource(chapterId, memoryId, userId);
  if (!existing) return false;
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `DELETE FROM agos_autobiographer_chapter_sources
      WHERE chapter_id = $1 AND memory_id = $2`,
    [chapterId, memoryId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Across-book aggregate: for every memory id referenced anywhere in a
 * book's chapters or revisions, return the canonical row data needed
 * for the book-export provenance appendix.
 */
export interface ProvenanceAppendixRow {
  memoryId: string;
  memoryTitle: string;
  memoryWhenInLife: string | null;
  chapterReferences: Array<{
    chapterId: string;
    chapterTitle: string | null;
    chapterSlug: string | null;
    position: number;
  }>;
}

export async function listProvenanceForBook(
  bookId: string,
  userId: string,
): Promise<ProvenanceAppendixRow[]> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT m.id   AS memory_id,
            m.title AS memory_title,
            m.when_in_life AS memory_when_in_life,
            c.id    AS chapter_id,
            c.title AS chapter_title,
            c.slug  AS chapter_slug,
            c.position AS chapter_position
       FROM agos_autobiographer_chapter_sources s
       JOIN agos_autobiographer_chapters  c ON c.id = s.chapter_id
       JOIN agos_autobiographer_memories  m ON m.id = s.memory_id
      WHERE c.book_id = $1 AND c.user_id = $2 AND m.user_id = $2
      ORDER BY m.title ASC, c.position ASC`,
    [bookId, userId],
  );
  const map = new Map<string, ProvenanceAppendixRow>();
  for (const row of r.rows) {
    const id = String(row.memory_id);
    if (!map.has(id)) {
      map.set(id, {
        memoryId: id,
        memoryTitle: row.memory_title ?? 'Untitled memory',
        memoryWhenInLife: row.memory_when_in_life ?? null,
        chapterReferences: [],
      });
    }
    map.get(id)!.chapterReferences.push({
      chapterId: row.chapter_id,
      chapterTitle: row.chapter_title ?? null,
      chapterSlug: row.chapter_slug ?? null,
      position: Number(row.chapter_position ?? 0),
    });
  }
  return Array.from(map.values());
}

/**
 * Autobiographer OS — Chapter revisions repo.
 *
 * CRUD against `agos_autobiographer_chapter_revisions` from migration
 * `0045_autobiographer_phase4`. Every read filters by `user_id` so a
 * revision is only ever visible to its owner. `insertRevision` derives
 * the next `version` atomically inside the same INSERT (subselect on
 * `MAX(version)`) so concurrent revision writes do not collide.
 *
 * `word_count` is computed server-side on every body write. `citations`
 * is normalized through `chapter-revisions.normalizeCitations` so
 * malformed shapes from the wire never reach the database.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAutobiographerPool } from './session';
import {
  REVISION_AUTHORS,
  countRevisionWords,
  normalizeCitations,
  type RevisionAuthor,
  type RevisionCitation,
} from './chapter-revisions';
import {
  validateSensitiveKindsStrict,
  type SensitiveKind,
} from './sensitive-kinds';

export interface AutobiographerChapterRevision {
  id: string;
  chapterId: string;
  userId: string;
  version: number;
  author: RevisionAuthor;
  bodyText: string;
  wordCount: number;
  summary: string | null;
  citations: RevisionCitation[];
  coachSessionId: string | null;
  /** Phase 6 — sensitive-kind tags on derived prose. */
  sensitiveKinds: SensitiveKind[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface InsertRevisionInput {
  chapterId: string;
  author: RevisionAuthor;
  bodyText: string;
  summary?: string | null;
  citations?: readonly unknown[];
  coachSessionId?: string | null;
  /** Phase 6 — initial sensitive-kind tags for this revision. */
  sensitiveKinds?: readonly string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateRevisionInput {
  bodyText?: string;
  summary?: string | null;
  citations?: readonly unknown[];
  /** Phase 6 — replace the revision's sensitive-kind tags. */
  sensitiveKinds?: readonly string[];
  metadata?: Record<string, unknown>;
}

const REVISION_COLUMNS = `id, chapter_id, user_id, version, author, body_text,
                          word_count, summary, citations, coach_session_id,
                          sensitive_kinds, metadata, created_at`;

function rowToRevision(row: any): AutobiographerChapterRevision {
  let citations: RevisionCitation[] = [];
  if (Array.isArray(row.citations)) {
    citations = normalizeCitations(row.citations);
  } else if (typeof row.citations === 'string') {
    try {
      citations = normalizeCitations(JSON.parse(row.citations));
    } catch {
      citations = [];
    }
  }
  return {
    id: row.id,
    chapterId: row.chapter_id,
    userId: row.user_id,
    version: Number(row.version),
    author: row.author as RevisionAuthor,
    bodyText: row.body_text,
    wordCount: Number(row.word_count ?? 0),
    summary: row.summary ?? null,
    citations,
    coachSessionId: row.coach_session_id ?? null,
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
  };
}

export async function listRevisionsForChapter(
  chapterId: string,
  userId: string,
): Promise<AutobiographerChapterRevision[]> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${REVISION_COLUMNS}
       FROM agos_autobiographer_chapter_revisions
      WHERE chapter_id = $1 AND user_id = $2
      ORDER BY version DESC`,
    [chapterId, userId],
  );
  return r.rows.map(rowToRevision);
}

export async function getRevision(
  id: string,
  userId: string,
): Promise<AutobiographerChapterRevision | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${REVISION_COLUMNS}
       FROM agos_autobiographer_chapter_revisions
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToRevision(r.rows[0]);
}

/**
 * Fetch the highest-version revision for a chapter. Returns null when
 * the chapter has no revisions yet (chapter is still "outline").
 */
export async function getLatestRevisionForChapter(
  chapterId: string,
  userId: string,
): Promise<AutobiographerChapterRevision | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${REVISION_COLUMNS}
       FROM agos_autobiographer_chapter_revisions
      WHERE chapter_id = $1 AND user_id = $2
      ORDER BY version DESC
      LIMIT 1`,
    [chapterId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToRevision(r.rows[0]);
}

/**
 * Fetch a specific version of a chapter. Returns null when missing or
 * cross-tenant.
 */
export async function getRevisionByVersion(
  chapterId: string,
  version: number,
  userId: string,
): Promise<AutobiographerChapterRevision | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${REVISION_COLUMNS}
       FROM agos_autobiographer_chapter_revisions
      WHERE chapter_id = $1 AND version = $2 AND user_id = $3`,
    [chapterId, version, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToRevision(r.rows[0]);
}

/**
 * Insert a revision. Derives `version = max(existing) + 1` inside the
 * same INSERT statement so concurrent writes against the same chapter
 * never share a version number. The caller is expected to have
 * verified chapter ownership; the route layer does the probe.
 */
export async function insertRevision(
  userId: string,
  data: InsertRevisionInput,
): Promise<AutobiographerChapterRevision> {
  if (!(REVISION_AUTHORS as readonly string[]).includes(data.author)) {
    throw new Error(`Invalid author: ${data.author}`);
  }
  const pool = getAutobiographerPool();
  const id = randomUUID();
  const body = data.bodyText;
  const wc = countRevisionWords(body);
  const citations = normalizeCitations(data.citations ?? []);
  const sensitiveKinds = data.sensitiveKinds
    ? validateSensitiveKindsStrict(data.sensitiveKinds)
    : [];

  await pool.query(
    `INSERT INTO agos_autobiographer_chapter_revisions
       (id, chapter_id, user_id, version, author, body_text, word_count,
        summary, citations, coach_session_id, sensitive_kinds, metadata)
     VALUES (
       $1, $2, $3,
       COALESCE(
         (SELECT MAX(version) + 1 FROM agos_autobiographer_chapter_revisions
           WHERE chapter_id = $2),
         1
       ),
       $4, $5, $6, $7, $8::jsonb, $9, $10::text[], $11::jsonb
     )`,
    [
      id,
      data.chapterId,
      userId,
      data.author,
      body,
      wc,
      data.summary ?? null,
      JSON.stringify(citations),
      data.coachSessionId ?? null,
      sensitiveKinds,
      JSON.stringify(data.metadata ?? {}),
    ],
  );

  const revision = await getRevision(id, userId);
  if (!revision) throw new Error('Failed to insert revision');
  return revision;
}

/**
 * Patch an existing revision. Recomputes `word_count` when `bodyText`
 * is supplied; renormalizes `citations` when supplied. `version`,
 * `author`, and `coach_session_id` are immutable after insert.
 *
 * Phase 6 seam: when Phase 6 ships, this handler will accept a
 * `sensitive_kinds` field. The column is not yet declared; the field
 * is rejected at the route layer with a validation error so the lib
 * does not need a column-level guard yet.
 */
export async function updateRevision(
  id: string,
  userId: string,
  patch: UpdateRevisionInput,
): Promise<AutobiographerChapterRevision | null> {
  const pool = getAutobiographerPool();
  let wc: number | null = null;
  let body: string | null = null;
  if (patch.bodyText !== undefined) {
    body = patch.bodyText;
    wc = countRevisionWords(body);
  }
  let citations: RevisionCitation[] | null = null;
  if (patch.citations !== undefined) {
    citations = normalizeCitations(patch.citations);
  }
  const sensitiveKindsProvided = Object.prototype.hasOwnProperty.call(
    patch,
    'sensitiveKinds',
  );
  const sensitiveKinds = patch.sensitiveKinds
    ? validateSensitiveKindsStrict(patch.sensitiveKinds)
    : [];

  await pool.query(
    `UPDATE agos_autobiographer_chapter_revisions
        SET body_text       = COALESCE($3,        body_text),
            word_count      = COALESCE($4,        word_count),
            summary         = COALESCE($5,        summary),
            citations       = COALESCE($6::jsonb, citations),
            sensitive_kinds = CASE WHEN $7::boolean THEN $8::text[] ELSE sensitive_kinds END,
            metadata        = COALESCE($9::jsonb, metadata)
      WHERE id = $1 AND user_id = $2`,
    [
      id,
      userId,
      body,
      wc,
      patch.summary ?? null,
      citations ? JSON.stringify(citations) : null,
      sensitiveKindsProvided,
      sensitiveKinds,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  return getRevision(id, userId);
}

export async function deleteRevision(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `DELETE FROM agos_autobiographer_chapter_revisions
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Count revisions across every chapter in a book. Used by the book
 * detail page header.
 */
export async function countRevisionsForBook(
  bookId: string,
  userId: string,
): Promise<number> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM agos_autobiographer_chapter_revisions r
       JOIN agos_autobiographer_chapters c ON c.id = r.chapter_id
      WHERE c.book_id = $1 AND c.user_id = $2`,
    [bookId, userId],
  );
  return Number(r.rows[0]?.n ?? 0);
}

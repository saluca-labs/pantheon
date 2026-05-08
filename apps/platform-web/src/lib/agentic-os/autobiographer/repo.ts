/**
 * Autobiographer OS — database CRUD for chapters and life events.
 *
 * All queries target the `agos_autobiographer_*` tables added in migration
 * 0009_autobiographer_os.py.
 *
 * @license MIT — original work for Tiresias platform
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAutobiographerPool } from './session';
import { countWords } from './chapters';
import type { Chapter, ChapterStatus, LifeEvent, EventKind } from './chapters';

// ─── Chapters ────────────────────────────────────────────────────────────────

export async function listChapters(userId: string): Promise<Chapter[]> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT id, user_id, title, body_text, period_label, status, word_count, created_at, updated_at
       FROM agos_autobiographer_chapters
      WHERE user_id = $1
      ORDER BY updated_at DESC`,
    [userId],
  );
  return r.rows.map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    bodyText: row.body_text,
    periodLabel: row.period_label,
    status: row.status as ChapterStatus,
    wordCount: Number(row.word_count),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}

export async function getChapter(id: string): Promise<Chapter | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT id, user_id, title, body_text, period_label, status, word_count, created_at, updated_at
       FROM agos_autobiographer_chapters
      WHERE id = $1`,
    [id],
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    bodyText: row.body_text,
    periodLabel: row.period_label,
    status: row.status as ChapterStatus,
    wordCount: Number(row.word_count),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface ChapterUpsert {
  title: string;
  bodyText: string;
  periodLabel?: string | null;
  status?: ChapterStatus;
}

export async function createChapter(userId: string, data: ChapterUpsert): Promise<Chapter> {
  const pool = getAutobiographerPool();
  const id = randomUUID();
  const wc = countWords(data.bodyText);
  await pool.query(
    `INSERT INTO agos_autobiographer_chapters
       (id, user_id, title, body_text, period_label, status, word_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, userId, data.title, data.bodyText, data.periodLabel ?? null, data.status ?? 'draft', wc],
  );
  const chapter = await getChapter(id);
  if (!chapter) throw new Error('Failed to create chapter');
  return chapter;
}

export async function updateChapter(id: string, data: Partial<ChapterUpsert>): Promise<Chapter> {
  const pool = getAutobiographerPool();
  // Fetch current to merge
  const current = await getChapter(id);
  if (!current) throw new Error('Chapter not found');
  const newBody = data.bodyText ?? current.bodyText;
  const wc = countWords(newBody);
  await pool.query(
    `UPDATE agos_autobiographer_chapters
        SET title        = $2,
            body_text    = $3,
            period_label = $4,
            status       = $5,
            word_count   = $6,
            updated_at   = now()
      WHERE id = $1`,
    [
      id,
      data.title ?? current.title,
      newBody,
      data.periodLabel !== undefined ? data.periodLabel : current.periodLabel,
      data.status ?? current.status,
      wc,
    ],
  );
  const updated = await getChapter(id);
  if (!updated) throw new Error('Failed to update chapter');
  return updated;
}

// ─── Life Events ─────────────────────────────────────────────────────────────

export async function listEvents(chapterId: string): Promise<LifeEvent[]> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT id, chapter_id, user_id, kind, headline, detail, occurred_year, created_at
       FROM agos_autobiographer_events
      WHERE chapter_id = $1
      ORDER BY occurred_year ASC NULLS LAST, created_at ASC`,
    [chapterId],
  );
  return r.rows.map((row: any) => ({
    id: row.id,
    chapterId: row.chapter_id,
    userId: row.user_id,
    kind: row.kind as EventKind,
    headline: row.headline,
    detail: row.detail,
    occurredYear: row.occurred_year === null ? null : Number(row.occurred_year),
    createdAt: row.created_at.toISOString(),
  }));
}

export async function createEvent(args: {
  chapterId: string;
  userId: string;
  kind: EventKind;
  headline: string;
  detail?: string | null;
  occurredYear?: number | null;
}): Promise<LifeEvent> {
  const pool = getAutobiographerPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_autobiographer_events
       (id, chapter_id, user_id, kind, headline, detail, occurred_year)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, args.chapterId, args.userId, args.kind, args.headline, args.detail ?? null, args.occurredYear ?? null],
  );
  return {
    id,
    chapterId: args.chapterId,
    userId: args.userId,
    kind: args.kind,
    headline: args.headline,
    detail: args.detail ?? null,
    occurredYear: args.occurredYear ?? null,
    createdAt: new Date().toISOString(),
  };
}

// ─── Audit ──────────────────────────────────────────────────────────────────

export async function recordAudit(args: {
  actorId: string;
  action: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const pool = getAutobiographerPool();
  await pool.query(
    `INSERT INTO agos_audit (id, actor_id, os_slug, action, payload)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [randomUUID(), args.actorId, 'autobiographer', args.action, JSON.stringify(args.payload ?? {})],
  );
}

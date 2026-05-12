/**
 * Autobiographer coach persistence — single-table session storage.
 *
 * Mirrors Maker OS Phase 7 exactly: one row per session, whole transcript
 * stored as an ordered JSONB array on the row. No `messages` table —
 * Autobiographer ships no mutating tools beyond the chapter_drafter
 * commit flow (which writes to `agos_autobiographer_chapter_revisions`,
 * NOT to a coach-internal action log).
 *
 * Cross-ownership is enforced at the SQL level: every read filters by
 * `user_id`. Book-scoped reads carry the `book_id` filter but DO NOT
 * join to `agos_autobiographer_books` (per the v0.1.30 platform
 * contract, per-OS UUIDs are not FK-enforced on cross-cutting tables).
 * The session row owns its ownership check via `user_id`.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAutobiographerPool } from '../session';
import { COACH_MODE_VALUES, type CoachMode } from './modes';

export type CoachMessageRole = 'user' | 'assistant' | 'system';

export interface CoachMessage {
  role: CoachMessageRole;
  content: string;
  /** ISO-8601 UTC timestamp. */
  created_at: string;
}

export interface CoachSession {
  id: string;
  userId: string;
  bookId: string | null;
  mode: CoachMode;
  title: string;
  messages: CoachMessage[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const COACH_MESSAGE_ROLE_VALUES: readonly CoachMessageRole[] = [
  'user',
  'assistant',
  'system',
];

function isMessageRole(value: unknown): value is CoachMessageRole {
  return (
    typeof value === 'string' &&
    (COACH_MESSAGE_ROLE_VALUES as readonly string[]).includes(value)
  );
}

function coerceMessages(value: unknown): CoachMessage[] {
  if (!Array.isArray(value)) return [];
  const out: CoachMessage[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (!isMessageRole(e['role'])) continue;
    if (typeof e['content'] !== 'string') continue;
    const created =
      typeof e['created_at'] === 'string'
        ? e['created_at']
        : new Date().toISOString();
    out.push({ role: e['role'], content: e['content'], created_at: created });
  }
  return out;
}

function rowToSession(row: any): CoachSession {
  return {
    id: row.id,
    userId: row.user_id,
    bookId: row.book_id ?? null,
    mode: row.mode as CoachMode,
    title: row.title,
    messages: coerceMessages(row.messages),
    metadata: row.metadata ?? {},
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

const SESSION_COLUMNS = `id, user_id, book_id, mode, title, messages,
                         metadata, created_at, updated_at`;

// ─── Create ───────────────────────────────────────────────────────────────

export interface CreateSessionInput {
  userId: string;
  mode: CoachMode;
  bookId?: string | null;
  title: string;
  initialMessages?: CoachMessage[];
  metadata?: Record<string, unknown>;
}

export async function createSession(
  input: CreateSessionInput,
): Promise<CoachSession> {
  if (!(COACH_MODE_VALUES as readonly string[]).includes(input.mode)) {
    throw new Error(`Invalid coach mode: ${input.mode}`);
  }
  const pool = getAutobiographerPool();
  const id = randomUUID();
  const messages = input.initialMessages ?? [];
  const r = await pool.query(
    `INSERT INTO agos_autobiographer_coach_sessions
       (id, user_id, book_id, mode, title, messages, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
     RETURNING ${SESSION_COLUMNS}`,
    [
      id,
      input.userId,
      input.bookId ?? null,
      input.mode,
      input.title,
      JSON.stringify(messages),
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return rowToSession(r.rows[0]);
}

// ─── Read ─────────────────────────────────────────────────────────────────

export async function getSession(
  id: string,
  userId: string,
): Promise<CoachSession | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${SESSION_COLUMNS}
       FROM agos_autobiographer_coach_sessions
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToSession(r.rows[0]);
}

export interface ListSessionsInput {
  userId: string;
  /** Filter by mode. */
  mode?: CoachMode;
  /** Filter by exact book_id (use scope: 'workshop' for book_id IS NULL). */
  bookId?: string;
  /** When 'workshop', filters to book_id IS NULL. */
  scope?: 'workshop' | 'book';
  limit?: number;
  offset?: number;
}

export async function listSessions(
  input: ListSessionsInput,
): Promise<CoachSession[]> {
  const pool = getAutobiographerPool();
  const params: any[] = [input.userId];
  const where: string[] = ['user_id = $1'];
  if (input.mode) {
    if (!(COACH_MODE_VALUES as readonly string[]).includes(input.mode)) {
      throw new Error(`Invalid coach mode: ${input.mode}`);
    }
    params.push(input.mode);
    where.push(`mode = $${params.length}`);
  }
  if (input.bookId) {
    params.push(input.bookId);
    where.push(`book_id = $${params.length}`);
  } else if (input.scope === 'workshop') {
    where.push(`book_id IS NULL`);
  }
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  params.push(limit, offset);
  const r = await pool.query(
    `SELECT ${SESSION_COLUMNS}
       FROM agos_autobiographer_coach_sessions
      WHERE ${where.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToSession);
}

// ─── Update ───────────────────────────────────────────────────────────────

export interface UpdateSessionInput {
  /**
   * Title is the ONLY mutable field post-create. Mode is locked at
   * insert time so the system-prompt version pinned in metadata
   * remains coherent across the transcript.
   */
  title?: string;
}

export async function updateSession(
  id: string,
  userId: string,
  patch: UpdateSessionInput,
): Promise<CoachSession | null> {
  const existing = await getSession(id, userId);
  if (!existing) return null;
  const pool = getAutobiographerPool();
  await pool.query(
    `UPDATE agos_autobiographer_coach_sessions
        SET title      = COALESCE($3, title),
            updated_at = now()
      WHERE id = $1 AND user_id = $2`,
    [id, userId, patch.title ?? null],
  );
  return getSession(id, userId);
}

/**
 * Append one or more messages to a session and bump updated_at.
 *
 * The append is performed in a single SQL statement so concurrent
 * appends serialize at the database; we don't lose the prior messages
 * to a read-modify-write race. Returns the updated session row.
 */
export async function appendMessages(
  id: string,
  userId: string,
  messages: CoachMessage[],
): Promise<CoachSession | null> {
  if (messages.length === 0) return getSession(id, userId);
  for (const m of messages) {
    if (!isMessageRole(m.role)) {
      throw new Error(`Invalid message role: ${m.role}`);
    }
    if (typeof m.content !== 'string') {
      throw new Error('Message content must be a string');
    }
  }
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `UPDATE agos_autobiographer_coach_sessions
        SET messages   = messages || $3::jsonb,
            updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING ${SESSION_COLUMNS}`,
    [id, userId, JSON.stringify(messages)],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToSession(r.rows[0]);
}

/** Merge a JSON metadata patch into the row's metadata column. */
export async function patchMetadata(
  id: string,
  userId: string,
  patch: Record<string, unknown>,
): Promise<CoachSession | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `UPDATE agos_autobiographer_coach_sessions
        SET metadata   = metadata || $3::jsonb,
            updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING ${SESSION_COLUMNS}`,
    [id, userId, JSON.stringify(patch)],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToSession(r.rows[0]);
}

export async function touchSession(
  id: string,
  userId: string,
): Promise<void> {
  const pool = getAutobiographerPool();
  await pool.query(
    `UPDATE agos_autobiographer_coach_sessions
        SET updated_at = now()
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
}

// ─── Delete ───────────────────────────────────────────────────────────────

export async function deleteSession(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `DELETE FROM agos_autobiographer_coach_sessions
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────

/**
 * Derive a short title (≤ 60 chars) from a free-form first turn. Used
 * when the caller creates a session with an `initial_message` and no
 * explicit title.
 */
export function autoTitle(message: string): string {
  const oneLine = (message ?? '').trim().replace(/\s+/g, ' ');
  if (!oneLine) return 'New conversation';
  if (oneLine.length <= 60) return oneLine;
  return oneLine.slice(0, 59) + '…';
}

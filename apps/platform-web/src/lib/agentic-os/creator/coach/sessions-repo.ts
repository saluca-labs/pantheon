/**
 * Creator coach persistence — single-table session storage.
 *
 * Stores the whole transcript on the session row as an ordered JSONB array.
 * Supports soft-delete via `archived_at` — active sessions are filtered
 * by partial indexes WHERE archived_at IS NULL.
 *
 * Cross-ownership is enforced at the SQL level: every read filters by
 * `user_id`.
 *
 * @license MIT — Tiresias Creator OS Phase 7 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getCreatorPool } from '../session';
import { recordAudit } from '../../_shared/audit';
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
  title: string;
  mode: CoachMode;
  model: string;
  messages: CoachMessage[];
  archivedAt: string | null;
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

interface RawCreatorCoachSessionRow {
  id: string;
  user_id: string;
  title: string;
  mode: string;
  model: string;
  messages: unknown;
  archived_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function rowToSession(row: RawCreatorCoachSessionRow): CoachSession {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    mode: row.mode as CoachMode,
    model: row.model,
    messages: coerceMessages(row.messages),
    archivedAt:
      row.archived_at instanceof Date
        ? row.archived_at.toISOString()
        : row.archived_at
          ? String(row.archived_at)
          : null,
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

const SESSION_COLUMNS = `id, user_id, title, mode, model, messages,
                         archived_at, created_at, updated_at`;

// ─── Create ───────────────────────────────────────────────────────────────

export interface CreateSessionInput {
  userId: string;
  mode: CoachMode;
  title: string;
  model?: string;
  initialMessages?: CoachMessage[];
}

export async function createSession(
  input: CreateSessionInput,
): Promise<CoachSession> {
  if (!(COACH_MODE_VALUES as readonly string[]).includes(input.mode)) {
    throw new Error(`Invalid coach mode: ${input.mode}`);
  }
  const pool = getCreatorPool();
  const id = randomUUID();
  const messages = input.initialMessages ?? [];
  const model = input.model ?? 'claude-sonnet-4-6';
  const r = await pool.query(
    `INSERT INTO agos_creator_coach_sessions
       (id, user_id, title, mode, model, messages)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING ${SESSION_COLUMNS}`,
    [
      id,
      input.userId,
      input.title,
      input.mode,
      model,
      JSON.stringify(messages),
    ],
  );
  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: input.userId,
    action: 'creator.coach.session_created',
    payload: { session_id: id, mode: input.mode },
  });
  return rowToSession(r.rows[0]);
}

// ─── Read ─────────────────────────────────────────────────────────────────

export async function getSession(
  id: string,
  userId: string,
): Promise<CoachSession | null> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `SELECT ${SESSION_COLUMNS}
       FROM agos_creator_coach_sessions
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToSession(r.rows[0]);
}

export interface ListSessionsInput {
  userId: string;
  includeArchived?: boolean;
  mode?: CoachMode;
  limit?: number;
}

export async function listSessions(
  input: ListSessionsInput,
): Promise<CoachSession[]> {
  const pool = getCreatorPool();
  const params: unknown[] = [input.userId];
  const where: string[] = ['user_id = $1'];

  if (!input.includeArchived) {
    where.push('archived_at IS NULL');
  }

  if (input.mode) {
    if (!(COACH_MODE_VALUES as readonly string[]).includes(input.mode)) {
      throw new Error(`Invalid coach mode: ${input.mode}`);
    }
    params.push(input.mode);
    where.push(`mode = $${params.length}`);
  }

  const limit = Math.min(Math.max(input.limit ?? 20, 1), 200);
  params.push(limit);

  const r = await pool.query(
    `SELECT ${SESSION_COLUMNS}
       FROM agos_creator_coach_sessions
      WHERE ${where.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT $${params.length}`,
    params,
  );
  return r.rows.map(rowToSession);
}

// ─── Update ───────────────────────────────────────────────────────────────

export interface UpdateSessionInput {
  title?: string;
  mode?: CoachMode;
}

export async function updateSession(
  id: string,
  userId: string,
  patch: UpdateSessionInput,
): Promise<CoachSession | null> {
  const existing = await getSession(id, userId);
  if (!existing) return null;

  if (patch.mode && !(COACH_MODE_VALUES as readonly string[]).includes(patch.mode)) {
    throw new Error(`Invalid coach mode: ${patch.mode}`);
  }

  const pool = getCreatorPool();
  await pool.query(
    `UPDATE agos_creator_coach_sessions
        SET title      = COALESCE($3, title),
            mode       = COALESCE($4, mode),
            updated_at = now()
      WHERE id = $1 AND user_id = $2`,
    [id, userId, patch.title ?? null, patch.mode ?? null],
  );
  return getSession(id, userId);
}

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
  const pool = getCreatorPool();
  const r = await pool.query(
    `UPDATE agos_creator_coach_sessions
        SET messages   = messages || $3::jsonb,
            updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING ${SESSION_COLUMNS}`,
    [id, userId, JSON.stringify(messages)],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToSession(r.rows[0]);
}

// ─── Archive / Unarchive ──────────────────────────────────────────────────

export async function toggleArchive(
  id: string,
  userId: string,
): Promise<CoachSession | null> {
  const existing = await getSession(id, userId);
  if (!existing) return null;

  const pool = getCreatorPool();
  const newArchivedAt = existing.archivedAt ? null : new Date().toISOString();
  const r = await pool.query(
    `UPDATE agos_creator_coach_sessions
        SET archived_at = $3,
            updated_at  = now()
      WHERE id = $1 AND user_id = $2
      RETURNING ${SESSION_COLUMNS}`,
    [id, userId, newArchivedAt],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToSession(r.rows[0]);
}

// ─── Delete ───────────────────────────────────────────────────────────────

export async function deleteSession(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `DELETE FROM agos_creator_coach_sessions
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────

export function autoTitle(message: string): string {
  const oneLine = (message ?? '').trim().replace(/\s+/g, ' ');
  if (!oneLine) return 'New session';
  if (oneLine.length <= 60) return oneLine;
  return oneLine.slice(0, 59) + '…';
}

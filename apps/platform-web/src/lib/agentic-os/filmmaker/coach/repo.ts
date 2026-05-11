/**
 * Filmmaker coach persistence — conversations, messages, action log.
 *
 * Mirrors `health/coach/repo.ts` but is project-scoped (no tenant_id;
 * project-FK ownership join). All cross-user / cross-project access is
 * blocked at the SQL level via the join to `agos_filmmaker_projects`.
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getFilmmakerPool } from '../session';
import { COACH_MODE_VALUES, type CoachMode } from './modes';

export type CoachMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface CoachConversation {
  id: string;
  projectId: string;
  mode: CoachMode;
  title: string | null;
  model: string;
  systemPromptVersion: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CoachToolCall {
  id: string;
  name: string;
  input: unknown;
  result?: unknown;
}

export interface CoachMessage {
  id: string;
  conversationId: string;
  role: CoachMessageRole;
  content: string;
  toolCalls: CoachToolCall[] | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const CONVERSATION_COLUMNS = `id, project_id, mode, title, model,
                              system_prompt_version, metadata,
                              created_at, updated_at`;

function rowToConversation(row: any): CoachConversation {
  return {
    id: row.id,
    projectId: row.project_id,
    mode: row.mode as CoachMode,
    title: row.title,
    model: row.model,
    systemPromptVersion: row.system_prompt_version,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function rowToMessage(row: any): CoachMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as CoachMessageRole,
    content: row.content,
    toolCalls: row.tool_calls ?? null,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
  };
}

export interface CreateConversationInput {
  projectId: string;
  userId: string;
  mode: CoachMode;
  model: string;
  systemPromptVersion: string;
  title?: string | null;
}

/**
 * Create a new conversation. Verifies the project is owned by the user
 * via a project-FK ownership pre-check before insert so we never write
 * an orphan conversation row.
 */
export async function createConversation(
  input: CreateConversationInput,
): Promise<CoachConversation> {
  if (!(COACH_MODE_VALUES as readonly string[]).includes(input.mode)) {
    throw new Error(`Invalid coach mode: ${input.mode}`);
  }
  const pool = getFilmmakerPool();
  const ownership = await pool.query(
    `SELECT id FROM agos_filmmaker_projects WHERE id = $1 AND user_id = $2`,
    [input.projectId, input.userId],
  );
  if ((ownership.rowCount ?? 0) === 0) {
    throw new Error('Project not found or not owned by user');
  }
  const id = randomUUID();
  const r = await pool.query(
    `INSERT INTO agos_filmmaker_coach_conversation
       (id, project_id, mode, title, model, system_prompt_version)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING ${CONVERSATION_COLUMNS}`,
    [
      id,
      input.projectId,
      input.mode,
      input.title ?? null,
      input.model,
      input.systemPromptVersion,
    ],
  );
  return rowToConversation(r.rows[0]);
}

export async function getConversation(
  id: string,
  userId: string,
): Promise<CoachConversation | null> {
  const pool = getFilmmakerPool();
  const columns = CONVERSATION_COLUMNS.split(',').map((c) => `c.${c.trim()}`).join(', ');
  const r = await pool.query(
    `SELECT ${columns}
       FROM agos_filmmaker_coach_conversation c
       JOIN agos_filmmaker_projects p ON p.id = c.project_id
      WHERE c.id = $1 AND p.user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToConversation(r.rows[0]);
}

export interface ListConversationsInput {
  projectId: string;
  userId: string;
  limit?: number;
  offset?: number;
}

export async function listConversations(
  input: ListConversationsInput,
): Promise<CoachConversation[]> {
  const pool = getFilmmakerPool();
  const columns = CONVERSATION_COLUMNS.split(',').map((c) => `c.${c.trim()}`).join(', ');
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  const r = await pool.query(
    `SELECT ${columns}
       FROM agos_filmmaker_coach_conversation c
       JOIN agos_filmmaker_projects p ON p.id = c.project_id
      WHERE c.project_id = $1 AND p.user_id = $2
      ORDER BY c.updated_at DESC
      LIMIT $3 OFFSET $4`,
    [input.projectId, input.userId, limit, offset],
  );
  return r.rows.map(rowToConversation);
}

export interface UpdateConversationInput {
  title?: string | null;
  mode?: CoachMode;
}

export async function updateConversation(
  id: string,
  userId: string,
  patch: UpdateConversationInput,
): Promise<CoachConversation | null> {
  const existing = await getConversation(id, userId);
  if (!existing) return null;
  if (patch.mode !== undefined && !(COACH_MODE_VALUES as readonly string[]).includes(patch.mode)) {
    throw new Error(`Invalid coach mode: ${patch.mode}`);
  }
  const pool = getFilmmakerPool();
  await pool.query(
    `UPDATE agos_filmmaker_coach_conversation
        SET title      = COALESCE($2, title),
            mode       = COALESCE($3, mode),
            updated_at = now()
      WHERE id = $1`,
    [
      id,
      patch.title === undefined ? null : patch.title,
      patch.mode ?? null,
    ],
  );
  return getConversation(id, userId);
}

export async function touchConversation(
  id: string,
  userId: string,
): Promise<void> {
  const existing = await getConversation(id, userId);
  if (!existing) return;
  const pool = getFilmmakerPool();
  await pool.query(
    `UPDATE agos_filmmaker_coach_conversation
        SET updated_at = now()
      WHERE id = $1`,
    [id],
  );
}

export async function deleteConversation(
  id: string,
  userId: string,
): Promise<boolean> {
  const existing = await getConversation(id, userId);
  if (!existing) return false;
  const pool = getFilmmakerPool();
  const r = await pool.query(
    `DELETE FROM agos_filmmaker_coach_conversation WHERE id = $1`,
    [id],
  );
  return (r.rowCount ?? 0) > 0;
}

export interface AppendMessageInput {
  conversationId: string;
  role: CoachMessageRole;
  content: string;
  toolCalls?: CoachToolCall[] | null;
  metadata?: Record<string, unknown>;
}

export async function appendMessage(
  input: AppendMessageInput,
): Promise<CoachMessage> {
  const pool = getFilmmakerPool();
  const id = randomUUID();
  const r = await pool.query(
    `INSERT INTO agos_filmmaker_coach_message
       (id, conversation_id, role, content, tool_calls, metadata)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)
     RETURNING id, conversation_id, role, content, tool_calls,
               metadata, created_at`,
    [
      id,
      input.conversationId,
      input.role,
      input.content,
      input.toolCalls ? JSON.stringify(input.toolCalls) : null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return rowToMessage(r.rows[0]);
}

export interface ListMessagesInput {
  conversationId: string;
  userId: string;
  limit?: number;
  offset?: number;
  before?: string;
}

export async function listMessages(
  input: ListMessagesInput,
): Promise<CoachMessage[]> {
  const conversation = await getConversation(input.conversationId, input.userId);
  if (!conversation) return [];
  const pool = getFilmmakerPool();
  const limit = Math.min(Math.max(input.limit ?? 200, 1), 1000);
  const offset = Math.max(input.offset ?? 0, 0);
  const params: any[] = [input.conversationId];
  let where = 'WHERE conversation_id = $1';
  if (input.before) {
    params.push(new Date(input.before));
    where += ` AND created_at < $${params.length}`;
  }
  params.push(limit, offset);
  const r = await pool.query(
    `SELECT id, conversation_id, role, content, tool_calls,
            metadata, created_at
       FROM agos_filmmaker_coach_message
       ${where}
      ORDER BY created_at ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToMessage);
}

export interface LogCoachActionInput {
  conversationId: string;
  messageId?: string | null;
  projectId: string;
  userId: string;
  toolName: string;
  toolInput: unknown;
  toolOutput: unknown;
}

export async function logCoachAction(input: LogCoachActionInput): Promise<void> {
  const pool = getFilmmakerPool();
  await pool.query(
    `INSERT INTO agos_filmmaker_coach_action_log
       (id, conversation_id, message_id, project_id, user_id,
        tool_name, tool_input, tool_output)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,
    [
      randomUUID(),
      input.conversationId,
      input.messageId ?? null,
      input.projectId,
      input.userId,
      input.toolName,
      JSON.stringify(input.toolInput),
      JSON.stringify(input.toolOutput),
    ],
  );
}

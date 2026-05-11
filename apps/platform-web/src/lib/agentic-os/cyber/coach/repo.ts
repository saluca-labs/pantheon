/**
 * Cyber coach persistence — conversations, messages, action log.
 *
 * Mirrors filmmaker/coach/repo.ts but is owner-scoped (cyber is user-scoped,
 * no tenant_id). Conversations may optionally be attached to a case for
 * extra context.
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getCyberPool } from '../session';
import { COACH_MODE_VALUES, type CoachMode } from './modes';
import type { RedactionMatch } from './secret-redaction';

export type CoachMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface CoachConversation {
  id: string;
  ownerId: string;
  caseId: string | null;
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
  redacted: boolean;
  redactionMatches: RedactionMatch[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

const CONVERSATION_COLUMNS = `id, owner_id, case_id, mode, title, model,
                              system_prompt_version, metadata,
                              created_at, updated_at`;

function rowToConversation(row: any): CoachConversation {
  return {
    id: row.id,
    ownerId: row.owner_id,
    caseId: row.case_id ?? null,
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
    redacted: !!row.redacted,
    redactionMatches: (row.redaction_matches ?? []) as RedactionMatch[],
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
  };
}

export interface CreateConversationInput {
  ownerId: string;
  mode: CoachMode;
  model: string;
  systemPromptVersion: string;
  caseId?: string | null;
  title?: string | null;
}

/**
 * Create a new conversation. If a caseId is supplied, verifies the case is
 * owned by the user before insert (so we never attach a coach conversation
 * to a case the user can't see). Unattached conversations skip the check.
 */
export async function createConversation(
  input: CreateConversationInput,
): Promise<CoachConversation> {
  if (!(COACH_MODE_VALUES as readonly string[]).includes(input.mode)) {
    throw new Error(`Invalid coach mode: ${input.mode}`);
  }
  const pool = getCyberPool();
  if (input.caseId) {
    const ownership = await pool.query(
      `SELECT id FROM agos_cyber_cases WHERE id = $1 AND owner_id = $2`,
      [input.caseId, input.ownerId],
    );
    if ((ownership.rowCount ?? 0) === 0) {
      throw new Error('Case not found or not owned by user');
    }
  }
  const id = randomUUID();
  const r = await pool.query(
    `INSERT INTO agos_cyber_coach_conversation
       (id, owner_id, case_id, mode, title, model, system_prompt_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING ${CONVERSATION_COLUMNS}`,
    [
      id,
      input.ownerId,
      input.caseId ?? null,
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
  ownerId: string,
): Promise<CoachConversation | null> {
  const pool = getCyberPool();
  const r = await pool.query(
    `SELECT ${CONVERSATION_COLUMNS}
       FROM agos_cyber_coach_conversation
      WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToConversation(r.rows[0]);
}

export interface ListConversationsInput {
  ownerId: string;
  caseId?: string | null;
  limit?: number;
  offset?: number;
}

export async function listConversations(
  input: ListConversationsInput,
): Promise<CoachConversation[]> {
  const pool = getCyberPool();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  const params: any[] = [input.ownerId];
  let where = 'WHERE owner_id = $1';
  if (input.caseId !== undefined && input.caseId !== null) {
    params.push(input.caseId);
    where += ` AND case_id = $${params.length}`;
  }
  params.push(limit, offset);
  const r = await pool.query(
    `SELECT ${CONVERSATION_COLUMNS}
       FROM agos_cyber_coach_conversation
       ${where}
      ORDER BY updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToConversation);
}

export interface UpdateConversationInput {
  title?: string | null;
  mode?: CoachMode;
}

export async function updateConversation(
  id: string,
  ownerId: string,
  patch: UpdateConversationInput,
): Promise<CoachConversation | null> {
  const existing = await getConversation(id, ownerId);
  if (!existing) return null;
  if (patch.mode !== undefined && !(COACH_MODE_VALUES as readonly string[]).includes(patch.mode)) {
    throw new Error(`Invalid coach mode: ${patch.mode}`);
  }
  const pool = getCyberPool();
  await pool.query(
    `UPDATE agos_cyber_coach_conversation
        SET title      = COALESCE($2, title),
            mode       = COALESCE($3, mode),
            updated_at = now()
      WHERE id = $1 AND owner_id = $4`,
    [
      id,
      patch.title === undefined ? null : patch.title,
      patch.mode ?? null,
      ownerId,
    ],
  );
  return getConversation(id, ownerId);
}

export async function touchConversation(
  id: string,
  ownerId: string,
): Promise<void> {
  const existing = await getConversation(id, ownerId);
  if (!existing) return;
  const pool = getCyberPool();
  await pool.query(
    `UPDATE agos_cyber_coach_conversation
        SET updated_at = now()
      WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
}

export async function deleteConversation(
  id: string,
  ownerId: string,
): Promise<boolean> {
  const existing = await getConversation(id, ownerId);
  if (!existing) return false;
  const pool = getCyberPool();
  const r = await pool.query(
    `DELETE FROM agos_cyber_coach_conversation WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  return (r.rowCount ?? 0) > 0;
}

export interface AppendMessageInput {
  conversationId: string;
  role: CoachMessageRole;
  content: string;
  toolCalls?: CoachToolCall[] | null;
  redacted?: boolean;
  redactionMatches?: RedactionMatch[];
  metadata?: Record<string, unknown>;
}

export async function appendMessage(
  input: AppendMessageInput,
): Promise<CoachMessage> {
  const pool = getCyberPool();
  const id = randomUUID();
  const r = await pool.query(
    `INSERT INTO agos_cyber_coach_message
       (id, conversation_id, role, content, tool_calls, redacted,
        redaction_matches, metadata)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8::jsonb)
     RETURNING id, conversation_id, role, content, tool_calls, redacted,
               redaction_matches, metadata, created_at`,
    [
      id,
      input.conversationId,
      input.role,
      input.content,
      input.toolCalls ? JSON.stringify(input.toolCalls) : null,
      input.redacted ?? false,
      JSON.stringify(input.redactionMatches ?? []),
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return rowToMessage(r.rows[0]);
}

export interface ListMessagesInput {
  conversationId: string;
  ownerId: string;
  limit?: number;
  offset?: number;
  before?: string;
}

export async function listMessages(
  input: ListMessagesInput,
): Promise<CoachMessage[]> {
  const conversation = await getConversation(input.conversationId, input.ownerId);
  if (!conversation) return [];
  const pool = getCyberPool();
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
    `SELECT id, conversation_id, role, content, tool_calls, redacted,
            redaction_matches, metadata, created_at
       FROM agos_cyber_coach_message
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
  ownerId: string;
  caseId?: string | null;
  toolName: string;
  toolInput: unknown;
  toolOutput: unknown;
}

export async function logCoachAction(input: LogCoachActionInput): Promise<void> {
  const pool = getCyberPool();
  await pool.query(
    `INSERT INTO agos_cyber_coach_action_log
       (id, conversation_id, message_id, owner_id, case_id,
        tool_name, tool_input, tool_output)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,
    [
      randomUUID(),
      input.conversationId,
      input.messageId ?? null,
      input.ownerId,
      input.caseId ?? null,
      input.toolName,
      JSON.stringify(input.toolInput),
      JSON.stringify(input.toolOutput),
    ],
  );
}

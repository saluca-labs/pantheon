/**
 * Coach persistence — conversations, messages, action log.
 *
 * Mirrors the rest of `health/repo.ts`: raw SQL via the shared pool,
 * tenant-scoped, row-typed.
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getHealthPool } from '../session';

export type CoachMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface CoachConversation {
  id: string;
  tenantId: string;
  userId: string;
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
  crisisDetected: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface RawHealthCoachConversationRow {
  id: string;
  tenant_id: string;
  user_id: string;
  title: string | null;
  model: string;
  system_prompt_version: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface RawHealthCoachMessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  tool_calls: CoachToolCall[] | null;
  crisis_detected: boolean | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

function rowToConversation(row: RawHealthCoachConversationRow): CoachConversation {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    title: row.title,
    model: row.model,
    systemPromptVersion: row.system_prompt_version,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function rowToMessage(row: RawHealthCoachMessageRow): CoachMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as CoachMessageRole,
    content: row.content,
    toolCalls: row.tool_calls ?? null,
    crisisDetected: !!row.crisis_detected,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
  };
}

export interface CreateConversationInput {
  tenantId: string;
  userId: string;
  title?: string | null;
  model: string;
  systemPromptVersion: string;
}

export async function createConversation(
  input: CreateConversationInput,
): Promise<CoachConversation> {
  const pool = getHealthPool();
  const id = randomUUID();
  const r = await pool.query(
    `INSERT INTO agos_mh_coach_conversation
       (id, tenant_id, user_id, title, model, system_prompt_version)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, tenant_id, user_id, title, model, system_prompt_version,
               metadata, created_at, updated_at`,
    [
      id,
      input.tenantId,
      input.userId,
      input.title ?? null,
      input.model,
      input.systemPromptVersion,
    ],
  );
  return rowToConversation(r.rows[0]);
}

export async function getConversation(
  id: string,
  tenantId: string,
  userId: string,
): Promise<CoachConversation | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT id, tenant_id, user_id, title, model, system_prompt_version,
            metadata, created_at, updated_at
       FROM agos_mh_coach_conversation
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [id, tenantId, userId],
  );
  if (r.rowCount === 0) return null;
  return rowToConversation(r.rows[0]);
}

export interface ListConversationsInput {
  tenantId: string;
  userId: string;
  limit?: number;
  offset?: number;
}

export async function listConversations(
  input: ListConversationsInput,
): Promise<CoachConversation[]> {
  const pool = getHealthPool();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  const r = await pool.query(
    `SELECT id, tenant_id, user_id, title, model, system_prompt_version,
            metadata, created_at, updated_at
       FROM agos_mh_coach_conversation
      WHERE tenant_id = $1 AND user_id = $2
      ORDER BY updated_at DESC
      LIMIT $3 OFFSET $4`,
    [input.tenantId, input.userId, limit, offset],
  );
  return r.rows.map(rowToConversation);
}

export async function updateConversationTitle(
  id: string,
  tenantId: string,
  userId: string,
  title: string | null,
): Promise<CoachConversation | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `UPDATE agos_mh_coach_conversation
        SET title = $4, updated_at = now()
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3
      RETURNING id, tenant_id, user_id, title, model, system_prompt_version,
                metadata, created_at, updated_at`,
    [id, tenantId, userId, title],
  );
  if (r.rowCount === 0) return null;
  return rowToConversation(r.rows[0]);
}

export async function touchConversation(
  id: string,
  tenantId: string,
  userId: string,
): Promise<void> {
  const pool = getHealthPool();
  await pool.query(
    `UPDATE agos_mh_coach_conversation
        SET updated_at = now()
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [id, tenantId, userId],
  );
}

export async function deleteConversation(
  id: string,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const pool = getHealthPool();
  const r = await pool.query(
    `DELETE FROM agos_mh_coach_conversation
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [id, tenantId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

export interface AppendMessageInput {
  conversationId: string;
  role: CoachMessageRole;
  content: string;
  toolCalls?: CoachToolCall[] | null;
  crisisDetected?: boolean;
  metadata?: Record<string, unknown>;
}

export async function appendMessage(
  input: AppendMessageInput,
): Promise<CoachMessage> {
  const pool = getHealthPool();
  const id = randomUUID();
  const r = await pool.query(
    `INSERT INTO agos_mh_coach_message
       (id, conversation_id, role, content, tool_calls, crisis_detected, metadata)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb)
     RETURNING id, conversation_id, role, content, tool_calls,
               crisis_detected, metadata, created_at`,
    [
      id,
      input.conversationId,
      input.role,
      input.content,
      input.toolCalls ? JSON.stringify(input.toolCalls) : null,
      input.crisisDetected ?? false,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return rowToMessage(r.rows[0]);
}

export async function markMessageCrisis(
  messageId: string,
  matches: string[],
): Promise<void> {
  const pool = getHealthPool();
  await pool.query(
    `UPDATE agos_mh_coach_message
        SET crisis_detected = true,
            metadata = COALESCE(metadata, '{}'::jsonb)
                       || jsonb_build_object('crisis_matches', $2::jsonb)
      WHERE id = $1`,
    [messageId, JSON.stringify(matches)],
  );
}

export interface ListMessagesInput {
  conversationId: string;
  limit?: number;
  before?: string;
}

export async function listMessages(
  input: ListMessagesInput,
): Promise<CoachMessage[]> {
  const pool = getHealthPool();
  const limit = Math.min(Math.max(input.limit ?? 200, 1), 1000);
  const params: unknown[] = [input.conversationId];
  let where = 'WHERE conversation_id = $1';
  if (input.before) {
    params.push(new Date(input.before));
    where += ` AND created_at < $${params.length}`;
  }
  params.push(limit);
  const r = await pool.query(
    `SELECT id, conversation_id, role, content, tool_calls,
            crisis_detected, metadata, created_at
       FROM agos_mh_coach_message
       ${where}
      ORDER BY created_at ASC
      LIMIT $${params.length}`,
    params,
  );
  return r.rows.map(rowToMessage);
}

export interface LogCoachActionInput {
  conversationId: string;
  messageId?: string | null;
  tenantId: string;
  userId: string;
  toolName: string;
  toolInput: unknown;
  toolOutput: unknown;
}

export async function logCoachAction(input: LogCoachActionInput): Promise<void> {
  const pool = getHealthPool();
  await pool.query(
    `INSERT INTO agos_mh_coach_action_log
       (id, conversation_id, message_id, tenant_id, user_id,
        tool_name, tool_input, tool_output)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,
    [
      randomUUID(),
      input.conversationId,
      input.messageId ?? null,
      input.tenantId,
      input.userId,
      input.toolName,
      JSON.stringify(input.toolInput),
      JSON.stringify(input.toolOutput),
    ],
  );
}

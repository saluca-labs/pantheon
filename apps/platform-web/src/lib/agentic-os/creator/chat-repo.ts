/**
 * Creator OS Phase 6 — AI Chat DB repository.
 *
 * Cross-ownership contract: every read / write filters by `user_id`
 * directly. A conversation id belonging to another user returns null.
 *
 * Single-table inline-messages JSONB pattern — matches the Maker,
 * Autobiographer, and Business coach patterns.
 *
 * @license MIT — Tiresias Creator OS Phase 6 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getCreatorPool } from './session';
import { recordAudit } from '../_shared/audit';
import type {
  CreatorConversation,
  CreateConversationInput,
  UpdateConversationInput,
  ChatMessage,
} from './chat';

const CONVO_COLUMNS = `id, user_id, title, model, system_prompt, messages,
                       created_at, updated_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function toIsoOrNull(v: unknown): string | null {
  if (v == null) return null;
  return toIso(v);
}

function coerceMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  const out: ChatMessage[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (e['role'] !== 'user' && e['role'] !== 'assistant' && e['role'] !== 'system') continue;
    if (typeof e['content'] !== 'string') continue;
    out.push({ role: e['role'] as ChatMessage['role'], content: e['content'] });
  }
  return out;
}

function rowToConversation(row: any): CreatorConversation {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    model: row.model,
    systemPrompt: row.system_prompt ?? null,
    messages: coerceMessages(row.messages),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listConversations(
  userId: string,
): Promise<CreatorConversation[]> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `SELECT ${CONVO_COLUMNS}
       FROM agos_creator_conversations
      WHERE user_id = $1
      ORDER BY updated_at DESC`,
    [userId],
  );
  return r.rows.map(rowToConversation);
}

// ─── Get one ──────────────────────────────────────────────────────────────────

export async function getConversation(
  id: string,
  userId: string,
): Promise<CreatorConversation | null> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `SELECT ${CONVO_COLUMNS}
       FROM agos_creator_conversations
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToConversation(r.rows[0]);
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createConversation(
  input: CreateConversationInput,
  userId: string,
): Promise<CreatorConversation> {
  const pool = getCreatorPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_creator_conversations
       (id, user_id, title, model, system_prompt)
     VALUES ($1,$2,$3,$4,$5)`,
    [
      id,
      userId,
      input.title ?? 'New Conversation',
      input.model ?? 'claude-sonnet-4-6',
      input.systemPrompt ?? null,
    ],
  );

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.conversation.created',
    payload: { conversationId: id, title: input.title ?? 'New Conversation' },
  });

  const after = await getConversation(id, userId);
  if (!after) throw new Error('Failed to create conversation');
  return after;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export type UpdateConversationOutcome =
  | { kind: 'ok'; conversation: CreatorConversation }
  | { kind: 'not_found' };

export async function updateConversation(
  id: string,
  userId: string,
  patch: UpdateConversationInput,
): Promise<UpdateConversationOutcome> {
  const pool = getCreatorPool();
  const set: string[] = [];
  const params: any[] = [id, userId];
  let n = 2;

  if (patch.title !== undefined) {
    params.push(patch.title);
    n += 1;
    set.push(`title = $${n}`);
  }
  if (patch.model !== undefined) {
    params.push(patch.model);
    n += 1;
    set.push(`model = $${n}`);
  }
  if (patch.systemPrompt !== undefined) {
    params.push(patch.systemPrompt);
    n += 1;
    set.push(`system_prompt = $${n}`);
  }

  if (set.length === 0) {
    const current = await getConversation(id, userId);
    return current
      ? { kind: 'ok', conversation: current }
      : { kind: 'not_found' };
  }

  const r = await pool.query(
    `UPDATE agos_creator_conversations
        SET ${set.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    params,
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };

  const after = await getConversation(id, userId);
  if (!after) return { kind: 'not_found' };

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.conversation.updated',
    payload: { conversationId: id, fields: Object.keys(patch) },
  });

  return { kind: 'ok', conversation: after };
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteConversation(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `DELETE FROM agos_creator_conversations
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [id, userId],
  );

  const deleted = (r.rowCount ?? 0) > 0;
  if (deleted) {
    await recordAudit({
      pool,
      osSlug: 'creator',
      actorId: userId,
      action: 'creator.conversation.deleted',
      payload: { conversationId: id },
    });
  }

  return deleted;
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function appendMessage(
  id: string,
  userId: string,
  message: ChatMessage,
): Promise<CreatorConversation | null> {
  if (message.role !== 'user' && message.role !== 'assistant' && message.role !== 'system') {
    throw new Error(`Invalid message role: ${message.role}`);
  }
  if (typeof message.content !== 'string') {
    throw new Error('Message content must be a string');
  }

  const pool = getCreatorPool();
  const r = await pool.query(
    `UPDATE agos_creator_conversations
        SET messages   = messages || $3::jsonb,
            updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING ${CONVO_COLUMNS}`,
    [id, userId, JSON.stringify([message])],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToConversation(r.rows[0]);
}

export async function getMessages(
  id: string,
  userId: string,
): Promise<ChatMessage[]> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `SELECT messages
       FROM agos_creator_conversations
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return [];
  return coerceMessages(r.rows[0].messages);
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function autoTitle(message: string): string {
  const oneLine = (message ?? '').trim().replace(/\s+/g, ' ');
  if (!oneLine) return 'New Conversation';
  if (oneLine.length <= 60) return oneLine;
  return oneLine.slice(0, 59) + '…';
}

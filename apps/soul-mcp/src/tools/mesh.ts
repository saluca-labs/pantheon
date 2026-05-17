/**
 * tools/mesh.ts — Tool handlers for the `mesh_*` family.
 *
 * Mesh is a coordination layer for multiple AI sessions running across
 * a tailnet: each session heartbeats, sends/receives messages, claims
 * shared tasks. There is no upstream mesh backend in soul-svc today, so
 * this adapter is the system of record (SQLite-backed via store/db.ts).
 *
 * Stale-session policy: a session is considered stale after
 * MESH_STALE_AFTER_MS without a heartbeat. Stale sessions are NOT
 * deleted automatically (audit trail); they just stop counting toward
 * "active" and are excluded from `mesh_sessions` unless `include_stale`.
 */

import crypto from 'node:crypto';
import { z } from 'zod';
import type { DB } from '../store/db.js';

const MESH_STALE_AFTER_MS = Number(process.env.SOUL_MCP_MESH_STALE_MS ?? 5 * 60_000);

// ── Schemas ──────────────────────────────────────────────────────────────────

export const meshHeartbeatSchema = z.object({
  session_id: z.string(),
  node_id: z.string(),
  harness: z.enum(['claude-code', 'opencode', 'nanoclaw', 'picoclaw']),
  agent_id: z.string().default('alfred'),
  current_task: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const meshInboxSchema = z.object({
  session_id: z.string(),
});

export const meshMessageSchema = z.object({
  from_session_id: z.string(),
  to_session_id: z.string().optional(),
  to_node_id: z.string().optional(),
  message_type: z.enum(['task_update', 'query', 'response', 'broadcast', 'handoff']),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  subject: z.string(),
  body: z.record(z.unknown()),
});

export const meshSessionsSchema = z.object({
  agent: z.string().optional(),
  harness: z.string().optional(),
  node: z.string().optional(),
  include_stale: z.boolean().default(false),
});

export const meshTaskClaimSchema = z.object({
  task_id: z.string(),
  session_id: z.string(),
  node_id: z.string(),
});

export const meshTaskCompleteSchema = z.object({
  task_id: z.string(),
  session_id: z.string(),
  status: z.enum(['completed', 'failed']).default('completed'),
  result: z.record(z.unknown()).optional(),
});

export const meshTaskCreateSchema = z.object({
  from_session_id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  depends_on: z.array(z.string()).optional(),
});

export const meshTasksSchema = z.object({
  assigned: z.string().optional(),
  created_by: z.string().optional(),
  status: z.enum(['pending', 'claimed', 'in_progress', 'completed', 'failed']).optional(),
  limit: z.number().int().positive().max(200).default(50),
});

// ── Factory ──────────────────────────────────────────────────────────────────

export function buildMeshTools(db: DB) {
  const upsertHeartbeat = db.prepare(`
    INSERT INTO mesh_sessions
      (session_id, agent_id, node_id, harness, current_task, metadata, last_heartbeat, registered_at)
    VALUES
      (@session_id, @agent_id, @node_id, @harness, @current_task, @metadata, @now, @now)
    ON CONFLICT(session_id) DO UPDATE SET
      agent_id       = excluded.agent_id,
      node_id        = excluded.node_id,
      harness        = excluded.harness,
      current_task   = excluded.current_task,
      metadata       = excluded.metadata,
      last_heartbeat = excluded.last_heartbeat
  `);

  const countActive = db.prepare(`
    SELECT COUNT(*) as n FROM mesh_sessions WHERE last_heartbeat >= ?
  `);

  const selectSessions = db.prepare(`
    SELECT * FROM mesh_sessions ORDER BY last_heartbeat DESC LIMIT ?
  `);

  const insertMessage = db.prepare(`
    INSERT INTO mesh_messages
      (id, from_session_id, to_session_id, to_node_id, message_type, priority, subject, body, created_at)
    VALUES
      (@id, @from_session_id, @to_session_id, @to_node_id, @message_type, @priority, @subject, @body, @created_at)
  `);

  const inboxQuery = db.prepare(`
    SELECT * FROM mesh_messages
     WHERE (to_session_id = @session_id OR to_session_id IS NULL)
       AND read_at IS NULL
       AND from_session_id != @session_id
     ORDER BY priority = 'urgent' DESC,
              priority = 'high' DESC,
              priority = 'normal' DESC,
              created_at ASC
     LIMIT 200
  `);

  const markRead = db.prepare(`
    UPDATE mesh_messages SET read_at = @now WHERE id = @id
  `);

  const insertTask = db.prepare(`
    INSERT INTO mesh_tasks (task_id, title, description, created_by, depends_on, status, created_at)
    VALUES (@task_id, @title, @description, @created_by, @depends_on, 'pending', @created_at)
  `);

  const getTask = db.prepare(`SELECT * FROM mesh_tasks WHERE task_id = ?`);

  const claimTask = db.prepare(`
    UPDATE mesh_tasks
       SET assigned_to   = @session_id,
           assigned_node = @node_id,
           status        = 'claimed',
           claimed_at    = @now
     WHERE task_id       = @task_id
       AND status        = 'pending'
  `);

  const completeTask = db.prepare(`
    UPDATE mesh_tasks
       SET status        = @status,
           result        = @result,
           completed_at  = @now
     WHERE task_id       = @task_id
       AND assigned_to   = @session_id
       AND status IN ('claimed', 'in_progress')
  `);

  return {
    mesh_heartbeat(input: z.infer<typeof meshHeartbeatSchema>) {
      const args = meshHeartbeatSchema.parse(input);
      const now = Date.now();
      upsertHeartbeat.run({
        session_id: args.session_id,
        agent_id: args.agent_id,
        node_id: args.node_id,
        harness: args.harness,
        current_task: args.current_task ?? null,
        metadata: JSON.stringify(args.metadata ?? {}),
        now,
      });
      const cutoff = now - MESH_STALE_AFTER_MS;
      const activeRow = countActive.get(cutoff) as { n: number };
      return {
        session_id: args.session_id,
        node_id: args.node_id,
        heartbeat_at: now,
        mesh_active_sessions: activeRow.n,
        stale_after_ms: MESH_STALE_AFTER_MS,
        status: 'ok',
      };
    },

    mesh_inbox(input: z.infer<typeof meshInboxSchema>) {
      const args = meshInboxSchema.parse(input);
      const now = Date.now();
      const rows = inboxQuery.all({ session_id: args.session_id }) as Array<{
        id: string;
        from_session_id: string;
        to_session_id: string | null;
        to_node_id: string | null;
        message_type: string;
        priority: string;
        subject: string;
        body: string;
        created_at: number;
      }>;
      const tx = db.transaction(() => {
        for (const r of rows) markRead.run({ id: r.id, now });
      });
      tx();
      return {
        session_id: args.session_id,
        count: rows.length,
        messages: rows.map((r) => ({
          id: r.id,
          from_session_id: r.from_session_id,
          to_session_id: r.to_session_id,
          to_node_id: r.to_node_id,
          message_type: r.message_type,
          priority: r.priority,
          subject: r.subject,
          body: JSON.parse(r.body),
          created_at: r.created_at,
        })),
      };
    },

    mesh_message(input: z.infer<typeof meshMessageSchema>) {
      const args = meshMessageSchema.parse(input);
      const id = crypto.randomUUID();
      const now = Date.now();
      insertMessage.run({
        id,
        from_session_id: args.from_session_id,
        to_session_id: args.to_session_id ?? null,
        to_node_id: args.to_node_id ?? null,
        message_type: args.message_type,
        priority: args.priority,
        subject: args.subject,
        body: JSON.stringify(args.body),
        created_at: now,
      });
      return {
        message_id: id,
        from_session_id: args.from_session_id,
        to_session_id: args.to_session_id ?? null,
        broadcast: args.to_session_id === undefined,
        created_at: now,
      };
    },

    mesh_sessions(input: z.infer<typeof meshSessionsSchema>) {
      const args = meshSessionsSchema.parse(input);
      const now = Date.now();
      const cutoff = now - MESH_STALE_AFTER_MS;
      const rows = (selectSessions.all(500) as Array<Record<string, unknown>>)
        .filter((r) => (args.include_stale ? true : (r.last_heartbeat as number) >= cutoff))
        .filter((r) => (args.agent ? r.agent_id === args.agent : true))
        .filter((r) => (args.harness ? r.harness === args.harness : true))
        .filter((r) => (args.node ? r.node_id === args.node : true))
        .map((r) => ({
          session_id: r.session_id,
          agent_id: r.agent_id,
          node_id: r.node_id,
          harness: r.harness,
          current_task: r.current_task,
          metadata: JSON.parse((r.metadata as string) || '{}'),
          last_heartbeat: r.last_heartbeat,
          registered_at: r.registered_at,
          stale: (r.last_heartbeat as number) < cutoff,
        }));
      return { count: rows.length, sessions: rows };
    },

    mesh_task_create(input: z.infer<typeof meshTaskCreateSchema>) {
      const args = meshTaskCreateSchema.parse(input);
      const id = crypto.randomUUID();
      const now = Date.now();
      insertTask.run({
        task_id: id,
        title: args.title,
        description: args.description ?? null,
        created_by: args.from_session_id,
        depends_on: JSON.stringify(args.depends_on ?? []),
        created_at: now,
      });
      return {
        task_id: id,
        title: args.title,
        created_by: args.from_session_id,
        status: 'pending',
        created_at: now,
      };
    },

    mesh_task_claim(input: z.infer<typeof meshTaskClaimSchema>): {
      task_id: string;
      claimed: boolean;
      status: string;
      assigned_to?: string;
      assigned_node?: string;
      claimed_at?: number;
      reason?: string;
    } {
      const args = meshTaskClaimSchema.parse(input);
      const now = Date.now();
      const info = claimTask.run({
        task_id: args.task_id,
        session_id: args.session_id,
        node_id: args.node_id,
        now,
      });
      if (info.changes === 0) {
        const row = getTask.get(args.task_id) as Record<string, unknown> | undefined;
        return {
          task_id: args.task_id,
          claimed: false,
          status: (row?.status as string) ?? 'unknown',
          reason: row ? 'already_claimed_or_completed' : 'not_found',
        };
      }
      return {
        task_id: args.task_id,
        claimed: true,
        status: 'claimed',
        assigned_to: args.session_id,
        assigned_node: args.node_id,
        claimed_at: now,
      };
    },

    mesh_task_complete(input: z.infer<typeof meshTaskCompleteSchema>): {
      task_id: string;
      completed: boolean;
      status: string;
      completed_at?: number;
      reason?: string;
    } {
      const args = meshTaskCompleteSchema.parse(input);
      const now = Date.now();
      const info = completeTask.run({
        task_id: args.task_id,
        session_id: args.session_id,
        status: args.status,
        result: JSON.stringify(args.result ?? {}),
        now,
      });
      if (info.changes === 0) {
        const row = getTask.get(args.task_id) as Record<string, unknown> | undefined;
        return {
          task_id: args.task_id,
          completed: false,
          status: (row?.status as string) ?? 'unknown',
          reason: row
            ? 'not_assigned_to_caller_or_wrong_state'
            : 'not_found',
        };
      }
      return {
        task_id: args.task_id,
        completed: true,
        status: args.status,
        completed_at: now,
      };
    },

    mesh_tasks(input: z.infer<typeof meshTasksSchema>) {
      const args = meshTasksSchema.parse(input);
      // Build the query dynamically to keep the SQL readable.
      const where: string[] = [];
      const params: Record<string, unknown> = { limit: args.limit };
      if (args.assigned) {
        where.push('assigned_to = @assigned');
        params.assigned = args.assigned;
      }
      if (args.created_by) {
        where.push('created_by = @created_by');
        params.created_by = args.created_by;
      }
      if (args.status) {
        where.push('status = @status');
        params.status = args.status;
      }
      const sql = `
        SELECT * FROM mesh_tasks
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY created_at DESC
         LIMIT @limit
      `;
      const rows = (db.prepare(sql).all(params) as Array<Record<string, unknown>>).map((r) => ({
        task_id: r.task_id,
        title: r.title,
        description: r.description,
        created_by: r.created_by,
        assigned_to: r.assigned_to,
        assigned_node: r.assigned_node,
        depends_on: JSON.parse((r.depends_on as string) || '[]'),
        status: r.status,
        result: r.result ? JSON.parse(r.result as string) : null,
        created_at: r.created_at,
        claimed_at: r.claimed_at,
        completed_at: r.completed_at,
      }));
      return { count: rows.length, tasks: rows };
    },
  };
}

export type MeshTools = ReturnType<typeof buildMeshTools>;

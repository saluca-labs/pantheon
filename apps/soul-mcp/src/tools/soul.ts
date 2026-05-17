/**
 * tools/soul.ts — Tool handlers for the `soul_*` family.
 *
 * Storage split:
 *   - soul_memory_write, soul_memory_search, soul_topics_lookup,
 *     soul_topics_top → soul-service HTTP (real upstream).
 *   - soul_session_init, soul_session_load, soul_session_close,
 *     soul_cot_flush, soul_transcript_capture → local SQLite. These don't
 *     have an upstream backend in soul-svc today; the adapter is the
 *     system of record until upstream gains them.
 *
 * Each handler returns a plain JSON-friendly object that BOTH the MCP
 * server and the HTTP server can wrap (the MCP server JSON-encodes into
 * a text content block; the HTTP server returns it as-is).
 */

import crypto from 'node:crypto';
import { z } from 'zod';
import type { DB } from '../store/db.js';
import type { SoulClient, MemoryRecord } from '../soul-client.js';

const DEFAULT_SESSION_ID = 'alfred-main';
const DEFAULT_AGENT_ID = 'alfred';

// ── Input schemas (single source of truth — MCP + HTTP both consume) ─────────

export const sessionInitSchema = z.object({
  session_id: z.string().default(DEFAULT_SESSION_ID),
  node_id: z.string().optional(),
  harness: z.enum(['claude-code', 'opencode', 'nanoclaw', 'picoclaw']).optional(),
  persona: z.string().optional(),
});

export const sessionLoadSchema = z.object({
  session_id: z.string().default(DEFAULT_SESSION_ID),
});

export const sessionCloseSchema = z.object({
  session_id: z.string().default(DEFAULT_SESSION_ID),
  agent_id: z.string().default(DEFAULT_AGENT_ID),
  summary: z.string(),
});

export const memoryWriteSchema = z.object({
  session_id: z.string().default(DEFAULT_SESSION_ID),
  content: z.string(),
  topics: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const memorySearchSchema = z.object({
  query: z.string(),
  session_id: z.string().optional(),
  limit: z.number().int().positive().max(200).default(10),
  // hyde, rerank, decay are accepted for forward compat with the upstream
  // tool surface but ignored today — soul-service does not expose a
  // semantic search endpoint yet (only TKHR keyword routing).
  hyde: z.boolean().optional(),
  rerank: z.boolean().optional(),
  decay: z.boolean().optional(),
});

export const topicsLookupSchema = z.object({
  topics: z.array(z.string()).min(1),
});

export const topicsTopSchema = z.object({
  limit: z.number().int().positive().max(200).default(20),
});

export const cotFlushSchema = z.object({
  session_id: z.string().default(DEFAULT_SESSION_ID),
  agent_id: z.string().default(DEFAULT_AGENT_ID),
  node_id: z.string().optional(),
  harness: z.enum(['claude-code', 'opencode', 'nanoclaw', 'picoclaw']).optional(),
  thoughts: z.array(z.string()).min(1),
});

export const transcriptCaptureSchema = z.object({
  session_id: z.string(),
  agent_id: z.string().default(DEFAULT_AGENT_ID),
  interactor_id: z.string().default('unknown'),
  summary: z.string().optional(),
  turns: z
    .array(
      z.object({
        role: z.string(),
        content: z.string(),
        timestamp: z.string().optional(),
      }),
    )
    .optional(),
  jsonl_content: z.string().optional(),
  cot_content: z.string().optional(),
});

// ── Handler factory ──────────────────────────────────────────────────────────

export interface SoulToolDeps {
  db: DB;
  soul: SoulClient;
}

export function buildSoulTools(deps: SoulToolDeps) {
  const { db, soul } = deps;

  const upsertSession = db.prepare(`
    INSERT INTO soul_sessions
      (session_id, agent_id, node_id, harness, persona, opened_at, metadata)
    VALUES
      (@session_id, @agent_id, @node_id, @harness, @persona, @opened_at, @metadata)
    ON CONFLICT(session_id) DO UPDATE SET
      node_id   = COALESCE(excluded.node_id,   soul_sessions.node_id),
      harness   = COALESCE(excluded.harness,   soul_sessions.harness),
      persona   = COALESCE(excluded.persona,   soul_sessions.persona)
  `);

  const closeSession = db.prepare(`
    UPDATE soul_sessions
       SET closed_at    = @closed_at,
           context_root = @context_root
     WHERE session_id   = @session_id
  `);

  const getSession = db.prepare(`SELECT * FROM soul_sessions WHERE session_id = ?`);

  const insertCot = db.prepare(`
    INSERT INTO soul_cot (session_id, agent_id, node_id, harness, thought, recorded_at)
    VALUES (@session_id, @agent_id, @node_id, @harness, @thought, @recorded_at)
  `);

  const takeCot = db.prepare(`
    SELECT thought, recorded_at FROM soul_cot
     WHERE session_id = ?
     ORDER BY recorded_at ASC
  `);
  const deleteCot = db.prepare(`DELETE FROM soul_cot WHERE session_id = ?`);

  const insertTranscript = db.prepare(`
    INSERT INTO soul_transcripts
      (session_id, agent_id, interactor_id, summary, payload, payload_hash, captured_at)
    VALUES
      (@session_id, @agent_id, @interactor_id, @summary, @payload, @payload_hash, @captured_at)
  `);

  return {
    async soul_session_init(input: z.infer<typeof sessionInitSchema>) {
      const args = sessionInitSchema.parse(input);
      const now = Date.now();
      upsertSession.run({
        session_id: args.session_id,
        agent_id: DEFAULT_AGENT_ID,
        node_id: args.node_id ?? null,
        harness: args.harness ?? null,
        persona: args.persona ?? null,
        opened_at: now,
        metadata: '{}',
      });
      // Best-effort warm-up of soul-service hot tier for this session
      // (read returns whatever already exists in Tier 0/1/2).
      let recent: MemoryRecord[] = [];
      try {
        const out = await soul.readMemory(args.session_id, 20);
        recent = out.memories ?? [];
      } catch {
        // soul-service unreachable — return what we can; the caller decides.
      }
      const row = getSession.get(args.session_id) as Record<string, unknown> | undefined;
      return {
        session_id: args.session_id,
        opened_at: row?.opened_at ?? now,
        node_id: args.node_id ?? null,
        harness: args.harness ?? null,
        persona: args.persona ?? null,
        recent_memory_count: recent.length,
        recent_memory_ids: recent.map((m) => m.id),
        soul_service_healthy: await soul.healthy(),
      };
    },

    async soul_session_load(input: z.infer<typeof sessionLoadSchema>) {
      const args = sessionLoadSchema.parse(input);
      const row = getSession.get(args.session_id) as Record<string, unknown> | undefined;
      if (!row) {
        return { session_id: args.session_id, exists: false, recent: [] };
      }
      let recent: MemoryRecord[] = [];
      try {
        const out = await soul.readMemory(args.session_id, 50);
        recent = out.memories ?? [];
      } catch {
        // ignored — see soul_session_init
      }
      return {
        session_id: args.session_id,
        exists: true,
        opened_at: row.opened_at,
        closed_at: row.closed_at,
        context_root: row.context_root,
        node_id: row.node_id,
        harness: row.harness,
        persona: row.persona,
        recent_memory_count: recent.length,
        memories: recent,
      };
    },

    soul_session_close(input: z.infer<typeof sessionCloseSchema>) {
      const args = sessionCloseSchema.parse(input);
      const row = getSession.get(args.session_id) as Record<string, unknown> | undefined;
      const priorRoot = (row?.context_root as string | null) ?? '';
      // Hash chain: H(prior_root || session_id || summary || now)
      const now = Date.now();
      const newRoot = crypto
        .createHash('sha256')
        .update(`${priorRoot}|${args.session_id}|${args.summary}|${now}`)
        .digest('hex');
      closeSession.run({
        session_id: args.session_id,
        closed_at: now,
        context_root: newRoot,
      });
      return {
        session_id: args.session_id,
        closed_at: now,
        prior_root: priorRoot || null,
        root_hash: newRoot,
        summary: args.summary,
      };
    },

    async soul_memory_write(input: z.infer<typeof memoryWriteSchema>) {
      const args = memoryWriteSchema.parse(input);
      const out = await soul.writeMemory({
        session_id: args.session_id,
        content: args.content,
        topics: args.topics ?? [],
        metadata: args.metadata ?? {},
      });
      return {
        session_id: args.session_id,
        memory_id: out.memory_id,
        topics: args.topics ?? [],
      };
    },

    async soul_memory_search(input: z.infer<typeof memorySearchSchema>) {
      const args = memorySearchSchema.parse(input);
      // soul-service has no full-text / vector search yet. Best-effort
      // surrogate: treat the query as a single TKHR topic and union with
      // recent memories from the session. Records the upstream-gap so a
      // future migration to a real /memory/search endpoint is trivial.
      const lookup = await soul.tkhrLookup([args.query.toLowerCase()]);
      let memories: MemoryRecord[] = [];
      if (args.session_id) {
        try {
          const recent = await soul.readMemory(args.session_id, args.limit);
          memories = recent.memories ?? [];
        } catch {
          memories = [];
        }
      }
      return {
        query: args.query,
        upstream_endpoint: 'tkhr-keyword-surrogate',
        notes: 'soul-service does not yet expose /memory/search; results are TKHR keyword hits plus the session\'s recent memories. Switch to /memory/search once upstream ships it.',
        topic_hit_ids: lookup.memory_ids ?? [],
        recent_memories: memories.slice(0, args.limit),
      };
    },

    async soul_topics_lookup(input: z.infer<typeof topicsLookupSchema>) {
      const args = topicsLookupSchema.parse(input);
      const out = await soul.tkhrLookup(args.topics);
      return { topics: args.topics, memory_ids: out.memory_ids ?? [], count: out.count ?? 0 };
    },

    async soul_topics_top(input: z.infer<typeof topicsTopSchema>) {
      const args = topicsTopSchema.parse(input);
      const out = await soul.tkhrTop(args.limit);
      return { limit: args.limit, topics: out.topics ?? [] };
    },

    soul_cot_flush(input: z.infer<typeof cotFlushSchema>) {
      const args = cotFlushSchema.parse(input);
      const now = Date.now();
      const tx = db.transaction((rows: typeof args.thoughts) => {
        for (const t of rows) {
          insertCot.run({
            session_id: args.session_id,
            agent_id: args.agent_id,
            node_id: args.node_id ?? null,
            harness: args.harness ?? null,
            thought: t,
            recorded_at: now,
          });
        }
      });
      tx(args.thoughts);
      return {
        session_id: args.session_id,
        buffered: args.thoughts.length,
        recorded_at: now,
      };
    },

    soul_transcript_capture(input: z.infer<typeof transcriptCaptureSchema>) {
      const args = transcriptCaptureSchema.parse(input);
      // Drain any server-buffered CoT for this session and bundle into the
      // payload, then delete it (lossless transcript becomes the system of
      // record). The drain is in-transaction with the insert so a crash
      // mid-write does not lose thoughts.
      const drainAndInsert = db.transaction(() => {
        const buffered = takeCot.all(args.session_id) as Array<{ thought: string; recorded_at: number }>;
        deleteCot.run(args.session_id);
        const payloadObj = {
          session_id: args.session_id,
          summary: args.summary ?? '',
          turns: args.turns ?? null,
          jsonl_excerpt: args.jsonl_content ? args.jsonl_content.slice(0, 100_000) : null,
          cot_external: args.cot_content ?? null,
          cot_buffered: buffered,
        };
        const payload = JSON.stringify(payloadObj);
        const hash = crypto.createHash('sha256').update(payload).digest('hex');
        const now = Date.now();
        const info = insertTranscript.run({
          session_id: args.session_id,
          agent_id: args.agent_id,
          interactor_id: args.interactor_id,
          summary: args.summary ?? null,
          payload,
          payload_hash: hash,
          captured_at: now,
        });
        return {
          transcript_id: info.lastInsertRowid as number,
          payload_hash: hash,
          captured_at: now,
          buffered_cot_drained: buffered.length,
        };
      });
      return drainAndInsert();
    },
  };
}

export type SoulTools = ReturnType<typeof buildSoulTools>;

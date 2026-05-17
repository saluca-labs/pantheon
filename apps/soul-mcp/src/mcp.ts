/**
 * mcp.ts — Register every soul/mesh/nexus tool with the MCP server.
 *
 * The tool handlers in tools/*.ts are transport-agnostic. This file wraps
 * them in the MCP protocol contract (input schema → output content array
 * of text blocks) so a stdio-attached LLM harness can call them.
 *
 * Every tool returns its JSON-encoded result as a single text block; the
 * caller (Claude Code, opencode, etc.) parses the text back into structured
 * data. This is the conventional MCP pattern — see modelcontextprotocol.io.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from './zod-to-json-schema.js';
import type { SoulTools } from './tools/soul.js';
import type { MeshTools } from './tools/mesh.js';
import type { NexusTools } from './tools/nexus.js';
import * as soulSchemas from './tools/soul.js';
import * as meshSchemas from './tools/mesh.js';
import * as nexusSchemas from './tools/nexus.js';

export interface AllTools {
  soul: SoulTools;
  mesh: MeshTools;
  nexus: NexusTools;
}

interface ToolRegistration {
  name: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (input: any) => unknown | Promise<unknown>;
}

export function buildToolRegistry(tools: AllTools): ToolRegistration[] {
  return [
    // ── Soul ────────────────────────────────────────────────────────────────
    {
      name: 'soul_session_init',
      description:
        'Initialize or resume a Soul memory session. Call at the start of a conversation to load context. Returns recent memory references and backend health.',
      inputSchema: zodToJsonSchema(soulSchemas.sessionInitSchema),
      handler: (i) => tools.soul.soul_session_init(i),
    },
    {
      name: 'soul_session_load',
      description:
        'Load the current context payload for a session. Use this mid-conversation to refresh context or after a long gap.',
      inputSchema: zodToJsonSchema(soulSchemas.sessionLoadSchema),
      handler: (i) => tools.soul.soul_session_load(i),
    },
    {
      name: 'soul_session_close',
      description:
        'Close the agent context hash chain for this session. Call at session end to maintain cryptographic continuity. Returns the new root hash.',
      inputSchema: zodToJsonSchema(soulSchemas.sessionCloseSchema),
      handler: (i) => tools.soul.soul_session_close(i),
    },
    {
      name: 'soul_memory_write',
      description:
        "Write a memory to the user's Soul graph. Call after significant exchanges or facts worth remembering.",
      inputSchema: zodToJsonSchema(soulSchemas.memoryWriteSchema),
      handler: (i) => tools.soul.soul_memory_write(i),
    },
    {
      name: 'soul_memory_search',
      description:
        'Search memories. Today this is a TKHR keyword surrogate plus the session\'s recent memories; switches to a real hybrid search once upstream ships /memory/search.',
      inputSchema: zodToJsonSchema(soulSchemas.memorySearchSchema),
      handler: (i) => tools.soul.soul_memory_search(i),
    },
    {
      name: 'soul_topics_lookup',
      description:
        'Look up memory IDs by topic keywords using the TKHR (Topic-Keyed Hash Ring) index.',
      inputSchema: zodToJsonSchema(soulSchemas.topicsLookupSchema),
      handler: (i) => tools.soul.soul_topics_lookup(i),
    },
    {
      name: 'soul_topics_top',
      description:
        "Get the top topics by weight from the user's memory graph. Use at session start to understand recent focus.",
      inputSchema: zodToJsonSchema(soulSchemas.topicsTopSchema),
      handler: (i) => tools.soul.soul_topics_top(i),
    },
    {
      name: 'soul_cot_flush',
      description:
        'Flush chain-of-thought (thinking) blocks to the server-side buffer. Useful in read-only environments.',
      inputSchema: zodToJsonSchema(soulSchemas.cotFlushSchema),
      handler: (i) => tools.soul.soul_cot_flush(i),
    },
    {
      name: 'soul_transcript_capture',
      description:
        'Capture a session transcript to the lossless store. Drains any server-buffered CoT and computes a SHA-256 integrity hash.',
      inputSchema: zodToJsonSchema(soulSchemas.transcriptCaptureSchema),
      handler: (i) => tools.soul.soul_transcript_capture(i),
    },

    // ── Mesh ────────────────────────────────────────────────────────────────
    {
      name: 'mesh_heartbeat',
      description:
        'Register or refresh this session on the mesh. Call at session start and periodically to stay visible to other nodes.',
      inputSchema: zodToJsonSchema(meshSchemas.meshHeartbeatSchema),
      handler: (i) => tools.mesh.mesh_heartbeat(i),
    },
    {
      name: 'mesh_inbox',
      description:
        'Read unread messages for a session. Side-effecting: returned messages are marked as read.',
      inputSchema: zodToJsonSchema(meshSchemas.meshInboxSchema),
      handler: (i) => tools.mesh.mesh_inbox(i),
    },
    {
      name: 'mesh_message',
      description:
        'Send a message to another session or broadcast (omit to_session_id) to all active sessions.',
      inputSchema: zodToJsonSchema(meshSchemas.meshMessageSchema),
      handler: (i) => tools.mesh.mesh_message(i),
    },
    {
      name: 'mesh_sessions',
      description:
        'List active sessions across the mesh. Stale sessions hidden by default.',
      inputSchema: zodToJsonSchema(meshSchemas.meshSessionsSchema),
      handler: (i) => tools.mesh.mesh_sessions(i),
    },
    {
      name: 'mesh_task_create',
      description: 'Create a task that can be claimed by any session on the mesh.',
      inputSchema: zodToJsonSchema(meshSchemas.meshTaskCreateSchema),
      handler: (i) => tools.mesh.mesh_task_create(i),
    },
    {
      name: 'mesh_task_claim',
      description:
        'Atomically claim a pending task. Returns claimed=false with a reason if already taken.',
      inputSchema: zodToJsonSchema(meshSchemas.meshTaskClaimSchema),
      handler: (i) => tools.mesh.mesh_task_claim(i),
    },
    {
      name: 'mesh_task_complete',
      description:
        'Mark a claimed task as completed or failed. Only the assigned session can complete its own tasks.',
      inputSchema: zodToJsonSchema(meshSchemas.meshTaskCompleteSchema),
      handler: (i) => tools.mesh.mesh_task_complete(i),
    },
    {
      name: 'mesh_tasks',
      description: 'List tasks on the mesh with optional filters.',
      inputSchema: zodToJsonSchema(meshSchemas.meshTasksSchema),
      handler: (i) => tools.mesh.mesh_tasks(i),
    },

    // ── Nexus ───────────────────────────────────────────────────────────────
    {
      name: 'nexus_nodes',
      description:
        'List all nodes on the mesh with hardware info, roles, and status.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      handler: () => tools.nexus.nexus_nodes(),
    },
    {
      name: 'nexus_services',
      description: 'List all running services across the mesh. Optionally filter by node.',
      inputSchema: zodToJsonSchema(nexusSchemas.nexusServicesSchema),
      handler: (i) => tools.nexus.nexus_services(i),
    },
    {
      name: 'nexus_gsd',
      description: 'List all projects with active GSD (Get Stuff Done) tracking.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      handler: () => tools.nexus.nexus_gsd(),
    },
    {
      name: 'nexus_where',
      description: 'Find which mesh nodes have a project (exact match then fuzzy).',
      inputSchema: zodToJsonSchema(nexusSchemas.nexusWhereSchema),
      handler: (i) => tools.nexus.nexus_where(i),
    },
    {
      name: 'nexus_context',
      description:
        'Get full live context for one or all nodes (hardware, services, projects). The deep-dive read.',
      inputSchema: zodToJsonSchema(nexusSchemas.nexusContextSchema),
      handler: (i) => tools.nexus.nexus_context(i),
    },
    {
      name: 'nexus_status',
      description:
        'Mesh summary: nodes online/stale, total projects, GSD projects, services running.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      handler: () => tools.nexus.nexus_status(),
    },
  ];
}

export function buildMcpServer(tools: AllTools): { server: Server; registry: ToolRegistration[] } {
  const registry = buildToolRegistry(tools);
  const server = new Server(
    { name: 'soul-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: registry.map<Tool>((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const reg = registry.find((t) => t.name === req.params.name);
    if (!reg) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }],
      };
    }
    try {
      const result = await reg.handler(req.params.arguments ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: 'text', text: `${reg.name} failed: ${msg}` }],
      };
    }
  });

  return { server, registry };
}

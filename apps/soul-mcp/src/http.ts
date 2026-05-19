/**
 * http.ts — Fastify HTTP surface for the soul-mcp adapter.
 *
 * Two surfaces on one port:
 *   1. REST  — every MCP tool mirrored as POST /api/tools/<name>, plus the
 *              catalog-feed and session-init helpers. Auth: X-Soul-Service-Key
 *              header (legacy in-cluster shape; pre-dates Bearer support).
 *   2. MCP   — Streamable HTTP transport at POST /mcp. Standards-compliant
 *              MCP-over-HTTP for remote clients (Anthropic Claude Connectors,
 *              Perplexity Comet, etc.). Auth: Authorization: Bearer <key>.
 *
 * Both surfaces validate against the same SOUL_SERVICE_KEY. Bearer is also
 * accepted on REST endpoints so a single header convention works everywhere
 * for new callers; X-Soul-Service-Key is retained for backwards compat.
 *
 *   GET    /health/live
 *   GET    /health/ready                (verifies soul-service reachable)
 *
 *   POST   /mcp                         MCP Streamable HTTP (stateless mode)
 *
 *   POST   /api/tools/<tool_name>       JSON body matching the tool's schema
 *   GET    /api/tools                   list available tools (debug aid)
 *
 *   POST   /api/nexus/nodes/upsert      catalog feed (node-scanner)
 *   POST   /api/nexus/services/upsert   catalog feed (node-scanner)
 *   POST   /api/nexus/projects/upsert   catalog feed (node-scanner)
 *
 *   POST   /api/session/init            convenience: invokes soul_session_init
 *                                       (called by the startup hook too)
 *
 * Errors:
 *   - 400 on Zod validation failures (handler-thrown ZodError)
 *   - 401 if SOUL_SERVICE_KEY is set in env and auth header missing/wrong
 *   - 502 if a soul_* tool call fails because soul-service is unreachable
 *   - 500 on any other unhandled exception
 */

import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { SoulServiceError, type SoulClient } from './soul-client.js';
import type { AllTools } from './mcp.js';
import { buildToolRegistry, buildMcpServer } from './mcp.js';
import {
  nodeUpsertSchema,
  serviceUpsertSchema,
  projectUpsertSchema,
} from './tools/nexus.js';
import { sessionInitSchema } from './tools/soul.js';

const HEALTH_PATHS = new Set(['/health/live', '/health/ready']);

export interface HttpOptions {
  tools: AllTools;
  soul: SoulClient;
  serviceKey?: string;
  logger?: boolean;
}

export async function buildHttp(opts: HttpOptions): Promise<FastifyInstance> {
  const { tools, soul } = opts;
  const apiKey = opts.serviceKey ?? process.env.SOUL_SERVICE_KEY ?? '';

  const app = Fastify({ logger: opts.logger ?? true });

  // Shared-secret auth — opt-in. When SOUL_SERVICE_KEY (or opts.serviceKey)
  // is set, every non-health request must present a matching
  // X-Soul-Service-Key header or it is rejected with 401. When unset, the
  // adapter accepts every request — matches the soul-service fail-open
  // posture so the pod is deploy-able before the Secret Manager key
  // exists (see apps/soul-service/pantheon_entry.py).
  app.addHook('onRequest', async (req, reply) => {
    const [pathOnly] = req.url.split('?');
    if (HEALTH_PATHS.has(pathOnly ?? req.url)) return;
    if (!apiKey) return;

    // Accept either the legacy X-Soul-Service-Key header (REST callers) or a
    // standard Authorization: Bearer <key> (MCP remote clients like Comet,
    // Claude Connectors). Same key validates both shapes.
    const xKey = req.headers['x-soul-service-key'];
    const authz = req.headers['authorization'];
    let bearerKey: string | undefined;
    if (typeof authz === 'string' && authz.startsWith('Bearer ')) {
      bearerKey = authz.slice('Bearer '.length).trim();
    }
    if (xKey !== apiKey && bearerKey !== apiKey) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_req, reply) => {
    const ok = await soul.healthy();
    if (!ok) {
      reply.code(503);
      return { status: 'degraded', soul_service: false };
    }
    return { status: 'ready', soul_service: true };
  });

  // ── MCP Streamable HTTP transport ───────────────────────────────────────────
  // Stateful per-session mode. The MCP protocol REQUIRES initialize handshake
  // state to persist across requests in the same session — the first POST
  // sends `initialize`, subsequent POSTs (tools/list, tools/call) must hit a
  // server that knows it's been initialized. A stateless mode (fresh server
  // per request) breaks this: every non-initialize request gets a 400
  // "Server not initialized" because the fresh server hasn't received
  // initialize yet.
  //
  // Implementation: a module-scoped Map<sessionId, transport>. New session on
  // POST initialize (returns Mcp-Session-Id header). Subsequent POSTs route
  // by Mcp-Session-Id. GET supports server-initiated SSE notifications (we
  // don't emit any yet but the SDK requires the route). DELETE closes a
  // session and frees memory.
  //
  // Memory boundedness: each session holds one Server + one Transport, both
  // lightweight (~kilobytes). transport.onclose deletes from the map on
  // session close. Single-replica deployment so no cross-pod session affinity
  // needed — when soul-mcp eventually scales out, this needs Redis-backed
  // session sharing (or sticky sessions at the LB).
  //
  // Auth: SOUL_SERVICE_KEY via Authorization: Bearer (new) or
  // X-Soul-Service-Key (legacy), enforced by the onRequest hook above.
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  app.post('/mcp', async (req, reply) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New session: SDK generates the session id during handleRequest and
      // fires onsessioninitialized once it's set on the transport.
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (sid: string) => {
          transports[sid] = transport;
        },
      });
      // SDK Transport interface declares onclose as required () => void; we
      // cast through unknown when calling .connect to bridge the optional-vs-
      // required asymmetry from exactOptionalPropertyTypes. The runtime
      // contract is the same.
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) delete transports[sid];
      };
      const { server } = buildMcpServer(tools);
      type SdkTransport = Parameters<typeof server.connect>[0];
      await server.connect(transport as unknown as SdkTransport);
    } else {
      reply.code(400).send({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: sessionId
            ? `Unknown session id: ${sessionId}`
            : 'Bad Request: missing Mcp-Session-Id and body is not an initialize request',
        },
        id: null,
      });
      return;
    }

    try {
      await transport.handleRequest(req.raw, reply.raw, req.body as unknown);
      reply.hijack();
    } catch (err) {
      req.log.error({ err }, 'mcp.streamableHttp handler failed');
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
        reply.raw.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal error' },
            id: null,
          }),
        );
      }
    }
  });

  // GET /mcp: server-to-client SSE for notifications (none today, but the SDK
  // protocol requires the route).
  // DELETE /mcp: explicit session close — frees transport + server immediately
  // rather than waiting for onclose via timeout/disconnect.
  const handleSessionRequest = async (req: FastifyRequest, reply: FastifyReply) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      reply.code(400).send({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Invalid or missing Mcp-Session-Id' },
        id: null,
      });
      return;
    }
    const transport = transports[sessionId];
    try {
      await transport.handleRequest(req.raw, reply.raw);
      reply.hijack();
    } catch (err) {
      req.log.error({ err }, 'mcp.streamableHttp session handler failed');
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
        reply.raw.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal error' },
            id: null,
          }),
        );
      }
    }
  };
  app.get('/mcp', handleSessionRequest);
  app.delete('/mcp', handleSessionRequest);

  // ── Generic tool surface ───────────────────────────────────────────────────

  const registry = buildToolRegistry(tools);
  app.get('/api/tools', async () => ({
    count: registry.length,
    tools: registry.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    })),
  }));

  for (const tool of registry) {
    app.post(`/api/tools/${tool.name}`, async (req, reply) => {
      try {
        const result = await tool.handler(req.body ?? {});
        return result;
      } catch (err) {
        if (err instanceof ZodError) {
          reply.code(400);
          return { error: 'ValidationError', details: err.issues };
        }
        if (err instanceof SoulServiceError) {
          reply.code(502);
          return {
            error: 'SoulServiceError',
            status: err.status,
            message: err.message,
            body: err.body.slice(0, 1024),
          };
        }
        req.log.error({ err, tool: tool.name }, 'tool handler failed');
        reply.code(500);
        return { error: 'InternalError', message: err instanceof Error ? err.message : String(err) };
      }
    });
  }

  // ── Catalog feed (Nexus) ──────────────────────────────────────────────────

  app.post('/api/nexus/nodes/upsert', async (req, reply) => {
    try {
      return tools.nexus.upsertNode(nodeUpsertSchema.parse(req.body));
    } catch (err) {
      if (err instanceof ZodError) {
        reply.code(400);
        return { error: 'ValidationError', details: err.issues };
      }
      throw err;
    }
  });

  app.post('/api/nexus/services/upsert', async (req, reply) => {
    try {
      return tools.nexus.upsertService(serviceUpsertSchema.parse(req.body));
    } catch (err) {
      if (err instanceof ZodError) {
        reply.code(400);
        return { error: 'ValidationError', details: err.issues };
      }
      throw err;
    }
  });

  app.post('/api/nexus/projects/upsert', async (req, reply) => {
    try {
      return tools.nexus.upsertProject(projectUpsertSchema.parse(req.body));
    } catch (err) {
      if (err instanceof ZodError) {
        reply.code(400);
        return { error: 'ValidationError', details: err.issues };
      }
      throw err;
    }
  });

  // ── Convenience: session init (also the startup-hook target) ──────────────

  app.post('/api/session/init', async (req, reply) => {
    try {
      return await tools.soul.soul_session_init(sessionInitSchema.parse(req.body ?? {}));
    } catch (err) {
      if (err instanceof ZodError) {
        reply.code(400);
        return { error: 'ValidationError', details: err.issues };
      }
      throw err;
    }
  });

  return app;
}

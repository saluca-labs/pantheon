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

import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
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
  // Stateless mode: a fresh Server + Transport is constructed per request, so
  // we never accumulate dangling sessions and the endpoint scales trivially.
  // This trades the ability to push server-initiated notifications mid-session
  // for operational simplicity — soul-mcp tools are all request/response, no
  // streaming notifications today, so stateless is the right fit.
  //
  // Comet, Claude Connectors, and other remote MCP clients hit POST /mcp with
  // an Authorization: Bearer <SOUL_SERVICE_KEY> header (gated by the
  // onRequest hook above). GET / DELETE return 405 — they're reserved for
  // session-bound transports.
  app.post('/mcp', async (req, reply) => {
    // Fresh sessionIdGenerator on every request → effectively stateless: each
    // POST creates a new server + transport, the SDK assigns a session-id that
    // we never persist, and the next POST starts clean. enableJsonResponse
    // tells the transport to return a single JSON response (no SSE stream)
    // since soul-mcp tools don't push server-initiated notifications.
    const { randomUUID } = await import('node:crypto');
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
    });
    const { server } = buildMcpServer(tools);
    // SDK Transport interface declares onclose as required () => void, but
    // StreamableHTTPServerTransport's onclose is optional. With our
    // exactOptionalPropertyTypes the structural check fails; runtime is fine,
    // so cast through unknown to bridge the optional-vs-required asymmetry.
    type SdkTransport = Parameters<typeof server.connect>[0];
    try {
      await server.connect(transport as unknown as SdkTransport);
      await transport.handleRequest(req.raw, reply.raw, req.body as unknown);
      // handleRequest writes directly to the raw response; signal Fastify to
      // step back so it doesn't try to re-serialize or double-send.
      reply.hijack();
    } catch (err) {
      req.log.error({ err }, 'mcp.streamableHttp handler failed');
      // Best-effort error envelope (only reaches the client if response not started yet)
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
    } finally {
      // Defer cleanup until the response is done. Avoids cutting the stream
      // out from under handleRequest when an early error happens.
      reply.raw.on('close', () => {
        void transport.close().catch(() => undefined);
        void server.close().catch(() => undefined);
      });
    }
  });

  for (const method of ['GET', 'DELETE'] as const) {
    app.route({
      method,
      url: '/mcp',
      handler: async (_req: FastifyRequest, reply: FastifyReply) => {
        reply.code(405).send({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Method Not Allowed (stateless transport — use POST)' },
          id: null,
        });
      },
    });
  }

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

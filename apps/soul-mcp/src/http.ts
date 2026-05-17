/**
 * http.ts — Fastify REST surface for the soul-mcp adapter.
 *
 * Mirrors every MCP tool as a POST endpoint under /api/tools/<name>,
 * plus three catalog-feed endpoints used by node-scanners to push
 * nexus state in. Auth model matches soul-service: shared key in
 * X-Soul-Service-Key (same env var so deploys carry one secret, not two).
 *
 *   GET    /health/live
 *   GET    /health/ready                (verifies soul-service reachable)
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
 *   - 401 if SOUL_SERVICE_KEY is set in env and the header is missing/wrong
 *   - 502 if a soul_* tool call fails because soul-service is unreachable
 *   - 500 on any other unhandled exception
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { SoulServiceError, type SoulClient } from './soul-client.js';
import type { AllTools } from './mcp.js';
import { buildToolRegistry } from './mcp.js';
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
    const provided = req.headers['x-soul-service-key'];
    if (provided !== apiKey) {
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

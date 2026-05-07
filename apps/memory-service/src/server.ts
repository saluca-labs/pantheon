/**
 * @platform/memory-service — HTTP sidecar for @platform/memory.
 *
 * Exposes a small REST surface so non-Node services (notably the Python
 * platform-api) can consume agent-memory capabilities without re-implementing
 * the algorithms.
 *
 * Routes:
 *   GET  /health/live
 *   GET  /health/ready
 *   POST /v1/memories               body: { content, topics?, options? }
 *   GET  /v1/memories?limit&offset
 *   GET  /v1/memories/recall?topic&limit
 *   GET  /v1/memories/search?q&limit
 *   DELETE /v1/memories/:id
 *
 * Auth: shared API key via X-Memory-Service-Key header (env: MEMORY_SERVICE_KEY).
 *       Fail-closed: if MEMORY_SERVICE_KEY is unset in production, the server
 *       refuses to start.
 */

import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { Asphodel, SQLiteAdapter, PostgresAdapter } from '@platform/memory';

const PORT = Number(process.env.MEMORY_SERVICE_PORT ?? 8910);
const HOST = process.env.MEMORY_SERVICE_HOST ?? '0.0.0.0';
const API_KEY = process.env.MEMORY_SERVICE_KEY ?? '';
const NODE_ENV = process.env.NODE_ENV ?? 'development';
const BACKEND = (process.env.MEMORY_BACKEND ?? 'sqlite').toLowerCase();
const DB_URL = process.env.ASPHODEL_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const SQLITE_PATH = process.env.ASPHODEL_DB ?? './data/memory.db';

if (NODE_ENV === 'production' && !API_KEY) {
  // eslint-disable-next-line no-console
  console.error('MEMORY_SERVICE_KEY is required in production. Refusing to start.');
  process.exit(1);
}

function buildAdapter() {
  if (BACKEND === 'postgres') {
    if (!DB_URL) {
      throw new Error('MEMORY_BACKEND=postgres requires ASPHODEL_DATABASE_URL or DATABASE_URL');
    }
    return new PostgresAdapter(DB_URL);
  }
  return new SQLiteAdapter(SQLITE_PATH);
}

async function build(): Promise<FastifyInstance> {
  const loggerOptions: NonNullable<FastifyServerOptions['logger']> =
    NODE_ENV === 'development'
      ? {
          level: process.env.LOG_LEVEL ?? 'info',
          transport: { target: 'pino-pretty' },
        }
      : {
          level: process.env.LOG_LEVEL ?? 'info',
        };

  const app: FastifyInstance = Fastify({ logger: loggerOptions });

  const db = new Asphodel(buildAdapter());
  await db.init();

  // Auth hook — skip for health endpoints
  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/health/')) return;
    if (!API_KEY) return; // dev convenience when key is unset
    const provided = req.headers['x-memory-service-key'];
    if (provided !== API_KEY) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async () => {
    // ping the underlying store with a lightweight list call
    await db.list(1, 0);
    return { status: 'ready', backend: BACKEND };
  });

  type RememberBody = {
    content: string;
    topics?: string[];
  };

  app.post<{ Body: RememberBody }>('/v1/memories', async (req, reply) => {
    const { content, topics } = req.body ?? ({} as RememberBody);
    if (typeof content !== 'string' || content.length === 0) {
      reply.code(400).send({ error: 'content is required' });
      return;
    }
    const memory = await db.remember(content, topics ? { topics } : undefined);
    reply.code(201).send(memory);
  });

  app.get<{ Querystring: { limit?: string; offset?: string } }>(
    '/v1/memories',
    async (req) => {
      const limit = Number(req.query.limit ?? 20);
      const offset = Number(req.query.offset ?? 0);
      return await db.list(limit, offset);
    },
  );

  app.get<{ Querystring: { topic?: string; limit?: string } }>(
    '/v1/memories/recall',
    async (req, reply) => {
      const topic = req.query.topic;
      if (!topic) {
        reply.code(400).send({ error: 'topic is required' });
        return;
      }
      const limit = Number(req.query.limit ?? 10);
      return await db.recall(topic, { limit });
    },
  );

  app.get<{ Querystring: { q?: string; limit?: string } }>(
    '/v1/memories/search',
    async (req, reply) => {
      const q = req.query.q;
      if (!q) {
        reply.code(400).send({ error: 'q is required' });
        return;
      }
      const limit = Number(req.query.limit ?? 10);
      return await db.search(q, { limit });
    },
  );

  app.delete<{ Params: { id: string } }>('/v1/memories/:id', async (req) => {
    const id = Number(req.params.id);
    const ok = await db.forget(id);
    return { deleted: ok };
  });

  app.addHook('onClose', async () => {
    await db.close();
  });

  return app;
}

async function main() {
  const app = await build();
  await app.listen({ port: PORT, host: HOST });
  // eslint-disable-next-line no-console
  console.log(`@platform/memory-service listening on ${HOST}:${PORT} (backend=${BACKEND})`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

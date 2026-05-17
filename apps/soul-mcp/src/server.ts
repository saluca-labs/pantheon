/**
 * server.ts — soul-mcp entrypoint.
 *
 * Boots one or both of:
 *   - MCP server over stdio (for LLM harnesses: claude-code, opencode, …)
 *   - HTTP server (for in-cluster Pantheon services + the catalog feed)
 *
 * Transport selection:
 *   --transport=both     (default in container)
 *   --transport=http     HTTP only
 *   --transport=stdio    MCP-over-stdio only
 *
 * In production the container runs --transport=both so the same pod can
 * be exec'd into by an LLM harness AND serve REST calls. Local dev can
 * pick one with `pnpm dev:mcp` / `pnpm dev:http`.
 *
 * Boot order:
 *   1. open SQLite store
 *   2. wire tool factories with the store + soul-client
 *   3. start HTTP (and/or MCP stdio)
 *   4. run startup hooks (auto-init session if SOUL_AUTO_INIT_SESSION=1)
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { openDb } from './store/db.js';
import { SoulClient } from './soul-client.js';
import { buildSoulTools } from './tools/soul.js';
import { buildMeshTools } from './tools/mesh.js';
import { buildNexusTools } from './tools/nexus.js';
import { buildMcpServer } from './mcp.js';
import { buildHttp } from './http.js';
import { runStartupHooks } from './startup.js';

type Transport = 'both' | 'http' | 'stdio';

function parseTransport(): Transport {
  const arg = process.argv.find((a) => a.startsWith('--transport='));
  const fromArg = arg?.split('=')[1];
  const fromEnv = process.env.SOUL_MCP_TRANSPORT;
  const raw = (fromArg || fromEnv || 'both').toLowerCase();
  if (raw === 'both' || raw === 'http' || raw === 'stdio') return raw;
  console.error(`Invalid transport "${raw}"; falling back to both`);
  return 'both';
}

async function main(): Promise<void> {
  const transport = parseTransport();

  // ── Wire dependencies ──────────────────────────────────────────────────────
  const db = openDb();
  const soul = new SoulClient();
  const tools = {
    soul: buildSoulTools({ db, soul }),
    mesh: buildMeshTools(db),
    nexus: buildNexusTools(db),
  };

  // ── HTTP ───────────────────────────────────────────────────────────────────
  let httpReady = Promise.resolve();
  if (transport === 'both' || transport === 'http') {
    const port = Number(process.env.SOUL_MCP_HTTP_PORT ?? 8090);
    const host = process.env.SOUL_MCP_HTTP_HOST ?? '0.0.0.0';
    // When MCP-over-stdio is also enabled, we must NOT pretty-print logs to
    // stderr because some harnesses muddle their own stderr with the
    // adapter's. Pino's structured-JSON default is safe either way.
    const app = await buildHttp({ tools, soul, logger: true });
    httpReady = app.listen({ port, host }).then(() => {
      app.log.info({ port, host, transport }, 'soul-mcp HTTP listening');
    });
  }

  // ── MCP-over-stdio ─────────────────────────────────────────────────────────
  if (transport === 'both' || transport === 'stdio') {
    const { server } = buildMcpServer(tools);
    const stdio = new StdioServerTransport();
    await server.connect(stdio);
    // MCP-over-stdio uses stdin/stdout for protocol frames — DO NOT
    // console.log from here onward except via stderr.
    process.stderr.write(`soul-mcp MCP transport=stdio ready\n`);
  }

  // ── Wait for HTTP to bind, then run startup hooks ──────────────────────────
  await httpReady;
  await runStartupHooks({
    tools,
    logger: {
      info: (o, msg) => process.stderr.write(`[startup] ${msg ?? ''} ${JSON.stringify(o)}\n`),
      error: (o, msg) => process.stderr.write(`[startup:error] ${msg ?? ''} ${JSON.stringify(o)}\n`),
    },
  });
}

main().catch((err) => {
  process.stderr.write(`soul-mcp fatal: ${err instanceof Error ? err.stack || err.message : String(err)}\n`);
  process.exit(1);
});

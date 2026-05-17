#!/usr/bin/env node
/**
 * smoke_test.mjs — Offline smoke for soul-mcp.
 *
 * Runs without Docker, without soul-service, without the network. Verifies:
 *   1. Every module imports cleanly.
 *   2. The tool registry exposes all 22 mcp__soul__* tools, names match the
 *      upstream tool surface exactly.
 *   3. Every registry entry has a description + JSON schema.
 *   4. SQLite-backed tools work end-to-end (mesh + nexus + soul session).
 *   5. The HTTP server starts, /health/live returns 200, the auth gate
 *      enforces in production-mode and bypasses in dev-mode.
 *   6. POST /api/tools/<name> routes through the same handlers as MCP.
 *
 * Run from repo root:
 *   node apps/soul-mcp/scripts/smoke_test.mjs
 */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Force the SQLite store into a throwaway dir before anything imports it.
const tmpRoot = mkdtempSync(join(tmpdir(), 'soul-mcp-smoke-'));
mkdirSync(tmpRoot, { recursive: true });
process.env.SOUL_MCP_DB_PATH = join(tmpRoot, 'smoke.db');
process.env.SOUL_SERVICE_URL = 'http://127.0.0.1:1';   // unreachable — health calls fail fast
process.env.SOUL_SERVICE_KEY = '';                     // dev-mode for HTTP gate

const EXPECTED_TOOLS = [
  // soul
  'soul_session_init', 'soul_session_load', 'soul_session_close',
  'soul_memory_write', 'soul_memory_search',
  'soul_topics_lookup', 'soul_topics_top',
  'soul_cot_flush', 'soul_transcript_capture',
  // mesh
  'mesh_heartbeat', 'mesh_inbox', 'mesh_message', 'mesh_sessions',
  'mesh_task_create', 'mesh_task_claim', 'mesh_task_complete', 'mesh_tasks',
  // nexus
  'nexus_nodes', 'nexus_services', 'nexus_gsd',
  'nexus_where', 'nexus_context', 'nexus_status',
];

function step(label) { process.stdout.write(`  [${label}]\n`); }
function fail(label, detail) { process.stderr.write(`  FAIL ${label}: ${detail}\n`); process.exit(1); }

async function main() {
  console.log('-- soul-mcp smoke test --');

  step('import modules');
  const { openDb } = await import('../dist/store/db.js');
  const { SoulClient } = await import('../dist/soul-client.js');
  const { buildSoulTools } = await import('../dist/tools/soul.js');
  const { buildMeshTools } = await import('../dist/tools/mesh.js');
  const { buildNexusTools } = await import('../dist/tools/nexus.js');
  const { buildMcpServer, buildToolRegistry } = await import('../dist/mcp.js');
  const { buildHttp } = await import('../dist/http.js');

  step('wire dependencies');
  const db = openDb();
  const soul = new SoulClient();
  const tools = {
    soul: buildSoulTools({ db, soul }),
    mesh: buildMeshTools(db),
    nexus: buildNexusTools(db),
  };

  step('tool registry contains all 22 expected tools');
  const registry = buildToolRegistry(tools);
  const names = registry.map(t => t.name).sort();
  const expected = [...EXPECTED_TOOLS].sort();
  if (names.length !== expected.length) {
    fail('registry size', `expected ${expected.length} got ${names.length}: ${names.join(',')}`);
  }
  for (let i = 0; i < expected.length; i++) {
    if (names[i] !== expected[i]) fail('registry name', `slot ${i}: ${names[i]} vs ${expected[i]}`);
  }

  step('every registry entry has description + input schema');
  for (const t of registry) {
    if (!t.description || typeof t.description !== 'string') fail('description', t.name);
    if (!t.inputSchema || typeof t.inputSchema !== 'object') fail('schema', t.name);
    if (t.inputSchema.type !== 'object') fail('schema type', `${t.name}: ${t.inputSchema.type}`);
  }

  step('MCP server registers without throwing');
  const { server } = buildMcpServer(tools);
  if (!server) fail('mcp', 'buildMcpServer returned null');

  step('mesh handlers: heartbeat -> sessions -> task create/claim/complete');
  tools.mesh.mesh_heartbeat({
    session_id: 'smoke-1',
    node_id: 'smoke-node',
    harness: 'claude-code',
  });
  const sessions = tools.mesh.mesh_sessions({});
  if (sessions.count !== 1) fail('mesh_sessions', `expected 1 got ${sessions.count}`);

  const created = tools.mesh.mesh_task_create({ from_session_id: 'smoke-1', title: 'smoke task' });
  if (!created.task_id) fail('mesh_task_create', JSON.stringify(created));

  const claim1 = tools.mesh.mesh_task_claim({
    task_id: created.task_id, session_id: 'smoke-1', node_id: 'smoke-node',
  });
  if (!claim1.claimed) fail('mesh_task_claim first', JSON.stringify(claim1));

  const claim2 = tools.mesh.mesh_task_claim({
    task_id: created.task_id, session_id: 'smoke-2', node_id: 'smoke-node-2',
  });
  if (claim2.claimed) fail('mesh_task_claim second', 'second claim should fail');

  const done = tools.mesh.mesh_task_complete({
    task_id: created.task_id, session_id: 'smoke-1', status: 'completed', result: { ok: true },
  });
  if (!done.completed) fail('mesh_task_complete', JSON.stringify(done));

  step('mesh inbox: broadcast message visible to other session, not to self');
  tools.mesh.mesh_heartbeat({ session_id: 'smoke-2', node_id: 'n2', harness: 'opencode' });
  tools.mesh.mesh_message({
    from_session_id: 'smoke-1',
    message_type: 'broadcast',
    subject: 'hello',
    body: { greeting: 'hi' },
  });
  const inbox2 = tools.mesh.mesh_inbox({ session_id: 'smoke-2' });
  if (inbox2.count !== 1) fail('mesh_inbox other', `expected 1 got ${inbox2.count}`);
  const inboxSelf = tools.mesh.mesh_inbox({ session_id: 'smoke-1' });
  if (inboxSelf.count !== 0) fail('mesh_inbox self', `expected 0 got ${inboxSelf.count}`);

  step('nexus handlers: upsert + read');
  tools.nexus.upsertNode({ node_id: 'smoke-node', os: 'linux', roles: ['ai'], status: 'online' });
  tools.nexus.upsertService({ node_id: 'smoke-node', service_name: 'soul-mcp', port: 8090 });
  tools.nexus.upsertProject({
    project_name: 'pantheon', node_id: 'smoke-node',
    gsd_status: 'in-progress', gsd_milestone: 'W-J.2', gsd_progress: 0.8,
  });
  const status = tools.nexus.nexus_status();
  if (status.nodes_total !== 1) fail('nexus_status', JSON.stringify(status));
  const where = tools.nexus.nexus_where({ project: 'pantheon' });
  if (where.match_type !== 'exact' || where.count !== 1) fail('nexus_where', JSON.stringify(where));
  const gsd = tools.nexus.nexus_gsd();
  if (gsd.count !== 1) fail('nexus_gsd', JSON.stringify(gsd));

  step('soul session bookkeeping: init -> cot_flush -> transcript_capture drains buffer');
  // soul-service unreachable; soul_session_init still records locally.
  const init = await tools.soul.soul_session_init({ session_id: 'smoke-soul', harness: 'claude-code' });
  if (init.session_id !== 'smoke-soul') fail('soul_session_init', JSON.stringify(init));
  tools.soul.soul_cot_flush({
    session_id: 'smoke-soul', thoughts: ['first thought', 'second thought'],
  });
  const captured = tools.soul.soul_transcript_capture({
    session_id: 'smoke-soul',
    summary: 'smoke run',
    turns: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }],
  });
  if (captured.buffered_cot_drained !== 2) fail('cot drain', JSON.stringify(captured));
  if (!captured.payload_hash || captured.payload_hash.length !== 64) fail('payload hash', captured.payload_hash);

  step('http server boots, /health/live returns 200');
  const app = await buildHttp({ tools, soul, logger: false });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  let r = await fetch(`http://127.0.0.1:${port}/health/live`);
  if (r.status !== 200) fail('/health/live', `status=${r.status}`);

  step('dev-mode bypass: POST /api/tools/nexus_status without key returns 200');
  r = await fetch(`http://127.0.0.1:${port}/api/tools/nexus_status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (r.status !== 200) fail('nexus_status dev', `status=${r.status}`);
  const body = await r.json();
  if (typeof body.nodes_total !== 'number') fail('nexus_status shape', JSON.stringify(body));
  await app.close();

  step('production-mode: POST without key returns 401, with key returns 200');
  const prodApp = await buildHttp({ tools, soul, serviceKey: 'shh', logger: false });
  await prodApp.listen({ port: 0, host: '127.0.0.1' });
  const prodPort = prodApp.server.address().port;

  r = await fetch(`http://127.0.0.1:${prodPort}/api/tools/nexus_status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (r.status !== 401) fail('prod no-key', `expected 401 got ${r.status}`);

  r = await fetch(`http://127.0.0.1:${prodPort}/api/tools/nexus_status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-soul-service-key': 'shh' },
    body: '{}',
  });
  if (r.status !== 200) fail('prod with-key', `expected 200 got ${r.status}`);

  // health bypass still works in production-mode
  r = await fetch(`http://127.0.0.1:${prodPort}/health/live`);
  if (r.status !== 200) fail('prod /health/live', `status=${r.status}`);

  await prodApp.close();
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });

  console.log('OK -- soul-mcp smoke test passed');
}

main().catch(err => { console.error(err); process.exit(1); });

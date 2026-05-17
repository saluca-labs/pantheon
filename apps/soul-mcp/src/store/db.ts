/**
 * store/db.ts — SQLite-backed local state for mesh, nexus, and soul session
 * bookkeeping (CoT buffers, transcripts, hash-chain roots).
 *
 * Why local SQLite instead of soul-service's Postgres / Supabase:
 *  - soul-service today only ships memory write/read + TKHR + integrity over
 *    HTTP. Mesh and nexus have no upstream backend; we either invent one
 *    locally or stub out the tools.
 *  - Local SQLite keeps the adapter self-contained and lets self-hosters
 *    run the full tool surface without provisioning Postgres + a heartbeat
 *    cron + a node-discovery agent.
 *  - When upstream gains first-class mesh/nexus stores (or these become
 *    their own pantheon services), swapping this file for an HTTP client
 *    is the only change required — the tool handlers route through a
 *    narrow interface (`Store`) below.
 *
 * Path: defaults to /app/data/soul-mcp.db inside the container (emptyDir
 * mount). Override with SOUL_MCP_DB_PATH for local dev.
 */

import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';

const DEFAULT_DB_PATH = process.env.SOUL_MCP_DB_PATH ?? '/app/data/soul-mcp.db';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS soul_sessions (
  session_id      TEXT PRIMARY KEY,
  agent_id        TEXT NOT NULL DEFAULT 'alfred',
  node_id         TEXT,
  harness         TEXT,
  persona         TEXT,
  context_root    TEXT,         -- SHA-256 of last close payload
  opened_at       INTEGER NOT NULL,
  closed_at       INTEGER,
  metadata        TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS soul_cot (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT NOT NULL,
  agent_id        TEXT NOT NULL,
  node_id         TEXT,
  harness         TEXT,
  thought         TEXT NOT NULL,
  recorded_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cot_session ON soul_cot (session_id, recorded_at);

CREATE TABLE IF NOT EXISTS soul_transcripts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT NOT NULL,
  agent_id        TEXT NOT NULL DEFAULT 'alfred',
  interactor_id   TEXT NOT NULL DEFAULT 'unknown',
  summary         TEXT,
  payload         TEXT NOT NULL,   -- JSON: { turns, cot, jsonl_excerpt }
  payload_hash    TEXT NOT NULL,   -- SHA-256 over payload bytes
  captured_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transcripts_session ON soul_transcripts (session_id, captured_at);

CREATE TABLE IF NOT EXISTS mesh_sessions (
  session_id      TEXT PRIMARY KEY,
  agent_id        TEXT NOT NULL DEFAULT 'alfred',
  node_id         TEXT NOT NULL,
  harness         TEXT NOT NULL,
  current_task    TEXT,
  metadata        TEXT NOT NULL DEFAULT '{}',
  last_heartbeat  INTEGER NOT NULL,
  registered_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mesh_sessions_heartbeat ON mesh_sessions (last_heartbeat);

CREATE TABLE IF NOT EXISTS mesh_messages (
  id              TEXT PRIMARY KEY,         -- uuid
  from_session_id TEXT NOT NULL,
  to_session_id   TEXT,                     -- NULL = broadcast
  to_node_id      TEXT,
  message_type    TEXT NOT NULL,
  priority        TEXT NOT NULL DEFAULT 'normal',
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,            -- JSON
  read_at         INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mesh_messages_to ON mesh_messages (to_session_id, read_at);
CREATE INDEX IF NOT EXISTS idx_mesh_messages_broadcast ON mesh_messages (created_at)
  WHERE to_session_id IS NULL;

CREATE TABLE IF NOT EXISTS mesh_tasks (
  task_id         TEXT PRIMARY KEY,         -- uuid
  title           TEXT NOT NULL,
  description     TEXT,
  created_by      TEXT NOT NULL,            -- session_id
  assigned_to     TEXT,                     -- session_id
  assigned_node   TEXT,
  depends_on      TEXT NOT NULL DEFAULT '[]', -- JSON array of task_ids
  status          TEXT NOT NULL DEFAULT 'pending',
  result          TEXT,                     -- JSON
  created_at      INTEGER NOT NULL,
  claimed_at      INTEGER,
  completed_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_mesh_tasks_status ON mesh_tasks (status, created_at);
CREATE INDEX IF NOT EXISTS idx_mesh_tasks_assigned ON mesh_tasks (assigned_to);

CREATE TABLE IF NOT EXISTS nexus_nodes (
  node_id         TEXT PRIMARY KEY,
  tailscale_ip    TEXT,
  os              TEXT,
  roles           TEXT NOT NULL DEFAULT '[]',   -- JSON array
  status          TEXT NOT NULL DEFAULT 'unknown',
  meta            TEXT NOT NULL DEFAULT '{}',   -- JSON: hardware, gpu, ai_processes, etc.
  last_heartbeat  INTEGER NOT NULL,
  registered_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS nexus_services (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id         TEXT NOT NULL,
  service_name    TEXT NOT NULL,
  port            INTEGER,
  status          TEXT NOT NULL DEFAULT 'unknown',
  type            TEXT,
  reported_at     INTEGER NOT NULL,
  UNIQUE(node_id, service_name)
);
CREATE INDEX IF NOT EXISTS idx_nexus_services_node ON nexus_services (node_id);

CREATE TABLE IF NOT EXISTS nexus_projects (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_name    TEXT NOT NULL,
  node_id         TEXT NOT NULL,
  path            TEXT,
  git_branch      TEXT,
  gsd_status      TEXT,
  gsd_milestone   TEXT,
  gsd_progress    REAL,
  last_scanned_at INTEGER NOT NULL,
  UNIQUE(project_name, node_id)
);
CREATE INDEX IF NOT EXISTS idx_nexus_projects_name ON nexus_projects (project_name);
CREATE INDEX IF NOT EXISTS idx_nexus_projects_gsd ON nexus_projects (gsd_status)
  WHERE gsd_status IS NOT NULL;
`;

export function openDb(p: string = DEFAULT_DB_PATH): Database.Database {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const db = new Database(p);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

export type DB = Database.Database;

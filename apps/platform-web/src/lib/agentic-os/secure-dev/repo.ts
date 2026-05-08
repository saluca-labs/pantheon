/**
 * Secure-Dev OS — database repository for threat models.
 *
 * All queries target `agos_secdev_threat_models` introduced in
 * migration 0006_secure_dev_os.py.
 *
 * @license MIT — Tiresias Secure-Dev OS (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getSecureDevPool } from './session';
import type { StrideChecklist } from './stride';

export interface ThreatModelRow {
  id: string;
  userId: string;
  systemName: string;
  systemDescription: string;
  checklist: StrideChecklist;
  createdAt: string;
}

function rowToModel(row: any): ThreatModelRow {
  return {
    id: row.id,
    userId: row.user_id,
    systemName: row.system_name,
    systemDescription: row.system_description,
    checklist: row.checklist as StrideChecklist,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listThreatModels(userId: string): Promise<ThreatModelRow[]> {
  const pool = getSecureDevPool();
  const r = await pool.query(
    `SELECT id, user_id, system_name, system_description, checklist, created_at
       FROM agos_secdev_threat_models
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [userId],
  );
  return r.rows.map(rowToModel);
}

export async function saveThreatModel(args: {
  userId: string;
  systemName: string;
  systemDescription: string;
  checklist: StrideChecklist;
}): Promise<ThreatModelRow> {
  const pool = getSecureDevPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_secdev_threat_models
       (id, user_id, system_name, system_description, checklist)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [id, args.userId, args.systemName, args.systemDescription, JSON.stringify(args.checklist)],
  );
  const rows = await listThreatModels(args.userId);
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error('Failed to save threat model');
  return row;
}

// ─── Audit ─────────────────────────────────────────────────────────────────

export async function recordAudit(args: {
  actorId: string;
  action: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const pool = getSecureDevPool();
  await pool.query(
    `INSERT INTO agos_audit (id, actor_id, os_slug, action, payload)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [randomUUID(), args.actorId, 'secure-dev', args.action, JSON.stringify(args.payload ?? {})],
  );
}

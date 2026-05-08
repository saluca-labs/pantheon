/**
 * CyberSec OS — database repository for alerts and triage.
 *
 * All queries target `agos_cyber_alerts` introduced in migration 0007_cyber_os.py.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getCyberPool } from './session';
import type { Alert, AlertSeverity, AlertStatus, AlertCategory } from './triage';

function rowToAlert(row: any): Alert {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    severity: row.severity as AlertSeverity,
    category: row.category as AlertCategory,
    status: row.status as AlertStatus,
    source: row.source ?? '',
    sourceIp: row.source_ip ?? null,
    assignedTo: row.assigned_to ?? null,
    notes: row.notes ?? null,
    occurredAt: row.occurred_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listAlerts(userId: string, limit = 100): Promise<Alert[]> {
  const pool = getCyberPool();
  const r = await pool.query(
    `SELECT id, title, description, severity, category, status, source, source_ip,
            assigned_to, notes, occurred_at, created_at, updated_at
       FROM agos_cyber_alerts
      WHERE owner_id = $1
      ORDER BY occurred_at DESC
      LIMIT $2`,
    [userId, limit],
  );
  return r.rows.map(rowToAlert);
}

export async function getAlert(id: string, userId: string): Promise<Alert | null> {
  const pool = getCyberPool();
  const r = await pool.query(
    `SELECT id, title, description, severity, category, status, source, source_ip,
            assigned_to, notes, occurred_at, created_at, updated_at
       FROM agos_cyber_alerts
      WHERE id = $1 AND owner_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToAlert(r.rows[0]);
}

export interface AlertInsert {
  title: string;
  description?: string;
  severity: AlertSeverity;
  category: AlertCategory;
  status?: AlertStatus;
  source?: string;
  sourceIp?: string | null;
  assignedTo?: string | null;
  notes?: string | null;
  occurredAt?: string;
}

export async function createAlert(userId: string, data: AlertInsert): Promise<Alert> {
  const pool = getCyberPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_cyber_alerts
       (id, owner_id, title, description, severity, category, status, source, source_ip,
        assigned_to, notes, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id, userId,
      data.title, data.description ?? '', data.severity, data.category,
      data.status ?? 'open', data.source ?? '', data.sourceIp ?? null,
      data.assignedTo ?? null, data.notes ?? null,
      data.occurredAt ? new Date(data.occurredAt) : new Date(),
    ],
  );
  const a = await getAlert(id, userId);
  if (!a) throw new Error('Failed to create alert');
  return a;
}

export async function updateAlert(
  id: string,
  userId: string,
  patch: { status?: AlertStatus; assignedTo?: string | null; notes?: string | null },
): Promise<Alert | null> {
  const pool = getCyberPool();
  await pool.query(
    `UPDATE agos_cyber_alerts
        SET status      = COALESCE($3, status),
            assigned_to = COALESCE($4, assigned_to),
            notes       = COALESCE($5, notes),
            updated_at  = now()
      WHERE id = $1 AND owner_id = $2`,
    [id, userId, patch.status ?? null, patch.assignedTo ?? null, patch.notes ?? null],
  );
  return getAlert(id, userId);
}

export async function hasAlerts(userId: string): Promise<boolean> {
  const pool = getCyberPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_cyber_alerts WHERE owner_id = $1 LIMIT 1`,
    [userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Audit ─────────────────────────────────────────────────────────────────

export async function recordAudit(args: {
  actorId: string;
  action: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const pool = getCyberPool();
  await pool.query(
    `INSERT INTO agos_audit (id, actor_id, os_slug, action, payload)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [randomUUID(), args.actorId, 'cyber', args.action, JSON.stringify(args.payload ?? {})],
  );
}

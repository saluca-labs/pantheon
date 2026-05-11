/**
 * CyberSec OS — database repository.
 *
 * Phase 0: alerts (from migration 0007_cyber_os).
 * Phase 1: assets, asset groups, log sources, alert enrichment, dashboard
 *          stats (migration 0028_cyber_phase1).
 *
 * Every row is owner-scoped via `owner_id`. Cyber is user-scoped today and
 * intentionally does NOT use the multi-tenant `tenant_id` pattern.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getCyberPool } from './session';
import type { Alert, AlertSeverity, AlertStatus, AlertCategory } from './triage';
import type {
  Asset,
  AssetCriticality,
  AssetKind,
  AssetUpsert,
} from './assets';
import type {
  LogSource,
  LogSourceKind,
  LogSourceStatus,
  LogSourceUpsert,
} from './log-sources';
import type {
  Case,
  CaseDetail,
  CaseEvent,
  CaseEventKind,
  CasePatch,
  CasePriority,
  CaseSeverity,
  CaseStatus,
  CaseUpsert,
  CaseWithCounts,
  Evidence,
  EvidenceKind,
  EvidencePatch,
  EvidenceUpsert,
  Task,
  TaskPatch,
  TaskStatus,
  TaskUpsert,
} from './cases';

// ─── Alerts ────────────────────────────────────────────────────────────────

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
    assetId: row.asset_id ?? null,
    logSourceId: row.log_source_id ?? null,
    tactic: row.tactic ?? null,
    technique: row.technique ?? null,
    correlationId: row.correlation_id ?? null,
    tags: row.tags ?? [],
    raw: row.raw_jsonb ?? {},
  };
}

const ALERT_COLS = `
  id, title, description, severity, category, status, source, source_ip,
  assigned_to, notes, occurred_at, created_at, updated_at,
  asset_id, log_source_id, tactic, technique, correlation_id, tags, raw_jsonb
`;

export async function listAlerts(userId: string, limit = 100): Promise<Alert[]> {
  const pool = getCyberPool();
  const r = await pool.query(
    `SELECT ${ALERT_COLS}
       FROM agos_cyber_alerts
      WHERE owner_id = $1
      ORDER BY
        CASE severity
          WHEN 'critical' THEN 0
          WHEN 'high'     THEN 1
          WHEN 'medium'   THEN 2
          WHEN 'low'      THEN 3
          ELSE                 4
        END,
        occurred_at DESC
      LIMIT $2`,
    [userId, limit],
  );
  return r.rows.map(rowToAlert);
}

export async function getAlert(id: string, userId: string): Promise<Alert | null> {
  const pool = getCyberPool();
  const r = await pool.query(
    `SELECT ${ALERT_COLS}
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

// ─── Alert enrichment ──────────────────────────────────────────────────────

export interface AlertEnrichmentPatch {
  /** Pass null to clear; omit to leave untouched. */
  assetId?: string | null;
  logSourceId?: string | null;
  tactic?: string | null;
  technique?: string | null;
  tags?: string[];
}

export async function updateAlertEnrichment(args: {
  alertId: string;
  ownerId: string;
  patch: AlertEnrichmentPatch;
}): Promise<Alert | null> {
  const pool = getCyberPool();
  const sets: string[] = [];
  const params: unknown[] = [args.alertId, args.ownerId];
  let i = 3;

  if ('assetId' in args.patch) {
    sets.push(`asset_id = $${i++}`);
    params.push(args.patch.assetId);
  }
  if ('logSourceId' in args.patch) {
    sets.push(`log_source_id = $${i++}`);
    params.push(args.patch.logSourceId);
  }
  if ('tactic' in args.patch) {
    sets.push(`tactic = $${i++}`);
    params.push(args.patch.tactic);
  }
  if ('technique' in args.patch) {
    sets.push(`technique = $${i++}`);
    params.push(args.patch.technique);
  }
  if (args.patch.tags !== undefined) {
    sets.push(`tags = $${i++}`);
    params.push(args.patch.tags);
  }

  if (sets.length === 0) {
    return getAlert(args.alertId, args.ownerId);
  }

  sets.push(`updated_at = now()`);
  await pool.query(
    `UPDATE agos_cyber_alerts
        SET ${sets.join(', ')}
      WHERE id = $1 AND owner_id = $2`,
    params,
  );
  return getAlert(args.alertId, args.ownerId);
}

// ─── Assets ────────────────────────────────────────────────────────────────

function rowToAsset(row: any): Asset {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    kind: row.kind as AssetKind,
    criticality: row.criticality as AssetCriticality,
    environment: row.environment ?? null,
    hostname: row.hostname ?? null,
    ipAddress: row.ip_address ?? null,
    osFamily: row.os_family ?? null,
    osVersion: row.os_version ?? null,
    ownerEmail: row.owner_email ?? null,
    tags: row.tags ?? [],
    metadata: row.metadata ?? {},
    decommissionedAt: row.decommissioned_at ? row.decommissioned_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const ASSET_COLS = `
  id, owner_id, name, kind, criticality, environment, hostname, ip_address,
  os_family, os_version, owner_email, tags, metadata, decommissioned_at,
  created_at, updated_at
`;

export interface ListAssetsArgs {
  ownerId: string;
  q?: string;
  kind?: AssetKind;
  criticality?: AssetCriticality;
  environment?: string;
  includeDecommissioned?: boolean;
  limit?: number;
  offset?: number;
}

export async function listAssets(args: ListAssetsArgs): Promise<Asset[]> {
  const pool = getCyberPool();
  const where: string[] = [`owner_id = $1`];
  const params: unknown[] = [args.ownerId];
  let i = 2;

  if (!args.includeDecommissioned) {
    where.push(`decommissioned_at IS NULL`);
  }
  if (args.kind) {
    where.push(`kind = $${i++}`);
    params.push(args.kind);
  }
  if (args.criticality) {
    where.push(`criticality = $${i++}`);
    params.push(args.criticality);
  }
  if (args.environment) {
    where.push(`environment = $${i++}`);
    params.push(args.environment);
  }
  if (args.q && args.q.trim().length > 0) {
    where.push(`(name ILIKE $${i} OR hostname ILIKE $${i} OR owner_email ILIKE $${i})`);
    params.push(`%${args.q.trim()}%`);
    i++;
  }

  params.push(args.limit ?? 200);
  const limitIdx = i++;
  params.push(args.offset ?? 0);
  const offsetIdx = i++;

  const r = await pool.query(
    `SELECT ${ASSET_COLS}
       FROM agos_cyber_assets
      WHERE ${where.join(' AND ')}
      ORDER BY
        CASE criticality
          WHEN 'critical' THEN 0
          WHEN 'high'     THEN 1
          WHEN 'medium'   THEN 2
          ELSE                 3
        END,
        name ASC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );
  return r.rows.map(rowToAsset);
}

export async function getAsset(id: string, ownerId: string): Promise<Asset | null> {
  const pool = getCyberPool();
  const r = await pool.query(
    `SELECT ${ASSET_COLS}
       FROM agos_cyber_assets
      WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToAsset(r.rows[0]);
}

export async function createAsset(ownerId: string, data: AssetUpsert): Promise<Asset> {
  const pool = getCyberPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_cyber_assets
       (id, owner_id, name, kind, criticality, environment, hostname, ip_address,
        os_family, os_version, owner_email, tags, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
    [
      id, ownerId,
      data.name, data.kind, data.criticality,
      data.environment ?? null,
      data.hostname ?? null,
      data.ipAddress ?? null,
      data.osFamily ?? null,
      data.osVersion ?? null,
      data.ownerEmail ?? null,
      data.tags ?? [],
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const a = await getAsset(id, ownerId);
  if (!a) throw new Error('Failed to create asset');
  return a;
}

export async function updateAsset(
  id: string,
  ownerId: string,
  patch: Partial<AssetUpsert>,
): Promise<Asset | null> {
  const pool = getCyberPool();
  const sets: string[] = [];
  const params: unknown[] = [id, ownerId];
  let i = 3;

  if (patch.name !== undefined)        { sets.push(`name = $${i++}`);         params.push(patch.name); }
  if (patch.kind !== undefined)        { sets.push(`kind = $${i++}`);         params.push(patch.kind); }
  if (patch.criticality !== undefined) { sets.push(`criticality = $${i++}`);  params.push(patch.criticality); }
  if (patch.environment !== undefined) { sets.push(`environment = $${i++}`);  params.push(patch.environment); }
  if (patch.hostname !== undefined)    { sets.push(`hostname = $${i++}`);     params.push(patch.hostname); }
  if (patch.ipAddress !== undefined)   { sets.push(`ip_address = $${i++}`);   params.push(patch.ipAddress); }
  if (patch.osFamily !== undefined)    { sets.push(`os_family = $${i++}`);    params.push(patch.osFamily); }
  if (patch.osVersion !== undefined)   { sets.push(`os_version = $${i++}`);   params.push(patch.osVersion); }
  if (patch.ownerEmail !== undefined)  { sets.push(`owner_email = $${i++}`);  params.push(patch.ownerEmail); }
  if (patch.tags !== undefined)        { sets.push(`tags = $${i++}`);         params.push(patch.tags); }
  if (patch.metadata !== undefined)    { sets.push(`metadata = $${i++}::jsonb`); params.push(JSON.stringify(patch.metadata)); }

  if (sets.length === 0) return getAsset(id, ownerId);

  sets.push(`updated_at = now()`);
  await pool.query(
    `UPDATE agos_cyber_assets
        SET ${sets.join(', ')}
      WHERE id = $1 AND owner_id = $2`,
    params,
  );
  return getAsset(id, ownerId);
}

export async function decommissionAsset(id: string, ownerId: string): Promise<Asset | null> {
  const pool = getCyberPool();
  await pool.query(
    `UPDATE agos_cyber_assets
        SET decommissioned_at = COALESCE(decommissioned_at, now()),
            updated_at = now()
      WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  return getAsset(id, ownerId);
}

export async function deleteAsset(id: string, ownerId: string): Promise<boolean> {
  const pool = getCyberPool();
  const r = await pool.query(
    `DELETE FROM agos_cyber_assets WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function listAlertsForAsset(
  assetId: string,
  ownerId: string,
  limit = 50,
): Promise<Alert[]> {
  const pool = getCyberPool();
  const r = await pool.query(
    `SELECT ${ALERT_COLS}
       FROM agos_cyber_alerts
      WHERE owner_id = $1 AND asset_id = $2
      ORDER BY occurred_at DESC
      LIMIT $3`,
    [ownerId, assetId, limit],
  );
  return r.rows.map(rowToAlert);
}

// ─── Asset groups ──────────────────────────────────────────────────────────

export interface AssetGroup {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  tags: string[];
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AssetGroupDetail extends AssetGroup {
  members: Asset[];
}

export interface AssetGroupUpsert {
  name: string;
  description?: string | null;
  tags?: string[];
}

function rowToGroup(row: any): AssetGroup {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description ?? null,
    tags: row.tags ?? [],
    memberCount: Number(row.member_count ?? 0),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listAssetGroups(args: { ownerId: string }): Promise<AssetGroup[]> {
  const pool = getCyberPool();
  const r = await pool.query(
    `SELECT g.id, g.owner_id, g.name, g.description, g.tags, g.created_at, g.updated_at,
            COUNT(m.asset_id) AS member_count
       FROM agos_cyber_asset_groups g
       LEFT JOIN agos_cyber_asset_group_members m ON m.group_id = g.id
      WHERE g.owner_id = $1
      GROUP BY g.id
      ORDER BY g.name ASC`,
    [args.ownerId],
  );
  return r.rows.map(rowToGroup);
}

export async function getAssetGroup(
  id: string,
  ownerId: string,
): Promise<AssetGroupDetail | null> {
  const pool = getCyberPool();
  const r = await pool.query(
    `SELECT g.id, g.owner_id, g.name, g.description, g.tags, g.created_at, g.updated_at,
            COUNT(m.asset_id) AS member_count
       FROM agos_cyber_asset_groups g
       LEFT JOIN agos_cyber_asset_group_members m ON m.group_id = g.id
      WHERE g.id = $1 AND g.owner_id = $2
      GROUP BY g.id`,
    [id, ownerId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  const group = rowToGroup(r.rows[0]);

  const members = await pool.query(
    `SELECT ${ASSET_COLS}
       FROM agos_cyber_assets a
       JOIN agos_cyber_asset_group_members m ON m.asset_id = a.id
      WHERE m.group_id = $1 AND a.owner_id = $2
      ORDER BY a.name ASC`,
    [id, ownerId],
  );
  return { ...group, members: members.rows.map(rowToAsset) };
}

export async function createAssetGroup(
  ownerId: string,
  data: AssetGroupUpsert,
): Promise<AssetGroup> {
  const pool = getCyberPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_cyber_asset_groups (id, owner_id, name, description, tags)
     VALUES ($1,$2,$3,$4,$5)`,
    [id, ownerId, data.name, data.description ?? null, data.tags ?? []],
  );
  const r = await pool.query(
    `SELECT g.id, g.owner_id, g.name, g.description, g.tags, g.created_at, g.updated_at,
            0 AS member_count
       FROM agos_cyber_asset_groups g
      WHERE g.id = $1 AND g.owner_id = $2`,
    [id, ownerId],
  );
  return rowToGroup(r.rows[0]);
}

export async function updateAssetGroup(
  id: string,
  ownerId: string,
  patch: Partial<AssetGroupUpsert>,
): Promise<AssetGroup | null> {
  const pool = getCyberPool();
  const sets: string[] = [];
  const params: unknown[] = [id, ownerId];
  let i = 3;
  if (patch.name !== undefined)        { sets.push(`name = $${i++}`);        params.push(patch.name); }
  if (patch.description !== undefined) { sets.push(`description = $${i++}`); params.push(patch.description); }
  if (patch.tags !== undefined)        { sets.push(`tags = $${i++}`);        params.push(patch.tags); }
  if (sets.length === 0) {
    const detail = await getAssetGroup(id, ownerId);
    return detail
      ? { id: detail.id, ownerId: detail.ownerId, name: detail.name, description: detail.description, tags: detail.tags, memberCount: detail.memberCount, createdAt: detail.createdAt, updatedAt: detail.updatedAt }
      : null;
  }
  sets.push(`updated_at = now()`);
  await pool.query(
    `UPDATE agos_cyber_asset_groups
        SET ${sets.join(', ')}
      WHERE id = $1 AND owner_id = $2`,
    params,
  );
  const detail = await getAssetGroup(id, ownerId);
  return detail
    ? { id: detail.id, ownerId: detail.ownerId, name: detail.name, description: detail.description, tags: detail.tags, memberCount: detail.memberCount, createdAt: detail.createdAt, updatedAt: detail.updatedAt }
    : null;
}

export async function deleteAssetGroup(id: string, ownerId: string): Promise<boolean> {
  const pool = getCyberPool();
  const r = await pool.query(
    `DELETE FROM agos_cyber_asset_groups WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function addAssetToGroup(args: {
  groupId: string;
  assetId: string;
  ownerId: string;
}): Promise<boolean> {
  const pool = getCyberPool();
  // Verify both group and asset belong to this owner before linking.
  const check = await pool.query(
    `SELECT
       (SELECT 1 FROM agos_cyber_asset_groups WHERE id = $1 AND owner_id = $3) AS g_ok,
       (SELECT 1 FROM agos_cyber_assets       WHERE id = $2 AND owner_id = $3) AS a_ok`,
    [args.groupId, args.assetId, args.ownerId],
  );
  const row = check.rows[0];
  if (!row || !row.g_ok || !row.a_ok) return false;

  await pool.query(
    `INSERT INTO agos_cyber_asset_group_members (group_id, asset_id)
     VALUES ($1, $2)
     ON CONFLICT (group_id, asset_id) DO NOTHING`,
    [args.groupId, args.assetId],
  );
  return true;
}

export async function removeAssetFromGroup(args: {
  groupId: string;
  assetId: string;
  ownerId: string;
}): Promise<boolean> {
  const pool = getCyberPool();
  const r = await pool.query(
    `DELETE FROM agos_cyber_asset_group_members m
      USING agos_cyber_asset_groups g
      WHERE m.group_id = $1
        AND m.asset_id = $2
        AND g.id = m.group_id
        AND g.owner_id = $3`,
    [args.groupId, args.assetId, args.ownerId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Log sources ───────────────────────────────────────────────────────────

function rowToLogSource(row: any): LogSource {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    kind: row.kind as LogSourceKind,
    vendor: row.vendor ?? null,
    endpointHint: row.endpoint_hint ?? null,
    status: row.status as LogSourceStatus,
    notes: row.notes ?? null,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const LOG_SOURCE_COLS = `
  id, owner_id, name, kind, vendor, endpoint_hint, status, notes, metadata,
  created_at, updated_at
`;

export interface ListLogSourcesArgs {
  ownerId: string;
  status?: LogSourceStatus;
  kind?: LogSourceKind;
}

export async function listLogSources(args: ListLogSourcesArgs): Promise<LogSource[]> {
  const pool = getCyberPool();
  const where: string[] = [`owner_id = $1`];
  const params: unknown[] = [args.ownerId];
  let i = 2;
  if (args.status) { where.push(`status = $${i++}`); params.push(args.status); }
  if (args.kind)   { where.push(`kind = $${i++}`);   params.push(args.kind); }

  const r = await pool.query(
    `SELECT ${LOG_SOURCE_COLS}
       FROM agos_cyber_log_sources
      WHERE ${where.join(' AND ')}
      ORDER BY name ASC`,
    params,
  );
  return r.rows.map(rowToLogSource);
}

export async function getLogSource(id: string, ownerId: string): Promise<LogSource | null> {
  const pool = getCyberPool();
  const r = await pool.query(
    `SELECT ${LOG_SOURCE_COLS}
       FROM agos_cyber_log_sources
      WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToLogSource(r.rows[0]);
}

export async function createLogSource(
  ownerId: string,
  data: LogSourceUpsert,
): Promise<LogSource> {
  const pool = getCyberPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_cyber_log_sources
       (id, owner_id, name, kind, vendor, endpoint_hint, status, notes, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
    [
      id, ownerId, data.name, data.kind,
      data.vendor ?? null, data.endpointHint ?? null,
      data.status ?? 'active', data.notes ?? null,
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const s = await getLogSource(id, ownerId);
  if (!s) throw new Error('Failed to create log source');
  return s;
}

export async function updateLogSource(
  id: string,
  ownerId: string,
  patch: Partial<LogSourceUpsert>,
): Promise<LogSource | null> {
  const pool = getCyberPool();
  const sets: string[] = [];
  const params: unknown[] = [id, ownerId];
  let i = 3;
  if (patch.name !== undefined)         { sets.push(`name = $${i++}`);          params.push(patch.name); }
  if (patch.kind !== undefined)         { sets.push(`kind = $${i++}`);          params.push(patch.kind); }
  if (patch.vendor !== undefined)       { sets.push(`vendor = $${i++}`);        params.push(patch.vendor); }
  if (patch.endpointHint !== undefined) { sets.push(`endpoint_hint = $${i++}`); params.push(patch.endpointHint); }
  if (patch.status !== undefined)       { sets.push(`status = $${i++}`);        params.push(patch.status); }
  if (patch.notes !== undefined)        { sets.push(`notes = $${i++}`);         params.push(patch.notes); }
  if (patch.metadata !== undefined)     { sets.push(`metadata = $${i++}::jsonb`); params.push(JSON.stringify(patch.metadata)); }
  if (sets.length === 0) return getLogSource(id, ownerId);
  sets.push(`updated_at = now()`);
  await pool.query(
    `UPDATE agos_cyber_log_sources
        SET ${sets.join(', ')}
      WHERE id = $1 AND owner_id = $2`,
    params,
  );
  return getLogSource(id, ownerId);
}

export async function deleteLogSource(id: string, ownerId: string): Promise<boolean> {
  const pool = getCyberPool();
  const r = await pool.query(
    `DELETE FROM agos_cyber_log_sources WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Dashboard stats ───────────────────────────────────────────────────────

export interface CyberDashboardStats {
  openAlerts: number;
  criticalAlerts: number;
  totalAssets: number;
  criticalAssets: number;
  activeLogSources: number;
  alertsLast24h: number;
  alertsLast7d: number;
}

export async function getCyberDashboardStats(
  ownerId: string,
): Promise<CyberDashboardStats> {
  const pool = getCyberPool();
  const r = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM agos_cyber_alerts
          WHERE owner_id = $1 AND status IN ('open','investigating'))           AS open_alerts,
       (SELECT COUNT(*) FROM agos_cyber_alerts
          WHERE owner_id = $1 AND severity = 'critical'
            AND status IN ('open','investigating'))                             AS critical_alerts,
       (SELECT COUNT(*) FROM agos_cyber_assets
          WHERE owner_id = $1 AND decommissioned_at IS NULL)                    AS total_assets,
       (SELECT COUNT(*) FROM agos_cyber_assets
          WHERE owner_id = $1 AND decommissioned_at IS NULL
            AND criticality = 'critical')                                       AS critical_assets,
       (SELECT COUNT(*) FROM agos_cyber_log_sources
          WHERE owner_id = $1 AND status = 'active')                            AS active_log_sources,
       (SELECT COUNT(*) FROM agos_cyber_alerts
          WHERE owner_id = $1 AND occurred_at >= now() - INTERVAL '24 hours')   AS alerts_24h,
       (SELECT COUNT(*) FROM agos_cyber_alerts
          WHERE owner_id = $1 AND occurred_at >= now() - INTERVAL '7 days')     AS alerts_7d`,
    [ownerId],
  );
  const row = r.rows[0] ?? {};
  return {
    openAlerts:       Number(row.open_alerts ?? 0),
    criticalAlerts:   Number(row.critical_alerts ?? 0),
    totalAssets:      Number(row.total_assets ?? 0),
    criticalAssets:   Number(row.critical_assets ?? 0),
    activeLogSources: Number(row.active_log_sources ?? 0),
    alertsLast24h:    Number(row.alerts_24h ?? 0),
    alertsLast7d:     Number(row.alerts_7d ?? 0),
  };
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

// ─── Cases ─────────────────────────────────────────────────────────────────

function rowToCase(row: any): Case {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    summary: row.summary ?? null,
    severity: row.severity as CaseSeverity,
    status: row.status as CaseStatus,
    priority: row.priority as CasePriority,
    assignedTo: row.assigned_to ?? null,
    tactic: row.tactic ?? null,
    technique: row.technique ?? null,
    tags: row.tags ?? [],
    closedAt: row.closed_at ? row.closed_at.toISOString() : null,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const CASE_COLS = `
  id, owner_id, title, summary, severity, status, priority, assigned_to,
  tactic, technique, tags, closed_at, metadata, created_at, updated_at
`;

export interface ListCasesArgs {
  ownerId: string;
  status?: CaseStatus;
  severity?: CaseSeverity;
  priority?: CasePriority;
  q?: string;
  limit?: number;
  offset?: number;
}

export async function listCases(args: ListCasesArgs): Promise<CaseWithCounts[]> {
  const pool = getCyberPool();
  const where: string[] = [`c.owner_id = $1`];
  const params: unknown[] = [args.ownerId];
  let i = 2;

  if (args.status)   { where.push(`c.status = $${i++}`);   params.push(args.status); }
  if (args.severity) { where.push(`c.severity = $${i++}`); params.push(args.severity); }
  if (args.priority) { where.push(`c.priority = $${i++}`); params.push(args.priority); }
  if (args.q && args.q.trim().length > 0) {
    where.push(`(c.title ILIKE $${i} OR c.summary ILIKE $${i} OR c.assigned_to ILIKE $${i})`);
    params.push(`%${args.q.trim()}%`);
    i++;
  }

  params.push(args.limit ?? 200);
  const limitIdx = i++;
  params.push(args.offset ?? 0);
  const offsetIdx = i++;

  const r = await pool.query(
    `SELECT c.id, c.owner_id, c.title, c.summary, c.severity, c.status, c.priority,
            c.assigned_to, c.tactic, c.technique, c.tags, c.closed_at, c.metadata,
            c.created_at, c.updated_at,
            (SELECT COUNT(*) FROM agos_cyber_case_alerts  WHERE case_id = c.id) AS alert_count,
            (SELECT COUNT(*) FROM agos_cyber_case_events  WHERE case_id = c.id) AS event_count,
            (SELECT COUNT(*) FROM agos_cyber_evidence     WHERE case_id = c.id) AS evidence_count,
            (SELECT COUNT(*) FROM agos_cyber_tasks        WHERE case_id = c.id AND status NOT IN ('done','cancelled')) AS open_task_count
       FROM agos_cyber_cases c
      WHERE ${where.join(' AND ')}
      ORDER BY
        CASE c.severity
          WHEN 'critical' THEN 0
          WHEN 'high'     THEN 1
          WHEN 'medium'   THEN 2
          ELSE                 3
        END,
        c.updated_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );
  return r.rows.map((row) => ({
    ...rowToCase(row),
    alertCount: Number(row.alert_count ?? 0),
    eventCount: Number(row.event_count ?? 0),
    evidenceCount: Number(row.evidence_count ?? 0),
    openTaskCount: Number(row.open_task_count ?? 0),
  }));
}

export async function getCase(id: string, ownerId: string): Promise<Case | null> {
  const pool = getCyberPool();
  const r = await pool.query(
    `SELECT ${CASE_COLS}
       FROM agos_cyber_cases
      WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToCase(r.rows[0]);
}

export async function getCaseDetail(
  id: string,
  ownerId: string,
): Promise<CaseDetail | null> {
  const c = await getCase(id, ownerId);
  if (!c) return null;
  const pool = getCyberPool();

  const [alertsR, eventsR, evidenceR, tasksR] = await Promise.all([
    pool.query(
      `SELECT a.id, a.title, a.severity, a.occurred_at
         FROM agos_cyber_alerts a
         JOIN agos_cyber_case_alerts ca ON ca.alert_id = a.id
        WHERE ca.case_id = $1 AND a.owner_id = $2
        ORDER BY a.occurred_at DESC`,
      [id, ownerId],
    ),
    pool.query(
      `SELECT id, case_id, kind, author, body, payload, created_at
         FROM agos_cyber_case_events
        WHERE case_id = $1
        ORDER BY created_at DESC`,
      [id],
    ),
    pool.query(
      `SELECT ${EVIDENCE_COLS}
         FROM agos_cyber_evidence
        WHERE case_id = $1
        ORDER BY collected_at DESC`,
      [id],
    ),
    pool.query(
      `SELECT ${TASK_COLS}
         FROM agos_cyber_tasks
        WHERE case_id = $1
        ORDER BY position ASC, created_at ASC`,
      [id],
    ),
  ]);

  return {
    ...c,
    linkedAlerts: alertsR.rows.map((row) => ({
      id: row.id,
      title: row.title,
      severity: row.severity,
      occurredAt: row.occurred_at.toISOString(),
    })),
    events: eventsR.rows.map(rowToCaseEvent),
    evidence: evidenceR.rows.map(rowToEvidence),
    tasks: tasksR.rows.map(rowToTask),
  };
}

export async function createCase(ownerId: string, data: CaseUpsert): Promise<Case> {
  const pool = getCyberPool();
  const id = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO agos_cyber_cases
         (id, owner_id, title, summary, severity, status, priority, assigned_to,
          tactic, technique, tags, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
      [
        id, ownerId,
        data.title, data.summary ?? null,
        data.severity ?? 'medium',
        data.status ?? 'open',
        data.priority ?? 'p3',
        data.assignedTo ?? null,
        data.tactic ?? null,
        data.technique ?? null,
        data.tags ?? [],
        JSON.stringify(data.metadata ?? {}),
      ],
    );
    if (data.assignedTo) {
      await insertCaseEvent(client, {
        caseId: id,
        kind: 'assignment_change',
        body: `Assigned to ${data.assignedTo}`,
        payload: { assignedTo: data.assignedTo },
      });
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  const c = await getCase(id, ownerId);
  if (!c) throw new Error('Failed to create case');
  return c;
}

export async function updateCase(
  id: string,
  ownerId: string,
  patch: CasePatch,
): Promise<Case | null> {
  const pool = getCyberPool();
  const before = await getCase(id, ownerId);
  if (!before) return null;

  const sets: string[] = [];
  const params: unknown[] = [id, ownerId];
  let i = 3;
  if (patch.title !== undefined)       { sets.push(`title = $${i++}`);       params.push(patch.title); }
  if (patch.summary !== undefined)     { sets.push(`summary = $${i++}`);     params.push(patch.summary); }
  if (patch.severity !== undefined)    { sets.push(`severity = $${i++}`);    params.push(patch.severity); }
  if (patch.status !== undefined)      { sets.push(`status = $${i++}`);      params.push(patch.status); }
  if (patch.priority !== undefined)    { sets.push(`priority = $${i++}`);    params.push(patch.priority); }
  if (patch.assignedTo !== undefined)  { sets.push(`assigned_to = $${i++}`); params.push(patch.assignedTo); }
  if (patch.tactic !== undefined)      { sets.push(`tactic = $${i++}`);      params.push(patch.tactic); }
  if (patch.technique !== undefined)   { sets.push(`technique = $${i++}`);   params.push(patch.technique); }
  if (patch.tags !== undefined)        { sets.push(`tags = $${i++}`);        params.push(patch.tags); }
  if (patch.metadata !== undefined)    { sets.push(`metadata = $${i++}::jsonb`); params.push(JSON.stringify(patch.metadata)); }

  const movingToClosed =
    patch.status !== undefined &&
    (patch.status === 'closed' || patch.status === 'false_positive') &&
    before.status !== 'closed' &&
    before.status !== 'false_positive';
  const movingOffClosed =
    patch.status !== undefined &&
    patch.status !== 'closed' &&
    patch.status !== 'false_positive' &&
    (before.status === 'closed' || before.status === 'false_positive');

  if (movingToClosed) sets.push(`closed_at = now()`);
  if (movingOffClosed) sets.push(`closed_at = NULL`);

  if (sets.length === 0) return before;

  sets.push(`updated_at = now()`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE agos_cyber_cases
          SET ${sets.join(', ')}
        WHERE id = $1 AND owner_id = $2`,
      params,
    );

    if (patch.status !== undefined && patch.status !== before.status) {
      await insertCaseEvent(client, {
        caseId: id,
        kind: 'status_change',
        body: `Status: ${before.status} → ${patch.status}`,
        payload: { from: before.status, to: patch.status },
      });
    }
    if (patch.severity !== undefined && patch.severity !== before.severity) {
      await insertCaseEvent(client, {
        caseId: id,
        kind: 'severity_change',
        body: `Severity: ${before.severity} → ${patch.severity}`,
        payload: { from: before.severity, to: patch.severity },
      });
    }
    if (patch.priority !== undefined && patch.priority !== before.priority) {
      await insertCaseEvent(client, {
        caseId: id,
        kind: 'priority_change',
        body: `Priority: ${before.priority} → ${patch.priority}`,
        payload: { from: before.priority, to: patch.priority },
      });
    }
    if (patch.assignedTo !== undefined && patch.assignedTo !== before.assignedTo) {
      await insertCaseEvent(client, {
        caseId: id,
        kind: 'assignment_change',
        body: patch.assignedTo
          ? `Assigned to ${patch.assignedTo}`
          : `Unassigned (was ${before.assignedTo ?? '—'})`,
        payload: { from: before.assignedTo, to: patch.assignedTo },
      });
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return getCase(id, ownerId);
}

export async function deleteCase(id: string, ownerId: string): Promise<boolean> {
  const pool = getCyberPool();
  const r = await pool.query(
    `DELETE FROM agos_cyber_cases WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Case events ───────────────────────────────────────────────────────────

function rowToCaseEvent(row: any): CaseEvent {
  return {
    id: row.id,
    caseId: row.case_id,
    kind: row.kind as CaseEventKind,
    author: row.author ?? null,
    body: row.body ?? null,
    payload: row.payload ?? {},
    createdAt: row.created_at.toISOString(),
  };
}

interface PgLike {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[]; rowCount: number | null }>;
}

async function insertCaseEvent(
  client: PgLike,
  args: {
    caseId: string;
    kind: CaseEventKind;
    author?: string | null;
    body?: string | null;
    payload?: Record<string, unknown>;
  },
): Promise<CaseEvent> {
  const id = randomUUID();
  const r = await client.query(
    `INSERT INTO agos_cyber_case_events
       (id, case_id, kind, author, body, payload)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)
     RETURNING id, case_id, kind, author, body, payload, created_at`,
    [
      id, args.caseId, args.kind,
      args.author ?? null,
      args.body ?? null,
      JSON.stringify(args.payload ?? {}),
    ],
  );
  return rowToCaseEvent(r.rows[0]);
}

export async function listCaseEvents(
  caseId: string,
  ownerId: string,
  limit = 200,
): Promise<CaseEvent[]> {
  const pool = getCyberPool();
  const r = await pool.query(
    `SELECT e.id, e.case_id, e.kind, e.author, e.body, e.payload, e.created_at
       FROM agos_cyber_case_events e
       JOIN agos_cyber_cases c ON c.id = e.case_id
      WHERE e.case_id = $1 AND c.owner_id = $2
      ORDER BY e.created_at DESC
      LIMIT $3`,
    [caseId, ownerId, limit],
  );
  return r.rows.map(rowToCaseEvent);
}

export async function appendCaseEvent(args: {
  caseId: string;
  ownerId: string;
  kind: CaseEventKind;
  author?: string | null;
  body?: string | null;
  payload?: Record<string, unknown>;
}): Promise<CaseEvent | null> {
  const pool = getCyberPool();
  const own = await pool.query(
    `SELECT 1 FROM agos_cyber_cases WHERE id = $1 AND owner_id = $2`,
    [args.caseId, args.ownerId],
  );
  if ((own.rowCount ?? 0) === 0) return null;
  return insertCaseEvent(pool, {
    caseId: args.caseId,
    kind: args.kind,
    author: args.author,
    body: args.body,
    payload: args.payload,
  });
}

// ─── Case ↔ alert N:N ──────────────────────────────────────────────────────

export async function attachAlertToCase(args: {
  caseId: string;
  alertId: string;
  ownerId: string;
}): Promise<boolean> {
  const pool = getCyberPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const check = await client.query(
      `SELECT
         (SELECT title FROM agos_cyber_cases  WHERE id = $1 AND owner_id = $3) AS case_title,
         (SELECT title FROM agos_cyber_alerts WHERE id = $2 AND owner_id = $3) AS alert_title`,
      [args.caseId, args.alertId, args.ownerId],
    );
    const row = check.rows[0];
    if (!row || !row.case_title || !row.alert_title) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query(
      `INSERT INTO agos_cyber_case_alerts (case_id, alert_id)
       VALUES ($1, $2)
       ON CONFLICT (case_id, alert_id) DO NOTHING`,
      [args.caseId, args.alertId],
    );
    await insertCaseEvent(client, {
      caseId: args.caseId,
      kind: 'alert_attached',
      body: `Alert attached: ${row.alert_title}`,
      payload: { alertId: args.alertId, title: row.alert_title },
    });
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function detachAlertFromCase(args: {
  caseId: string;
  alertId: string;
  ownerId: string;
}): Promise<boolean> {
  const pool = getCyberPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const own = await client.query(
      `SELECT 1 FROM agos_cyber_cases WHERE id = $1 AND owner_id = $2`,
      [args.caseId, args.ownerId],
    );
    if ((own.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return false;
    }
    const del = await client.query(
      `DELETE FROM agos_cyber_case_alerts WHERE case_id = $1 AND alert_id = $2`,
      [args.caseId, args.alertId],
    );
    if ((del.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return false;
    }
    await insertCaseEvent(client, {
      caseId: args.caseId,
      kind: 'alert_detached',
      body: `Alert detached`,
      payload: { alertId: args.alertId },
    });
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listLinkedAlerts(
  caseId: string,
  ownerId: string,
): Promise<Alert[]> {
  const pool = getCyberPool();
  const r = await pool.query(
    `SELECT ${ALERT_COLS.split(',').map((c) => `a.${c.trim()}`).join(', ')}
       FROM agos_cyber_alerts a
       JOIN agos_cyber_case_alerts ca ON ca.alert_id = a.id
       JOIN agos_cyber_cases c        ON c.id = ca.case_id
      WHERE ca.case_id = $1 AND c.owner_id = $2 AND a.owner_id = $2
      ORDER BY a.occurred_at DESC`,
    [caseId, ownerId],
  );
  return r.rows.map(rowToAlert);
}

// ─── Evidence ──────────────────────────────────────────────────────────────

function rowToEvidence(row: any): Evidence {
  return {
    id: row.id,
    caseId: row.case_id,
    kind: row.kind as EvidenceKind,
    title: row.title,
    description: row.description ?? null,
    url: row.url ?? null,
    content: row.content ?? null,
    mimeType: row.mime_type ?? null,
    sha256: row.sha256 ?? null,
    collectedAt: row.collected_at.toISOString(),
    collectedBy: row.collected_by ?? null,
    tags: row.tags ?? [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const EVIDENCE_COLS = `
  id, case_id, kind, title, description, url, content, mime_type, sha256,
  collected_at, collected_by, tags, metadata, created_at, updated_at
`;

export async function listEvidence(
  caseId: string,
  ownerId: string,
): Promise<Evidence[]> {
  const pool = getCyberPool();
  const r = await pool.query(
    `SELECT ${EVIDENCE_COLS.split(',').map((c) => `e.${c.trim()}`).join(', ')}
       FROM agos_cyber_evidence e
       JOIN agos_cyber_cases c ON c.id = e.case_id
      WHERE e.case_id = $1 AND c.owner_id = $2
      ORDER BY e.collected_at DESC`,
    [caseId, ownerId],
  );
  return r.rows.map(rowToEvidence);
}

export async function getEvidence(
  id: string,
  ownerId: string,
): Promise<Evidence | null> {
  const pool = getCyberPool();
  const r = await pool.query(
    `SELECT ${EVIDENCE_COLS.split(',').map((c) => `e.${c.trim()}`).join(', ')}
       FROM agos_cyber_evidence e
       JOIN agos_cyber_cases c ON c.id = e.case_id
      WHERE e.id = $1 AND c.owner_id = $2`,
    [id, ownerId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToEvidence(r.rows[0]);
}

export async function addEvidence(args: { ownerId: string } & EvidenceUpsert): Promise<Evidence | null> {
  const pool = getCyberPool();
  const own = await pool.query(
    `SELECT 1 FROM agos_cyber_cases WHERE id = $1 AND owner_id = $2`,
    [args.caseId, args.ownerId],
  );
  if ((own.rowCount ?? 0) === 0) return null;

  const id = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO agos_cyber_evidence
         (id, case_id, kind, title, description, url, content, mime_type, sha256,
          collected_at, collected_by, tags, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
      [
        id, args.caseId, args.kind, args.title,
        args.description ?? null,
        args.url ?? null,
        args.content ?? null,
        args.mimeType ?? null,
        args.sha256 ?? null,
        args.collectedAt ? new Date(args.collectedAt) : new Date(),
        args.collectedBy ?? null,
        args.tags ?? [],
        JSON.stringify(args.metadata ?? {}),
      ],
    );
    await insertCaseEvent(client, {
      caseId: args.caseId,
      kind: 'evidence_added',
      body: `Evidence: ${args.title}`,
      payload: { evidenceId: id, title: args.title, kind: args.kind },
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return getEvidence(id, args.ownerId);
}

export async function updateEvidence(
  args: { id: string; ownerId: string } & Partial<EvidencePatch>,
): Promise<Evidence | null> {
  const pool = getCyberPool();
  const existing = await getEvidence(args.id, args.ownerId);
  if (!existing) return null;

  const sets: string[] = [];
  const params: unknown[] = [args.id];
  let i = 2;
  if (args.kind !== undefined)        { sets.push(`kind = $${i++}`);        params.push(args.kind); }
  if (args.title !== undefined)       { sets.push(`title = $${i++}`);       params.push(args.title); }
  if (args.description !== undefined) { sets.push(`description = $${i++}`); params.push(args.description); }
  if (args.url !== undefined)         { sets.push(`url = $${i++}`);         params.push(args.url); }
  if (args.content !== undefined)     { sets.push(`content = $${i++}`);     params.push(args.content); }
  if (args.mimeType !== undefined)    { sets.push(`mime_type = $${i++}`);   params.push(args.mimeType); }
  if (args.sha256 !== undefined)      { sets.push(`sha256 = $${i++}`);      params.push(args.sha256); }
  if (args.collectedAt !== undefined) { sets.push(`collected_at = $${i++}`); params.push(new Date(args.collectedAt)); }
  if (args.collectedBy !== undefined) { sets.push(`collected_by = $${i++}`); params.push(args.collectedBy); }
  if (args.tags !== undefined)        { sets.push(`tags = $${i++}`);        params.push(args.tags); }
  if (args.metadata !== undefined)    { sets.push(`metadata = $${i++}::jsonb`); params.push(JSON.stringify(args.metadata)); }

  if (sets.length === 0) return existing;
  sets.push(`updated_at = now()`);
  await pool.query(
    `UPDATE agos_cyber_evidence SET ${sets.join(', ')} WHERE id = $1`,
    params,
  );
  return getEvidence(args.id, args.ownerId);
}

export async function deleteEvidence(id: string, ownerId: string): Promise<boolean> {
  const pool = getCyberPool();
  const existing = await getEvidence(id, ownerId);
  if (!existing) return false;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await insertCaseEvent(client, {
      caseId: existing.caseId,
      kind: 'evidence_removed',
      body: `Evidence removed: ${existing.title}`,
      payload: { evidenceId: id, title: existing.title },
    });
    await client.query(`DELETE FROM agos_cyber_evidence WHERE id = $1`, [id]);
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Tasks ─────────────────────────────────────────────────────────────────

function rowToTask(row: any): Task {
  return {
    id: row.id,
    caseId: row.case_id,
    title: row.title,
    description: row.description ?? null,
    status: row.status as TaskStatus,
    assignedTo: row.assigned_to ?? null,
    priority: row.priority,
    dueAt: row.due_at ? row.due_at.toISOString() : null,
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    position: row.position,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const TASK_COLS = `
  id, case_id, title, description, status, assigned_to, priority,
  due_at, completed_at, position, created_at, updated_at
`;

export async function listTasks(caseId: string, ownerId: string): Promise<Task[]> {
  const pool = getCyberPool();
  const r = await pool.query(
    `SELECT ${TASK_COLS.split(',').map((c) => `t.${c.trim()}`).join(', ')}
       FROM agos_cyber_tasks t
       JOIN agos_cyber_cases c ON c.id = t.case_id
      WHERE t.case_id = $1 AND c.owner_id = $2
      ORDER BY t.position ASC, t.created_at ASC`,
    [caseId, ownerId],
  );
  return r.rows.map(rowToTask);
}

export async function getTask(id: string, ownerId: string): Promise<Task | null> {
  const pool = getCyberPool();
  const r = await pool.query(
    `SELECT ${TASK_COLS.split(',').map((c) => `t.${c.trim()}`).join(', ')}
       FROM agos_cyber_tasks t
       JOIN agos_cyber_cases c ON c.id = t.case_id
      WHERE t.id = $1 AND c.owner_id = $2`,
    [id, ownerId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToTask(r.rows[0]);
}

export async function addTask(
  args: { ownerId: string } & TaskUpsert,
): Promise<Task | null> {
  const pool = getCyberPool();
  const own = await pool.query(
    `SELECT 1 FROM agos_cyber_cases WHERE id = $1 AND owner_id = $2`,
    [args.caseId, args.ownerId],
  );
  if ((own.rowCount ?? 0) === 0) return null;

  const id = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let position = args.position;
    if (position === undefined) {
      const m = await client.query(
        `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM agos_cyber_tasks WHERE case_id = $1`,
        [args.caseId],
      );
      position = Number(m.rows[0]?.next ?? 0);
    }

    await client.query(
      `INSERT INTO agos_cyber_tasks
         (id, case_id, title, description, status, assigned_to, priority,
          due_at, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id, args.caseId, args.title,
        args.description ?? null,
        args.status ?? 'open',
        args.assignedTo ?? null,
        args.priority ?? 'medium',
        args.dueAt ? new Date(args.dueAt) : null,
        position,
      ],
    );
    await insertCaseEvent(client, {
      caseId: args.caseId,
      kind: 'task_added',
      body: `Task added: ${args.title}`,
      payload: { taskId: id, title: args.title },
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return getTask(id, args.ownerId);
}

export async function updateTask(
  args: { id: string; ownerId: string } & Partial<TaskPatch>,
): Promise<Task | null> {
  const pool = getCyberPool();
  const before = await getTask(args.id, args.ownerId);
  if (!before) return null;

  const sets: string[] = [];
  const params: unknown[] = [args.id];
  let i = 2;
  if (args.title !== undefined)       { sets.push(`title = $${i++}`);       params.push(args.title); }
  if (args.description !== undefined) { sets.push(`description = $${i++}`); params.push(args.description); }
  if (args.status !== undefined)      { sets.push(`status = $${i++}`);      params.push(args.status); }
  if (args.assignedTo !== undefined)  { sets.push(`assigned_to = $${i++}`); params.push(args.assignedTo); }
  if (args.priority !== undefined)    { sets.push(`priority = $${i++}`);    params.push(args.priority); }
  if (args.dueAt !== undefined)       { sets.push(`due_at = $${i++}`);      params.push(args.dueAt ? new Date(args.dueAt) : null); }
  if (args.position !== undefined)    { sets.push(`position = $${i++}`);    params.push(args.position); }

  const movingToDone =
    args.status !== undefined && args.status === 'done' && before.status !== 'done';
  const movingOffDone =
    args.status !== undefined && args.status !== 'done' && before.status === 'done';

  if (movingToDone) sets.push(`completed_at = now()`);
  if (movingOffDone) sets.push(`completed_at = NULL`);
  if (args.completedAt !== undefined && !movingToDone && !movingOffDone) {
    sets.push(`completed_at = $${i++}`);
    params.push(args.completedAt ? new Date(args.completedAt) : null);
  }

  if (sets.length === 0) return before;
  sets.push(`updated_at = now()`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE agos_cyber_tasks SET ${sets.join(', ')} WHERE id = $1`,
      params,
    );
    if (movingToDone) {
      await insertCaseEvent(client, {
        caseId: before.caseId,
        kind: 'task_completed',
        body: `Task completed: ${before.title}`,
        payload: { taskId: args.id, title: before.title },
      });
    } else if (movingOffDone) {
      await insertCaseEvent(client, {
        caseId: before.caseId,
        kind: 'task_reopened',
        body: `Task reopened: ${before.title}`,
        payload: { taskId: args.id, title: before.title },
      });
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return getTask(args.id, args.ownerId);
}

export async function deleteTask(id: string, ownerId: string): Promise<boolean> {
  const pool = getCyberPool();
  const r = await pool.query(
    `DELETE FROM agos_cyber_tasks t
      USING agos_cyber_cases c
      WHERE t.id = $1 AND c.id = t.case_id AND c.owner_id = $2`,
    [id, ownerId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function reorderTasks(
  caseId: string,
  ownerId: string,
  orderedTaskIds: string[],
): Promise<boolean> {
  const pool = getCyberPool();
  const own = await pool.query(
    `SELECT 1 FROM agos_cyber_cases WHERE id = $1 AND owner_id = $2`,
    [caseId, ownerId],
  );
  if ((own.rowCount ?? 0) === 0) return false;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < orderedTaskIds.length; i++) {
      await client.query(
        `UPDATE agos_cyber_tasks
            SET position = $1, updated_at = now()
          WHERE id = $2 AND case_id = $3`,
        [i, orderedTaskIds[i], caseId],
      );
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ===========================================================================
// Phase 3: Detection rules + playbook runner
// ===========================================================================

import type {
  DetectionRule,
  DetectionRulePatch,
  DetectionRuleUpsert,
  DetectionRun,
  DetectionRunInsert,
  DetectionLifecycle,
  DetectionSeverity,
} from './detections';
import type {
  Playbook,
  PlaybookPatch,
  PlaybookRun,
  PlaybookRunDetail,
  PlaybookRunStatus,
  PlaybookStep,
  PlaybookStepRun,
  PlaybookStepRunStatus,
  PlaybookUpsert,
} from './playbooks';

// ----- Detection rules -----

function rowToDetectionRule(row: any): DetectionRule {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description ?? null,
    author: row.author ?? null,
    lifecycle: row.lifecycle as DetectionLifecycle,
    severity: row.severity as DetectionSeverity,
    tactic: row.tactic ?? null,
    technique: row.technique ?? null,
    logSourceKind: row.log_source_kind ?? null,
    detection: row.detection ?? {},
    falsePositives: row.false_positives ?? [],
    references: row.references ?? [],
    tags: row.tags ?? [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const DETECTION_RULE_COLS = `id, owner_id, name, description, author, lifecycle, severity, tactic, technique, log_source_kind, detection, false_positives, "references", tags, metadata, created_at, updated_at`;

export interface ListDetectionRulesArgs {
  ownerId: string;
  lifecycle?: DetectionLifecycle;
  severity?: DetectionSeverity;
  q?: string;
  limit?: number;
  offset?: number;
}

export async function listDetectionRules(args: ListDetectionRulesArgs): Promise<DetectionRule[]> {
  const pool = getCyberPool();
  const { ownerId, lifecycle, severity, q, limit = 200, offset = 0 } = args;
  let sql = `SELECT ${DETECTION_RULE_COLS} FROM agos_cyber_detection_rules WHERE owner_id = $1`;
  const params: any[] = [ownerId];
  let paramIndex = 2;

  if (lifecycle) {
    sql += ` AND lifecycle = $${paramIndex++}`;
    params.push(lifecycle);
  }
  if (severity) {
    sql += ` AND severity = $${paramIndex++}`;
    params.push(severity);
  }
  if (q) {
    sql += ` AND (name ILIKE $${paramIndex++} OR description ILIKE $${paramIndex++})`;
    params.push(`%${q}%`, `%${q}%`);
  }
  sql += ` ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END, updated_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const res = await pool.query(sql, params);
  return res.rows.map(rowToDetectionRule);
}

export async function getDetectionRule(id: string, ownerId: string): Promise<DetectionRule | null> {
  const pool = getCyberPool();
  const res = await pool.query(
    `SELECT ${DETECTION_RULE_COLS} FROM agos_cyber_detection_rules WHERE id = $1 AND owner_id = $2`,
    [id, ownerId]
  );
  return res.rows.length ? rowToDetectionRule(res.rows[0]) : null;
}

export async function createDetectionRule(ownerId: string, data: DetectionRuleUpsert): Promise<DetectionRule> {
  const pool = getCyberPool();
  const id = randomUUID();
  const res = await pool.query(
    `INSERT INTO agos_cyber_detection_rules (id, owner_id, name, description, author, lifecycle, severity, tactic, technique, log_source_kind, detection, false_positives, "references", tags, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15::jsonb)
     RETURNING id, owner_id, name, description, author, lifecycle, severity, tactic, technique, log_source_kind, detection, false_positives, "references", tags, metadata, created_at, updated_at`,
    [
      id,
      ownerId,
      data.name,
      data.description ?? null,
      data.author ?? null,
      data.lifecycle ?? 'draft',
      data.severity ?? 'medium',
      data.tactic ?? null,
      data.technique ?? null,
      data.logSourceKind ?? null,
      JSON.stringify(data.detection ?? {}),
      data.falsePositives ?? [],
      data.references ?? [],
      data.tags ?? [],
      JSON.stringify(data.metadata ?? {})
    ]
  );
  return rowToDetectionRule(res.rows[0]);
}

export async function updateDetectionRule(id: string, ownerId: string, patch: DetectionRulePatch): Promise<DetectionRule | null> {
  const pool = getCyberPool();
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (patch.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(patch.name);
  }
  if (patch.description !== undefined) {
    fields.push(`description = $${paramIndex++}`);
    values.push(patch.description);
  }
  if (patch.author !== undefined) {
    fields.push(`author = $${paramIndex++}`);
    values.push(patch.author);
  }
  if (patch.lifecycle !== undefined) {
    fields.push(`lifecycle = $${paramIndex++}`);
    values.push(patch.lifecycle);
  }
  if (patch.severity !== undefined) {
    fields.push(`severity = $${paramIndex++}`);
    values.push(patch.severity);
  }
  if (patch.tactic !== undefined) {
    fields.push(`tactic = $${paramIndex++}`);
    values.push(patch.tactic);
  }
  if (patch.technique !== undefined) {
    fields.push(`technique = $${paramIndex++}`);
    values.push(patch.technique);
  }
  if (patch.logSourceKind !== undefined) {
    fields.push(`log_source_kind = $${paramIndex++}`);
    values.push(patch.logSourceKind);
  }
  if (patch.detection !== undefined) {
    fields.push(`detection = $${paramIndex++}::jsonb`);
    values.push(JSON.stringify(patch.detection));
  }
  if (patch.falsePositives !== undefined) {
    fields.push(`false_positives = $${paramIndex++}`);
    values.push(patch.falsePositives);
  }
  if (patch.references !== undefined) {
    fields.push(`"references" = $${paramIndex++}`);
    values.push(patch.references);
  }
  if (patch.tags !== undefined) {
    fields.push(`tags = $${paramIndex++}`);
    values.push(patch.tags);
  }
  if (patch.metadata !== undefined) {
    fields.push(`metadata = $${paramIndex++}::jsonb`);
    values.push(JSON.stringify(patch.metadata));
  }

  if (fields.length === 0) {
    return getDetectionRule(id, ownerId);
  }

  const whereIdIdx = paramIndex++;
  const whereOwnerIdIdx = paramIndex++;
  values.push(id, ownerId);

  const res = await pool.query(
    `UPDATE agos_cyber_detection_rules SET ${fields.join(', ')} WHERE id = $${whereIdIdx} AND owner_id = $${whereOwnerIdIdx} RETURNING ${DETECTION_RULE_COLS}`,
    values
  );

  return res.rows.length ? rowToDetectionRule(res.rows[0]) : null;
}

export async function deleteDetectionRule(id: string, ownerId: string): Promise<boolean> {
  const pool = getCyberPool();
  const res = await pool.query(
    'DELETE FROM agos_cyber_detection_rules WHERE id = $1 AND owner_id = $2',
    [id, ownerId]
  );
  return (res.rowCount ?? 0) > 0;
}

// ----- Detection runs -----

function rowToDetectionRun(row: any): DetectionRun {
  return {
    id: row.id,
    ruleId: row.rule_id,
    alertId: row.alert_id ?? null,
    triggeredAt: row.triggered_at.toISOString(),
    payload: row.payload ?? {},
    createdAt: row.created_at.toISOString(),
  };
}

export async function listDetectionRuns(args: { ruleId: string; ownerId: string; limit?: number }): Promise<DetectionRun[]> {
  const pool = getCyberPool();
  const { ruleId, ownerId, limit = 100 } = args;
  const res = await pool.query(
    `
    SELECT dr.id, dr.rule_id, dr.alert_id, dr.triggered_at, dr.payload, dr.created_at
    FROM agos_cyber_detection_runs dr
    JOIN agos_cyber_detection_rules drr ON drr.id = dr.rule_id
    WHERE dr.rule_id = $1 AND drr.owner_id = $2
    ORDER BY dr.triggered_at DESC
    LIMIT $3
    `,
    [ruleId, ownerId, limit]
  );
  return res.rows.map(rowToDetectionRun);
}

export async function recordDetectionRun(args: {
  ownerId: string;
  ruleId: string;
  alertId?: string | null;
  payload?: Record<string, unknown>;
  triggeredAt?: string
}): Promise<DetectionRun | null> {
  const pool = getCyberPool();
  const { ownerId, ruleId, alertId, payload, triggeredAt } = args;
  const id = randomUUID();
  const effectiveTriggeredAt = triggeredAt ?? new Date().toISOString();

  const checkRes = await pool.query(
    'SELECT 1 FROM agos_cyber_detection_rules WHERE id = $1 AND owner_id = $2',
    [ruleId, ownerId]
  );
  if ((checkRes.rowCount ?? 0) === 0) {
    return null;
  }

  const res = await pool.query(
    `INSERT INTO agos_cyber_detection_runs (id, rule_id, alert_id, triggered_at, payload)
     VALUES ($1,$2,$3,$4,$5::jsonb)
     RETURNING id, rule_id, alert_id, triggered_at, payload, created_at`,
    [id, ruleId, alertId ?? null, effectiveTriggeredAt, JSON.stringify(payload ?? {})]
  );

  return rowToDetectionRun(res.rows[0]);
}

// ----- Playbooks -----

function rowToPlaybook(row: any): Playbook {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    category: row.category ?? null,
    description: row.description ?? null,
    lifecycle: row.lifecycle as 'draft' | 'testing' | 'active' | 'deprecated' | 'archived',
    tactic: row.tactic ?? null,
    steps: row.steps ?? [],
    tags: row.tags ?? [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const PLAYBOOK_COLS = `id, owner_id, name, category, description, lifecycle, tactic, steps, tags, metadata, created_at, updated_at`;

export interface ListPlaybooksArgs {
  ownerId: string;
  lifecycle?: 'draft' | 'testing' | 'active' | 'deprecated' | 'archived';
  q?: string;
}

export async function listPlaybooks(args: ListPlaybooksArgs): Promise<Playbook[]> {
  const pool = getCyberPool();
  const { ownerId, lifecycle, q } = args;
  let sql = `SELECT ${PLAYBOOK_COLS} FROM agos_cyber_playbooks WHERE owner_id = $1`;
  const params: any[] = [ownerId];
  let paramIndex = 2;

  if (lifecycle) {
    sql += ` AND lifecycle = $${paramIndex++}`;
    params.push(lifecycle);
  }
  if (q) {
    sql += ` AND (name ILIKE $${paramIndex++} OR description ILIKE $${paramIndex++})`;
    params.push(`%${q}%`, `%${q}%`);
  }
  sql += ` ORDER BY name ASC`;
  const res = await pool.query(sql, params);
  return res.rows.map(rowToPlaybook);
}

export async function getPlaybook(id: string, ownerId: string): Promise<Playbook | null> {
  const pool = getCyberPool();
  const res = await pool.query(
    `SELECT ${PLAYBOOK_COLS} FROM agos_cyber_playbooks WHERE id = $1 AND owner_id = $2`,
    [id, ownerId]
  );
  return res.rows.length ? rowToPlaybook(res.rows[0]) : null;
}

export async function createPlaybook(ownerId: string, data: PlaybookUpsert): Promise<Playbook> {
  const pool = getCyberPool();
  const id = randomUUID();
  const res = await pool.query(
    `INSERT INTO agos_cyber_playbooks (id, owner_id, name, category, description, lifecycle, tactic, steps, tags, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb)
     RETURNING id, owner_id, name, category, description, lifecycle, tactic, steps, tags, metadata, created_at, updated_at`,
    [
      id,
      ownerId,
      data.name,
      data.category ?? null,
      data.description ?? null,
      data.lifecycle ?? 'active',
      data.tactic ?? null,
      JSON.stringify(data.steps ?? []),
      data.tags ?? [],
      JSON.stringify(data.metadata ?? {})
    ]
  );
  return rowToPlaybook(res.rows[0]);
}

export async function updatePlaybook(id: string, ownerId: string, patch: PlaybookPatch): Promise<Playbook | null> {
  const pool = getCyberPool();
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (patch.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(patch.name);
  }
  if (patch.category !== undefined) {
    fields.push(`category = $${paramIndex++}`);
    values.push(patch.category);
  }
  if (patch.description !== undefined) {
    fields.push(`description = $${paramIndex++}`);
    values.push(patch.description);
  }
  if (patch.lifecycle !== undefined) {
    fields.push(`lifecycle = $${paramIndex++}`);
    values.push(patch.lifecycle);
  }
  if (patch.tactic !== undefined) {
    fields.push(`tactic = $${paramIndex++}`);
    values.push(patch.tactic);
  }
  if (patch.steps !== undefined) {
    fields.push(`steps = $${paramIndex++}::jsonb`);
    values.push(JSON.stringify(patch.steps));
  }
  if (patch.tags !== undefined) {
    fields.push(`tags = $${paramIndex++}`);
    values.push(patch.tags);
  }
  if (patch.metadata !== undefined) {
    fields.push(`metadata = $${paramIndex++}::jsonb`);
    values.push(JSON.stringify(patch.metadata));
  }

  if (fields.length === 0) {
    return getPlaybook(id, ownerId);
  }

  const whereIdIdx = paramIndex++;
  const whereOwnerIdIdx = paramIndex++;
  values.push(id, ownerId);

  const res = await pool.query(
    `UPDATE agos_cyber_playbooks SET ${fields.join(', ')} WHERE id = $${whereIdIdx} AND owner_id = $${whereOwnerIdIdx} RETURNING ${PLAYBOOK_COLS}`,
    values
  );

  return res.rows.length ? rowToPlaybook(res.rows[0]) : null;
}

export async function deletePlaybook(id: string, ownerId: string): Promise<boolean> {
  const pool = getCyberPool();
  const res = await pool.query(
    'DELETE FROM agos_cyber_playbooks WHERE id = $1 AND owner_id = $2',
    [id, ownerId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function replacePlaybookSteps(args: {
  id: string;
  ownerId: string;
  steps: PlaybookStep[]
}): Promise<Playbook | null> {
  const pool = getCyberPool();
  const check = await pool.query(
    'SELECT 1 FROM agos_cyber_playbooks WHERE id = $1 AND owner_id = $2',
    [args.id, args.ownerId]
  );
  if ((check.rowCount ?? 0) === 0) return null;
  await pool.query(
    `UPDATE agos_cyber_playbooks SET steps = $1::jsonb, updated_at = now() WHERE id = $2 AND owner_id = $3`,
    [JSON.stringify(args.steps), args.id, args.ownerId]
  );
  return getPlaybook(args.id, args.ownerId);
}

// ----- Playbook runs -----

function rowToPlaybookRun(row: any): PlaybookRun {
  return {
    id: row.id,
    playbookId: row.playbook_id,
    ownerId: row.owner_id,
    caseId: row.case_id ?? null,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    notes: row.notes,
    metadata: row.metadata,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function rowToPlaybookStepRun(row: any): PlaybookStepRun {
  return {
    id: row.id,
    runId: row.run_id,
    stepIndex: row.step_index,
    stepSnapshot: row.step_snapshot,
    status: row.status,
    input: row.input,
    notes: row.notes,
    startedAt: row.started_at ? row.started_at.toISOString() : null,
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const PLAYBOOK_RUN_COLS = `id, playbook_id, owner_id, case_id, status, started_at, completed_at, notes, metadata, created_at, updated_at`;
const PLAYBOOK_STEP_RUN_COLS = `id, run_id, step_index, step_snapshot, status, input, notes, started_at, completed_at, created_at, updated_at`;

export interface ListPlaybookRunsArgs {
  ownerId: string;
  status?: PlaybookRunStatus;
  playbookId?: string;
  limit?: number;
}

export async function listPlaybookRuns(args: ListPlaybookRunsArgs): Promise<(PlaybookRun & { playbookName: string })[]> {
  const pool = getCyberPool();
  const { ownerId, status, playbookId, limit = 100 } = args;
  let sql = `
    SELECT pr.*, pb.name AS playbook_name
    FROM agos_cyber_playbook_runs pr
    JOIN agos_cyber_playbooks pb ON pr.playbook_id = pb.id
    WHERE pr.owner_id = $1
  `;
  const params: any[] = [ownerId];
  let paramIndex = 2;

  if (status) {
    sql += ` AND pr.status = $${paramIndex++}`;
    params.push(status);
  }
  if (playbookId) {
    sql += ` AND pr.playbook_id = $${paramIndex++}`;
    params.push(playbookId);
  }
  sql += ` ORDER BY pr.started_at DESC LIMIT $${paramIndex++}`;
  params.push(limit);

  const res = await pool.query(sql, params);
  return res.rows.map(row => ({
    ...rowToPlaybookRun(row),
    playbookName: row.playbook_name,
  }));
}

export async function getPlaybookRun(id: string, ownerId: string): Promise<PlaybookRunDetail | null> {
  const pool = getCyberPool();
  const runRes = await pool.query(
    `
    SELECT pr.*, pb.name AS playbook_name
    FROM agos_cyber_playbook_runs pr
    JOIN agos_cyber_playbooks pb ON pb.id = pr.playbook_id
    WHERE pr.id = $1 AND pr.owner_id = $2
    `,
    [id, ownerId]
  );
  if ((runRes.rowCount ?? 0) === 0) return null;
  const run = rowToPlaybookRun(runRes.rows[0]);
  const playbookName = (runRes.rows[0].playbook_name as string | null) ?? '';
  const stepsRes = await pool.query(
    `SELECT ${PLAYBOOK_STEP_RUN_COLS} FROM agos_cyber_playbook_step_runs WHERE run_id = $1 ORDER BY step_index ASC`,
    [id]
  );
  return {
    ...run,
    playbookName,
    stepRuns: stepsRes.rows.map(rowToPlaybookStepRun),
  };
}

export async function startPlaybookRun(args: {
  ownerId: string;
  playbookId: string;
  caseId?: string | null
}): Promise<PlaybookRunDetail | null> {
  const pool = getCyberPool();
  const { ownerId, playbookId, caseId } = args;

  const playbookCheck = await pool.query(
    'SELECT 1 FROM agos_cyber_playbooks WHERE id = $1 AND owner_id = $2',
    [playbookId, ownerId]
  );
  if ((playbookCheck.rowCount ?? 0) === 0) {
    return null;
  }

  const playbookRes = await pool.query(
    `SELECT steps FROM agos_cyber_playbooks WHERE id = $1 AND owner_id = $2`,
    [playbookId, ownerId]
  );
  const steps = playbookRes.rows[0].steps as any[];

  const runId = randomUUID();
  await pool.query(
    `INSERT INTO agos_cyber_playbook_runs (id, playbook_id, owner_id, case_id, status, notes, metadata)
     VALUES ($1,$2,$3,$4,'in_progress',$5,$6::jsonb)`,
    [runId, playbookId, ownerId, caseId ?? null, null, JSON.stringify({})]
  );

  for (let i = 0; i < steps.length; i++) {
    const stepRunId = randomUUID();
    await pool.query(
      `INSERT INTO agos_cyber_playbook_step_runs (id, run_id, step_index, step_snapshot, status, input)
       VALUES ($1,$2,$3,$4::jsonb,'pending','{}'::jsonb)`,
      [stepRunId, runId, i, JSON.stringify(steps[i])]
    );
  }

  return getPlaybookRun(runId, ownerId);
}

export async function updateStepRun(args: {
  id: string;
  ownerId: string;
  patch: { status?: PlaybookStepRunStatus; input?: Record<string, unknown>; notes?: string | null }
}): Promise<PlaybookStepRun | null> {
  const pool = getCyberPool();
  const currentRes = await pool.query(
    `SELECT ${PLAYBOOK_STEP_RUN_COLS} FROM agos_cyber_playbook_step_runs WHERE id = $1 AND run_id IN (SELECT id FROM agos_cyber_playbook_runs WHERE owner_id = $2)`,
    [args.id, args.ownerId]
  );
  if ((currentRes.rowCount ?? 0) === 0) return null;
  const current = rowToPlaybookStepRun(currentRes.rows[0]);

  const setFields: string[] = [];
  const setValues: any[] = [];
  let setParamIndex = 1;

  if (args.patch.status !== undefined) {
    const newStatus = args.patch.status;
    if (newStatus === 'in_progress' && current.startedAt === null) {
      setFields.push(`started_at = now()`);
    }
    if ((newStatus === 'completed' || newStatus === 'skipped') && current.completedAt === null) {
      setFields.push(`completed_at = now()`);
    }
    setFields.push(`status = $${setParamIndex++}`);
    setValues.push(newStatus);
  }

  if (args.patch.input !== undefined) {
    setFields.push(`input = $${setParamIndex++}::jsonb`);
    setValues.push(JSON.stringify(args.patch.input));
  }

  if (args.patch.notes !== undefined) {
    setFields.push(`notes = $${setParamIndex++}`);
    setValues.push(args.patch.notes);
  }

  if (setFields.length === 0) {
    return current;
  }

  const whereIdIdx = setParamIndex++;
  const whereRunIdIdx = setParamIndex++;
  setValues.push(args.id);
  setValues.push(args.ownerId);

  const res = await pool.query(
    `UPDATE agos_cyber_playbook_step_runs SET ${setFields.join(', ')} WHERE id = $${whereIdIdx} AND run_id IN (SELECT id FROM agos_cyber_playbook_runs WHERE owner_id = $${whereRunIdIdx})`,
    setValues
  );

  if ((res.rowCount ?? 0) === 0) return null;
  const updatedRes = await pool.query(
    `SELECT ${PLAYBOOK_STEP_RUN_COLS} FROM agos_cyber_playbook_step_runs WHERE id = $1`,
    [args.id]
  );
  return rowToPlaybookStepRun(updatedRes.rows[0]);
}

export async function completeRun(args: {
  runId: string;
  ownerId: string;
  status: 'completed' | 'abandoned';
  notes?: string | null
}): Promise<PlaybookRunDetail | null> {
  const pool = getCyberPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const res = await client.query(
      `UPDATE agos_cyber_playbook_runs
       SET status = $1, completed_at = now(), notes = COALESCE($2, notes)
       WHERE id = $3 AND owner_id = $4
       RETURNING *`,
      [args.status, args.notes ?? null, args.runId, args.ownerId]
    );

    if ((res.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    await recordAudit({
      actorId: args.ownerId,
      action: `cyber.playbook_run.${args.status === 'completed' ? 'complete' : 'abandon'}`,
      payload: { runId: args.runId, status: args.status },
    });

    await client.query('COMMIT');

    return getPlaybookRun(args.runId, args.ownerId);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

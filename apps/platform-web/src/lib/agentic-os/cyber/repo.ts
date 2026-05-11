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

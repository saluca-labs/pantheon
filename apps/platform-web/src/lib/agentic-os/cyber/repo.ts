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
import type {
  Vulnerability,
  VulnerabilityPatch,
  VulnerabilitySeverity,
  VulnerabilityUpsert,
} from './vulnerabilities';
import type {
  Exposure,
  ExposurePatch,
  ExposurePriority,
  ExposureStatus,
  ExposureUpsert,
  ExposureWithRefs,
} from './exposures';
import type {
  Ioc,
  IocKind,
  IocPatch,
  IocUpsert,
  ThreatType,
} from './iocs';

// ─── Raw DB row shapes ─────────────────────────────────────────────────────

interface RawCyberAlertRow {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  category: string;
  status: string;
  source: string | null;
  source_ip: string | null;
  assigned_to: string | null;
  notes: string | null;
  occurred_at: Date;
  created_at: Date;
  updated_at: Date;
  asset_id: string | null;
  log_source_id: string | null;
  tactic: string | null;
  technique: string | null;
  correlation_id: string | null;
  tags: string[] | null;
  raw_jsonb: Record<string, unknown> | null;
}

interface RawCyberAssetRow {
  id: string;
  owner_id: string;
  name: string;
  kind: string;
  criticality: string;
  environment: string | null;
  hostname: string | null;
  ip_address: string | null;
  os_family: string | null;
  os_version: string | null;
  owner_email: string | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  decommissioned_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface RawCyberAssetGroupRow {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  tags: string[] | null;
  member_count: number | string | null;
  created_at: Date;
  updated_at: Date;
}

interface RawCyberLogSourceRow {
  id: string;
  owner_id: string;
  name: string;
  kind: string;
  vendor: string | null;
  endpoint_hint: string | null;
  status: string;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface RawCyberCaseRow {
  id: string;
  owner_id: string;
  title: string;
  summary: string | null;
  severity: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  tactic: string | null;
  technique: string | null;
  tags: string[] | null;
  closed_at: Date | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface RawCyberCaseEventRow {
  id: string;
  case_id: string;
  kind: string;
  author: string | null;
  body: string | null;
  payload: Record<string, unknown> | null;
  created_at: Date;
}

interface RawCyberEvidenceRow {
  id: string;
  case_id: string;
  kind: string;
  title: string;
  description: string | null;
  url: string | null;
  content: string | null;
  mime_type: string | null;
  sha256: string | null;
  collected_at: Date;
  collected_by: string | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface RawCyberTaskRow {
  id: string;
  case_id: string;
  title: string;
  description: string | null;
  status: string;
  assigned_to: string | null;
  priority: string;
  due_at: Date | null;
  completed_at: Date | null;
  position: number;
  created_at: Date;
  updated_at: Date;
}

interface RawCyberDetectionRuleRow {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  author: string | null;
  lifecycle: string;
  severity: string;
  tactic: string | null;
  technique: string | null;
  log_source_kind: string | null;
  detection: unknown;
  false_positives: string[] | null;
  references: string[] | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface RawCyberDetectionRunRow {
  id: string;
  rule_id: string;
  alert_id: string | null;
  triggered_at: Date;
  payload: unknown;
  created_at: Date;
}

interface RawCyberPlaybookRow {
  id: string;
  owner_id: string;
  name: string;
  category: string | null;
  description: string | null;
  lifecycle: string;
  tactic: string | null;
  steps: unknown;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface RawCyberPlaybookRunRow {
  id: string;
  playbook_id: string;
  owner_id: string;
  case_id: string | null;
  status: string;
  started_at: Date;
  completed_at: Date | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface RawCyberPlaybookStepRunRow {
  id: string;
  run_id: string;
  step_index: number;
  step_snapshot: unknown;
  status: string;
  input: unknown;
  notes: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface RawCyberVulnerabilityRow {
  id: string;
  owner_id: string;
  cve_id: string | null;
  title: string;
  description: string | null;
  severity: string;
  cvss_score: number | string | null;
  cvss_vector: string | null;
  cwe_id: string | null;
  vendor: string | null;
  product: string | null;
  affected_versions: string[] | null;
  fixed_versions: string[] | null;
  published_at: Date | null;
  references: string[] | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface RawCyberExposureRow {
  id: string;
  vulnerability_id: string;
  asset_id: string;
  owner_id: string;
  status: string;
  detected_at: Date;
  remediated_at: Date | null;
  detected_by: string | null;
  assigned_to: string | null;
  priority: string;
  notes: string | null;
  evidence_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface RawCyberExposureWithRefsRow extends RawCyberExposureRow {
  vuln_title: string;
  vuln_cve_id: string | null;
  vuln_severity: string;
  asset_name: string;
  asset_criticality: string;
}

interface RawCyberIocRow {
  id: string;
  owner_id: string;
  kind: string;
  value: string;
  title: string | null;
  description: string | null;
  threat_type: string | null;
  confidence: number | string | null;
  first_seen_at: Date;
  last_seen_at: Date;
  expires_at: Date | null;
  source: string | null;
  tags: string[] | null;
  references: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

// ─── Alerts ────────────────────────────────────────────────────────────────

function rowToAlert(row: RawCyberAlertRow): Alert {
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

function rowToAsset(row: RawCyberAssetRow): Asset {
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

function rowToGroup(row: RawCyberAssetGroupRow): AssetGroup {
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

function rowToLogSource(row: RawCyberLogSourceRow): LogSource {
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

function rowToCase(row: RawCyberCaseRow): Case {
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

function rowToCaseEvent(row: RawCyberCaseEventRow): CaseEvent {
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
  query: <R = unknown>(
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: R[]; rowCount: number | null }>;
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
  const r = await client.query<RawCyberCaseEventRow>(
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

function rowToEvidence(row: RawCyberEvidenceRow): Evidence {
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

function rowToTask(row: RawCyberTaskRow): Task {
  return {
    id: row.id,
    caseId: row.case_id,
    title: row.title,
    description: row.description ?? null,
    status: row.status as TaskStatus,
    assignedTo: row.assigned_to ?? null,
    priority: row.priority as Task['priority'],
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
  DetectionLogSourceKind,
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

function rowToDetectionRule(row: RawCyberDetectionRuleRow): DetectionRule {
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
    logSourceKind: (row.log_source_kind ?? null) as DetectionLogSourceKind | null,
    detection: (row.detection ?? {}) as Record<string, unknown>,
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
  const params: unknown[] = [ownerId];
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
  const values: unknown[] = [];
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

function rowToDetectionRun(row: RawCyberDetectionRunRow): DetectionRun {
  return {
    id: row.id,
    ruleId: row.rule_id,
    alertId: row.alert_id ?? null,
    triggeredAt: row.triggered_at.toISOString(),
    payload: (row.payload ?? {}) as Record<string, unknown>,
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

function rowToPlaybook(row: RawCyberPlaybookRow): Playbook {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    category: row.category ?? null,
    description: row.description ?? null,
    lifecycle: row.lifecycle as 'draft' | 'testing' | 'active' | 'deprecated' | 'archived',
    tactic: row.tactic ?? null,
    steps: (row.steps ?? []) as PlaybookStep[],
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
  const params: unknown[] = [ownerId];
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
  const values: unknown[] = [];
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

function rowToPlaybookRun(row: RawCyberPlaybookRunRow): PlaybookRun {
  return {
    id: row.id,
    playbookId: row.playbook_id,
    ownerId: row.owner_id,
    caseId: row.case_id ?? null,
    status: row.status as PlaybookRunStatus,
    startedAt: row.started_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    notes: row.notes,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function rowToPlaybookStepRun(row: RawCyberPlaybookStepRunRow): PlaybookStepRun {
  return {
    id: row.id,
    runId: row.run_id,
    stepIndex: row.step_index,
    stepSnapshot: row.step_snapshot as PlaybookStep,
    status: row.status as PlaybookStepRunStatus,
    input: (row.input ?? {}) as Record<string, unknown>,
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
  const params: unknown[] = [ownerId];
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
  const steps = playbookRes.rows[0].steps as unknown[];

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
  const setValues: unknown[] = [];
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

// ─── Vulnerabilities ───────────────────────────────────────────────────────

const VULN_COLS = `id, owner_id, cve_id, title, description, severity, cvss_score, cvss_vector, cwe_id, vendor, product, affected_versions, fixed_versions, published_at, "references", tags, metadata, created_at, updated_at`;

function rowToVulnerability(row: RawCyberVulnerabilityRow): Vulnerability {
  return {
    id: row.id,
    ownerId: row.owner_id,
    cveId: row.cve_id ?? null,
    title: row.title,
    description: row.description ?? null,
    severity: row.severity as VulnerabilitySeverity,
    cvssScore: row.cvss_score == null ? null : Number(row.cvss_score),
    cvssVector: row.cvss_vector ?? null,
    cweId: row.cwe_id ?? null,
    vendor: row.vendor ?? null,
    product: row.product ?? null,
    affectedVersions: row.affected_versions ?? [],
    fixedVersions: row.fixed_versions ?? [],
    publishedAt: row.published_at ? row.published_at.toISOString() : null,
    references: row.references ?? [],
    tags: row.tags ?? [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface ListVulnerabilitiesArgs {
  ownerId: string;
  severity?: VulnerabilitySeverity;
  q?: string;
  limit?: number;
  offset?: number;
}

export async function listVulnerabilities(args: ListVulnerabilitiesArgs): Promise<Vulnerability[]> {
  const pool = getCyberPool();
  const { ownerId, severity, q, limit = 200, offset = 0 } = args;
  let sql = `SELECT ${VULN_COLS} FROM agos_cyber_vulnerabilities WHERE owner_id = $1`;
  const params: unknown[] = [ownerId];
  let i = 2;
  if (severity) {
    sql += ` AND severity = $${i++}`;
    params.push(severity);
  }
  if (q && q.trim().length > 0) {
    sql += ` AND (title ILIKE $${i} OR description ILIKE $${i} OR cve_id ILIKE $${i} OR product ILIKE $${i})`;
    params.push(`%${q.trim()}%`);
    i++;
  }
  sql += ` ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, updated_at DESC LIMIT $${i++} OFFSET $${i++}`;
  params.push(limit, offset);
  const r = await pool.query(sql, params);
  return r.rows.map(rowToVulnerability);
}

export async function getVulnerability(id: string, ownerId: string): Promise<Vulnerability | null> {
  const pool = getCyberPool();
  const r = await pool.query(
    `SELECT ${VULN_COLS} FROM agos_cyber_vulnerabilities WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  return r.rows.length ? rowToVulnerability(r.rows[0]) : null;
}

export async function createVulnerability(ownerId: string, data: VulnerabilityUpsert): Promise<Vulnerability> {
  const pool = getCyberPool();
  const id = randomUUID();
  const r = await pool.query(
    `INSERT INTO agos_cyber_vulnerabilities
       (id, owner_id, cve_id, title, description, severity, cvss_score, cvss_vector, cwe_id,
        vendor, product, affected_versions, fixed_versions, published_at, "references", tags, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)
     RETURNING ${VULN_COLS}`,
    [
      id,
      ownerId,
      data.cveId ?? null,
      data.title,
      data.description ?? null,
      data.severity ?? 'medium',
      data.cvssScore ?? null,
      data.cvssVector ?? null,
      data.cweId ?? null,
      data.vendor ?? null,
      data.product ?? null,
      data.affectedVersions ?? [],
      data.fixedVersions ?? [],
      data.publishedAt ? new Date(data.publishedAt) : null,
      data.references ?? [],
      data.tags ?? [],
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  return rowToVulnerability(r.rows[0]);
}

export async function updateVulnerability(
  id: string,
  ownerId: string,
  patch: VulnerabilityPatch,
): Promise<Vulnerability | null> {
  const pool = getCyberPool();
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (patch.cveId !== undefined)            { sets.push(`cve_id = $${i++}`);            params.push(patch.cveId); }
  if (patch.title !== undefined)            { sets.push(`title = $${i++}`);             params.push(patch.title); }
  if (patch.description !== undefined)      { sets.push(`description = $${i++}`);       params.push(patch.description); }
  if (patch.severity !== undefined)         { sets.push(`severity = $${i++}`);          params.push(patch.severity); }
  if (patch.cvssScore !== undefined)        { sets.push(`cvss_score = $${i++}`);        params.push(patch.cvssScore); }
  if (patch.cvssVector !== undefined)       { sets.push(`cvss_vector = $${i++}`);       params.push(patch.cvssVector); }
  if (patch.cweId !== undefined)            { sets.push(`cwe_id = $${i++}`);            params.push(patch.cweId); }
  if (patch.vendor !== undefined)           { sets.push(`vendor = $${i++}`);            params.push(patch.vendor); }
  if (patch.product !== undefined)          { sets.push(`product = $${i++}`);           params.push(patch.product); }
  if (patch.affectedVersions !== undefined) { sets.push(`affected_versions = $${i++}`); params.push(patch.affectedVersions); }
  if (patch.fixedVersions !== undefined)    { sets.push(`fixed_versions = $${i++}`);    params.push(patch.fixedVersions); }
  if (patch.publishedAt !== undefined)      { sets.push(`published_at = $${i++}`);      params.push(patch.publishedAt ? new Date(patch.publishedAt) : null); }
  if (patch.references !== undefined)       { sets.push(`"references" = $${i++}`);      params.push(patch.references); }
  if (patch.tags !== undefined)             { sets.push(`tags = $${i++}`);              params.push(patch.tags); }
  if (patch.metadata !== undefined)         { sets.push(`metadata = $${i++}::jsonb`);   params.push(JSON.stringify(patch.metadata)); }
  if (sets.length === 0) return getVulnerability(id, ownerId);
  sets.push(`updated_at = now()`);
  const whereIdIdx = i++;
  const whereOwnerIdx = i++;
  params.push(id, ownerId);
  const r = await pool.query(
    `UPDATE agos_cyber_vulnerabilities SET ${sets.join(', ')} WHERE id = $${whereIdIdx} AND owner_id = $${whereOwnerIdx} RETURNING ${VULN_COLS}`,
    params,
  );
  return r.rows.length ? rowToVulnerability(r.rows[0]) : null;
}

export async function deleteVulnerability(id: string, ownerId: string): Promise<boolean> {
  const pool = getCyberPool();
  const r = await pool.query(
    `DELETE FROM agos_cyber_vulnerabilities WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Bulk-upsert vulnerabilities. When `cve_id` is present and an existing row
 * for that (owner, cve_id) is found, the existing row is UPDATEd; otherwise
 * a new row is INSERTed. Non-CVE rows are always INSERTed.
 *
 * Returns counts so the importer UI can show "imported N, updated M".
 */
export async function bulkUpsertVulnerabilities(args: {
  ownerId: string;
  vulnerabilities: VulnerabilityUpsert[];
}): Promise<{ inserted: number; updated: number; skipped: number }> {
  const pool = getCyberPool();
  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  try {
    await client.query('BEGIN');
    for (const v of args.vulnerabilities) {
      const cveId = v.cveId ?? null;
      let existingId: string | null = null;
      if (cveId) {
        const r = await client.query(
          `SELECT id FROM agos_cyber_vulnerabilities WHERE owner_id = $1 AND cve_id = $2 LIMIT 1`,
          [args.ownerId, cveId],
        );
        existingId = (r.rows[0]?.id as string | undefined) ?? null;
      }
      if (existingId) {
        await client.query(
          `UPDATE agos_cyber_vulnerabilities SET
             title = $3,
             description = COALESCE($4, description),
             severity = $5,
             cvss_score = COALESCE($6, cvss_score),
             cvss_vector = COALESCE($7, cvss_vector),
             cwe_id = COALESCE($8, cwe_id),
             vendor = COALESCE($9, vendor),
             product = COALESCE($10, product),
             affected_versions = $11,
             fixed_versions = $12,
             published_at = COALESCE($13, published_at),
             "references" = $14,
             tags = $15,
             metadata = $16::jsonb,
             updated_at = now()
           WHERE id = $1 AND owner_id = $2`,
          [
            existingId,
            args.ownerId,
            v.title,
            v.description ?? null,
            v.severity ?? 'medium',
            v.cvssScore ?? null,
            v.cvssVector ?? null,
            v.cweId ?? null,
            v.vendor ?? null,
            v.product ?? null,
            v.affectedVersions ?? [],
            v.fixedVersions ?? [],
            v.publishedAt ? new Date(v.publishedAt) : null,
            v.references ?? [],
            v.tags ?? [],
            JSON.stringify(v.metadata ?? {}),
          ],
        );
        updated += 1;
      } else {
        try {
          await client.query(
            `INSERT INTO agos_cyber_vulnerabilities
               (id, owner_id, cve_id, title, description, severity, cvss_score, cvss_vector, cwe_id,
                vendor, product, affected_versions, fixed_versions, published_at, "references", tags, metadata)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)`,
            [
              randomUUID(),
              args.ownerId,
              cveId,
              v.title,
              v.description ?? null,
              v.severity ?? 'medium',
              v.cvssScore ?? null,
              v.cvssVector ?? null,
              v.cweId ?? null,
              v.vendor ?? null,
              v.product ?? null,
              v.affectedVersions ?? [],
              v.fixedVersions ?? [],
              v.publishedAt ? new Date(v.publishedAt) : null,
              v.references ?? [],
              v.tags ?? [],
              JSON.stringify(v.metadata ?? {}),
            ],
          );
          inserted += 1;
        } catch {
          skipped += 1;
        }
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return { inserted, updated, skipped };
}

// ─── Exposures ─────────────────────────────────────────────────────────────

const EXPOSURE_COLS = `id, vulnerability_id, asset_id, owner_id, status, detected_at, remediated_at, detected_by, assigned_to, priority, notes, evidence_url, metadata, created_at, updated_at`;

function rowToExposure(row: RawCyberExposureRow): Exposure {
  return {
    id: row.id,
    vulnerabilityId: row.vulnerability_id,
    assetId: row.asset_id,
    ownerId: row.owner_id,
    status: row.status as ExposureStatus,
    detectedAt: row.detected_at.toISOString(),
    remediatedAt: row.remediated_at ? row.remediated_at.toISOString() : null,
    detectedBy: row.detected_by ?? null,
    assignedTo: row.assigned_to ?? null,
    priority: row.priority as ExposurePriority,
    notes: row.notes ?? null,
    evidenceUrl: row.evidence_url ?? null,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function rowToExposureWithRefs(row: RawCyberExposureWithRefsRow): ExposureWithRefs {
  return {
    ...rowToExposure(row),
    vulnerabilityTitle: row.vuln_title,
    vulnerabilityCveId: row.vuln_cve_id ?? null,
    vulnerabilitySeverity: row.vuln_severity,
    assetName: row.asset_name,
    assetCriticality: row.asset_criticality,
  };
}

export interface ListExposuresArgs {
  ownerId: string;
  status?: ExposureStatus;
  priority?: ExposurePriority;
  assetId?: string;
  vulnerabilityId?: string;
  limit?: number;
  offset?: number;
}

export async function listExposures(args: ListExposuresArgs): Promise<ExposureWithRefs[]> {
  const pool = getCyberPool();
  const { ownerId, status, priority, assetId, vulnerabilityId, limit = 200, offset = 0 } = args;
  const where: string[] = [`e.owner_id = $1`];
  const params: unknown[] = [ownerId];
  let i = 2;
  if (status)         { where.push(`e.status = $${i++}`);          params.push(status); }
  if (priority)       { where.push(`e.priority = $${i++}`);        params.push(priority); }
  if (assetId)        { where.push(`e.asset_id = $${i++}`);        params.push(assetId); }
  if (vulnerabilityId){ where.push(`e.vulnerability_id = $${i++}`);params.push(vulnerabilityId); }
  params.push(limit, offset);
  const limitIdx = i++;
  const offsetIdx = i++;
  const r = await pool.query(
    `SELECT e.id, e.vulnerability_id, e.asset_id, e.owner_id, e.status, e.detected_at,
            e.remediated_at, e.detected_by, e.assigned_to, e.priority, e.notes, e.evidence_url,
            e.metadata, e.created_at, e.updated_at,
            v.title AS vuln_title, v.cve_id AS vuln_cve_id, v.severity AS vuln_severity,
            a.name AS asset_name, a.criticality AS asset_criticality
       FROM agos_cyber_exposures e
       JOIN agos_cyber_vulnerabilities v ON v.id = e.vulnerability_id
       JOIN agos_cyber_assets a          ON a.id = e.asset_id
      WHERE ${where.join(' AND ')}
      ORDER BY
        CASE e.priority WHEN 'p1' THEN 0 WHEN 'p2' THEN 1 WHEN 'p3' THEN 2 WHEN 'p4' THEN 3 ELSE 4 END,
        CASE e.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
        e.detected_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );
  return r.rows.map(rowToExposureWithRefs);
}

export async function getExposure(id: string, ownerId: string): Promise<ExposureWithRefs | null> {
  const pool = getCyberPool();
  const r = await pool.query(
    `SELECT e.id, e.vulnerability_id, e.asset_id, e.owner_id, e.status, e.detected_at,
            e.remediated_at, e.detected_by, e.assigned_to, e.priority, e.notes, e.evidence_url,
            e.metadata, e.created_at, e.updated_at,
            v.title AS vuln_title, v.cve_id AS vuln_cve_id, v.severity AS vuln_severity,
            a.name AS asset_name, a.criticality AS asset_criticality
       FROM agos_cyber_exposures e
       JOIN agos_cyber_vulnerabilities v ON v.id = e.vulnerability_id
       JOIN agos_cyber_assets a          ON a.id = e.asset_id
      WHERE e.id = $1 AND e.owner_id = $2`,
    [id, ownerId],
  );
  return r.rows.length ? rowToExposureWithRefs(r.rows[0]) : null;
}

export async function createExposure(ownerId: string, data: ExposureUpsert): Promise<Exposure | null> {
  const pool = getCyberPool();
  // Confirm both parent rows belong to this owner.
  const refCheck = await pool.query(
    `SELECT
       (SELECT 1 FROM agos_cyber_vulnerabilities WHERE id = $1 AND owner_id = $3) AS vuln_ok,
       (SELECT 1 FROM agos_cyber_assets         WHERE id = $2 AND owner_id = $3) AS asset_ok`,
    [data.vulnerabilityId, data.assetId, ownerId],
  );
  const row = refCheck.rows[0] ?? {};
  if (!row.vuln_ok || !row.asset_ok) return null;
  const id = randomUUID();
  try {
    const r = await pool.query(
      `INSERT INTO agos_cyber_exposures
         (id, vulnerability_id, asset_id, owner_id, status, detected_by, assigned_to,
          priority, notes, evidence_url, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
       RETURNING ${EXPOSURE_COLS}`,
      [
        id,
        data.vulnerabilityId,
        data.assetId,
        ownerId,
        data.status ?? 'open',
        data.detectedBy ?? null,
        data.assignedTo ?? null,
        data.priority ?? 'p3',
        data.notes ?? null,
        data.evidenceUrl ?? null,
        JSON.stringify(data.metadata ?? {}),
      ],
    );
    return rowToExposure(r.rows[0]);
  } catch {
    // unique constraint violation = exposure already exists for this pair
    return null;
  }
}

export async function updateExposure(
  id: string,
  ownerId: string,
  patch: ExposurePatch,
): Promise<Exposure | null> {
  const pool = getCyberPool();
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (patch.status !== undefined)      { sets.push(`status = $${i++}`);       params.push(patch.status); }
  if (patch.detectedBy !== undefined)  { sets.push(`detected_by = $${i++}`);  params.push(patch.detectedBy); }
  if (patch.assignedTo !== undefined)  { sets.push(`assigned_to = $${i++}`);  params.push(patch.assignedTo); }
  if (patch.priority !== undefined)    { sets.push(`priority = $${i++}`);     params.push(patch.priority); }
  if (patch.notes !== undefined)       { sets.push(`notes = $${i++}`);        params.push(patch.notes); }
  if (patch.evidenceUrl !== undefined) { sets.push(`evidence_url = $${i++}`); params.push(patch.evidenceUrl); }
  if (patch.metadata !== undefined)    { sets.push(`metadata = $${i++}::jsonb`); params.push(JSON.stringify(patch.metadata)); }
  if (sets.length === 0) {
    const r = await pool.query(
      `SELECT ${EXPOSURE_COLS} FROM agos_cyber_exposures WHERE id = $1 AND owner_id = $2`,
      [id, ownerId],
    );
    return r.rows.length ? rowToExposure(r.rows[0]) : null;
  }
  sets.push(`updated_at = now()`);
  const whereIdIdx = i++;
  const whereOwnerIdx = i++;
  params.push(id, ownerId);
  const r = await pool.query(
    `UPDATE agos_cyber_exposures SET ${sets.join(', ')}
      WHERE id = $${whereIdIdx} AND owner_id = $${whereOwnerIdx}
      RETURNING ${EXPOSURE_COLS}`,
    params,
  );
  return r.rows.length ? rowToExposure(r.rows[0]) : null;
}

export async function deleteExposure(id: string, ownerId: string): Promise<boolean> {
  const pool = getCyberPool();
  const r = await pool.query(
    `DELETE FROM agos_cyber_exposures WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function listExposuresByAsset(assetId: string, ownerId: string): Promise<ExposureWithRefs[]> {
  return listExposures({ ownerId, assetId, limit: 500 });
}

export async function listExposuresByVuln(vulnerabilityId: string, ownerId: string): Promise<ExposureWithRefs[]> {
  return listExposures({ ownerId, vulnerabilityId, limit: 500 });
}

/**
 * Create one exposure per assetId for the same vulnerability. Idempotent —
 * the (vulnerability_id, asset_id) unique constraint silently swallows
 * duplicates so re-running with the same set is safe.
 */
export async function bulkCreateExposures(args: {
  ownerId: string;
  vulnerabilityId: string;
  assetIds: string[];
  detectedBy?: string | null;
  priority?: ExposurePriority;
}): Promise<{ created: number; skipped: number }> {
  const pool = getCyberPool();
  const client = await pool.connect();
  let created = 0;
  let skipped = 0;
  try {
    await client.query('BEGIN');
    // Ownership gate
    const ownerCheck = await client.query(
      `SELECT 1 FROM agos_cyber_vulnerabilities WHERE id = $1 AND owner_id = $2`,
      [args.vulnerabilityId, args.ownerId],
    );
    if ((ownerCheck.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return { created: 0, skipped: args.assetIds.length };
    }
    for (const assetId of args.assetIds) {
      const ok = await client.query(
        `SELECT 1 FROM agos_cyber_assets WHERE id = $1 AND owner_id = $2`,
        [assetId, args.ownerId],
      );
      if ((ok.rowCount ?? 0) === 0) { skipped += 1; continue; }
      try {
        await client.query(
          `INSERT INTO agos_cyber_exposures
             (id, vulnerability_id, asset_id, owner_id, status, detected_by, priority)
           VALUES ($1,$2,$3,$4,'open',$5,$6)
           ON CONFLICT (vulnerability_id, asset_id) DO NOTHING`,
          [
            randomUUID(),
            args.vulnerabilityId,
            assetId,
            args.ownerId,
            args.detectedBy ?? null,
            args.priority ?? 'p3',
          ],
        );
        created += 1;
      } catch {
        skipped += 1;
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return { created, skipped };
}

/** Transition an exposure into a closed state, stamping remediated_at. */
export async function closeExposure(args: {
  id: string;
  ownerId: string;
  status: 'mitigated' | 'resolved' | 'false_positive';
  notes?: string | null;
}): Promise<Exposure | null> {
  const pool = getCyberPool();
  const r = await pool.query(
    `UPDATE agos_cyber_exposures
        SET status = $1,
            remediated_at = COALESCE(remediated_at, now()),
            notes = COALESCE($2, notes),
            updated_at = now()
      WHERE id = $3 AND owner_id = $4
      RETURNING ${EXPOSURE_COLS}`,
    [args.status, args.notes ?? null, args.id, args.ownerId],
  );
  return r.rows.length ? rowToExposure(r.rows[0]) : null;
}

// ─── IOCs ──────────────────────────────────────────────────────────────────

const IOC_COLS = `id, owner_id, kind, value, title, description, threat_type, confidence, first_seen_at, last_seen_at, expires_at, source, tags, "references", metadata, created_at, updated_at`;

function rowToIoc(row: RawCyberIocRow): Ioc {
  return {
    id: row.id,
    ownerId: row.owner_id,
    kind: row.kind as IocKind,
    value: row.value,
    title: row.title ?? null,
    description: row.description ?? null,
    threatType: (row.threat_type ?? null) as ThreatType | null,
    confidence: Number(row.confidence ?? 50),
    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    source: row.source ?? null,
    tags: row.tags ?? [],
    references: row.references ?? [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface SearchIocsArgs {
  ownerId: string;
  q?: string;
  kind?: IocKind;
  threatType?: ThreatType;
  limit?: number;
  offset?: number;
}

export async function searchIocs(args: SearchIocsArgs): Promise<Ioc[]> {
  const pool = getCyberPool();
  const { ownerId, q, kind, threatType, limit = 200, offset = 0 } = args;
  const where: string[] = [`owner_id = $1`];
  const params: unknown[] = [ownerId];
  let i = 2;
  if (kind)       { where.push(`kind = $${i++}`);        params.push(kind); }
  if (threatType) { where.push(`threat_type = $${i++}`); params.push(threatType); }
  if (q && q.trim().length > 0) {
    where.push(`(value ILIKE $${i} OR title ILIKE $${i} OR description ILIKE $${i})`);
    params.push(`%${q.trim()}%`);
    i++;
  }
  params.push(limit, offset);
  const limitIdx = i++;
  const offsetIdx = i++;
  const r = await pool.query(
    `SELECT ${IOC_COLS} FROM agos_cyber_iocs
      WHERE ${where.join(' AND ')}
      ORDER BY last_seen_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );
  return r.rows.map(rowToIoc);
}

export async function listIocs(args: SearchIocsArgs): Promise<Ioc[]> {
  return searchIocs(args);
}

export async function getIoc(id: string, ownerId: string): Promise<Ioc | null> {
  const pool = getCyberPool();
  const r = await pool.query(
    `SELECT ${IOC_COLS} FROM agos_cyber_iocs WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  return r.rows.length ? rowToIoc(r.rows[0]) : null;
}

export async function createIoc(ownerId: string, data: IocUpsert): Promise<Ioc | null> {
  const pool = getCyberPool();
  const id = randomUUID();
  try {
    const r = await pool.query(
      `INSERT INTO agos_cyber_iocs
         (id, owner_id, kind, value, title, description, threat_type, confidence,
          first_seen_at, last_seen_at, expires_at, source, tags, "references", metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
       RETURNING ${IOC_COLS}`,
      [
        id,
        ownerId,
        data.kind,
        data.value,
        data.title ?? null,
        data.description ?? null,
        data.threatType ?? null,
        data.confidence ?? 50,
        data.firstSeenAt ? new Date(data.firstSeenAt) : new Date(),
        data.lastSeenAt ? new Date(data.lastSeenAt) : new Date(),
        data.expiresAt ? new Date(data.expiresAt) : null,
        data.source ?? null,
        data.tags ?? [],
        data.references ?? [],
        JSON.stringify(data.metadata ?? {}),
      ],
    );
    return rowToIoc(r.rows[0]);
  } catch {
    // duplicate (owner_id, kind, value) — caller can treat as no-op
    return null;
  }
}

export async function updateIoc(id: string, ownerId: string, patch: IocPatch): Promise<Ioc | null> {
  const pool = getCyberPool();
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (patch.title !== undefined)        { sets.push(`title = $${i++}`);         params.push(patch.title); }
  if (patch.description !== undefined)  { sets.push(`description = $${i++}`);   params.push(patch.description); }
  if (patch.threatType !== undefined)   { sets.push(`threat_type = $${i++}`);   params.push(patch.threatType); }
  if (patch.confidence !== undefined)   { sets.push(`confidence = $${i++}`);    params.push(patch.confidence); }
  if (patch.firstSeenAt !== undefined)  { sets.push(`first_seen_at = $${i++}`); params.push(new Date(patch.firstSeenAt)); }
  if (patch.lastSeenAt !== undefined)   { sets.push(`last_seen_at = $${i++}`);  params.push(new Date(patch.lastSeenAt)); }
  if (patch.expiresAt !== undefined)    { sets.push(`expires_at = $${i++}`);    params.push(patch.expiresAt ? new Date(patch.expiresAt) : null); }
  if (patch.source !== undefined)       { sets.push(`source = $${i++}`);        params.push(patch.source); }
  if (patch.tags !== undefined)         { sets.push(`tags = $${i++}`);          params.push(patch.tags); }
  if (patch.references !== undefined)   { sets.push(`"references" = $${i++}`);  params.push(patch.references); }
  if (patch.metadata !== undefined)     { sets.push(`metadata = $${i++}::jsonb`); params.push(JSON.stringify(patch.metadata)); }
  if (sets.length === 0) return getIoc(id, ownerId);
  sets.push(`updated_at = now()`);
  const whereIdIdx = i++;
  const whereOwnerIdx = i++;
  params.push(id, ownerId);
  const r = await pool.query(
    `UPDATE agos_cyber_iocs SET ${sets.join(', ')}
      WHERE id = $${whereIdIdx} AND owner_id = $${whereOwnerIdx}
      RETURNING ${IOC_COLS}`,
    params,
  );
  return r.rows.length ? rowToIoc(r.rows[0]) : null;
}

export async function deleteIoc(id: string, ownerId: string): Promise<boolean> {
  const pool = getCyberPool();
  const r = await pool.query(
    `DELETE FROM agos_cyber_iocs WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Return alerts whose source_ip / source / raw fields match any active IOC
 * value owned by this user, within the given lookback window (default 7d).
 * Used by the trends dashboard ("IOC hits last 7d") and ad-hoc hunting.
 */
export async function matchIocAgainstAlerts(args: {
  ownerId: string;
  withinDays?: number;
}): Promise<{ alertId: string; iocId: string; iocValue: string; iocKind: IocKind; occurredAt: string }[]> {
  const pool = getCyberPool();
  const r = await pool.query(
    `SELECT a.id AS alert_id, a.occurred_at,
            i.id AS ioc_id, i.value AS ioc_value, i.kind AS ioc_kind
       FROM agos_cyber_alerts a
       JOIN agos_cyber_iocs i ON i.owner_id = a.owner_id
        AND (
              (i.kind IN ('ipv4','ipv6') AND host(a.source_ip) = i.value)
           OR (i.kind = 'domain' AND (a.source ILIKE '%' || i.value || '%'
                                   OR a.raw_jsonb::text ILIKE '%' || i.value || '%'))
           OR (i.kind = 'url'    AND a.raw_jsonb::text ILIKE '%' || i.value || '%')
           OR (i.kind IN ('file_hash_md5','file_hash_sha1','file_hash_sha256')
               AND a.raw_jsonb::text ILIKE '%' || i.value || '%')
        )
      WHERE a.owner_id = $1
        AND a.occurred_at >= now() - ($2::int || ' days')::interval
        AND (i.expires_at IS NULL OR i.expires_at > now())
      ORDER BY a.occurred_at DESC
      LIMIT 1000`,
    [args.ownerId, args.withinDays ?? 7],
  );
  return r.rows.map(
    (row: {
      alert_id: string;
      ioc_id: string;
      ioc_value: string;
      ioc_kind: string;
      occurred_at: Date;
    }) => ({
      alertId: row.alert_id,
      iocId: row.ioc_id,
      iocValue: row.ioc_value,
      iocKind: row.ioc_kind as IocKind,
      occurredAt: row.occurred_at.toISOString(),
    }),
  );
}

// ─── Trends + dashboard analytics ──────────────────────────────────────────

export interface TrendsPayload {
  alertsByDay: { date: string; total: number; critical: number; high: number }[];
  openVulnsBySeverity: { severity: string; count: number }[];
  exposuresMttrDays: number | null;
  exposuresOpen: number;
  exposuresClosedLast30d: number;
  iocHitsLast7d: number;
  iocHitsLast30d: number;
  topVulnerableAssets: { assetId: string; assetName: string; openExposures: number }[];
}

export async function getCyberTrendsData(args: {
  ownerId: string;
  windowDays?: number; // for alertsByDay; default 30
}): Promise<TrendsPayload> {
  const pool = getCyberPool();
  const windowDays = args.windowDays ?? 30;

  const alertsByDayRes = await pool.query(
    `SELECT to_char(date_trunc('day', occurred_at), 'YYYY-MM-DD') AS day,
            COUNT(*)::int AS total,
            SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END)::int AS critical,
            SUM(CASE WHEN severity = 'high'     THEN 1 ELSE 0 END)::int AS high
       FROM agos_cyber_alerts
      WHERE owner_id = $1
        AND occurred_at >= now() - ($2::int || ' days')::interval
      GROUP BY day
      ORDER BY day ASC`,
    [args.ownerId, windowDays],
  );

  const vulnsRes = await pool.query(
    `SELECT v.severity AS severity, COUNT(DISTINCT v.id)::int AS count
       FROM agos_cyber_vulnerabilities v
       JOIN agos_cyber_exposures e ON e.vulnerability_id = v.id
                                   AND e.owner_id = v.owner_id
      WHERE v.owner_id = $1
        AND e.status IN ('open','in_progress','accepted')
      GROUP BY v.severity`,
    [args.ownerId],
  );

  const mttrRes = await pool.query(
    `SELECT
       AVG(EXTRACT(EPOCH FROM (remediated_at - detected_at)) / 86400.0) AS mttr_days,
       SUM(CASE WHEN status IN ('open','in_progress','accepted') THEN 1 ELSE 0 END)::int AS open_count,
       SUM(CASE WHEN status IN ('resolved','mitigated','false_positive')
                 AND remediated_at >= now() - INTERVAL '30 days' THEN 1 ELSE 0 END)::int AS closed_30d
       FROM agos_cyber_exposures
      WHERE owner_id = $1`,
    [args.ownerId],
  );

  const hits7 = await matchIocAgainstAlerts({ ownerId: args.ownerId, withinDays: 7 });
  const hits30 = await matchIocAgainstAlerts({ ownerId: args.ownerId, withinDays: 30 });

  const topRes = await pool.query(
    `SELECT a.id AS asset_id, a.name AS asset_name, COUNT(e.id)::int AS open_exposures
       FROM agos_cyber_assets a
       JOIN agos_cyber_exposures e ON e.asset_id = a.id AND e.owner_id = a.owner_id
      WHERE a.owner_id = $1
        AND e.status IN ('open','in_progress','accepted')
      GROUP BY a.id, a.name
      ORDER BY open_exposures DESC
      LIMIT 10`,
    [args.ownerId],
  );

  return {
    alertsByDay: alertsByDayRes.rows.map(
      (r: { day: string; total: number | string | null; critical: number | string | null; high: number | string | null }) => ({
        date: r.day,
        total: Number(r.total ?? 0),
        critical: Number(r.critical ?? 0),
        high: Number(r.high ?? 0),
      }),
    ),
    openVulnsBySeverity: vulnsRes.rows.map(
      (r: { severity: string; count: number | string | null }) => ({
        severity: r.severity,
        count: Number(r.count ?? 0),
      }),
    ),
    exposuresMttrDays: mttrRes.rows[0]?.mttr_days != null
      ? Number(mttrRes.rows[0].mttr_days)
      : null,
    exposuresOpen: Number(mttrRes.rows[0]?.open_count ?? 0),
    exposuresClosedLast30d: Number(mttrRes.rows[0]?.closed_30d ?? 0),
    iocHitsLast7d: hits7.length,
    iocHitsLast30d: hits30.length,
    topVulnerableAssets: topRes.rows.map(
      (r: { asset_id: string; asset_name: string; open_exposures: number | string | null }) => ({
        assetId: r.asset_id,
        assetName: r.asset_name,
        openExposures: Number(r.open_exposures ?? 0),
      }),
    ),
  };
}

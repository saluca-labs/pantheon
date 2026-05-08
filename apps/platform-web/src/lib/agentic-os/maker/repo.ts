/**
 * Maker OS — database repository for builds and parts inventory.
 *
 * All queries target the `agos_maker_builds` and `agos_maker_parts` tables
 * introduced in migration 0004_maker_os.py.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getMakerPool } from './session';
import type { BuildProject, BuildStatus, PartCategory, PartItem } from './inventory';

// ─── Builds ────────────────────────────────────────────────────────────────

export interface BuildUpsert {
  name: string;
  description?: string | null;
  status?: BuildStatus;
  tags?: string[];
}

function rowToBuild(row: any): BuildProject {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description ?? null,
    status: row.status as BuildStatus,
    tags: row.tags ?? [],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listBuilds(userId: string): Promise<BuildProject[]> {
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT id, user_id, name, description, status, tags, created_at, updated_at
       FROM agos_maker_builds
      WHERE user_id = $1
      ORDER BY updated_at DESC`,
    [userId],
  );
  return r.rows.map(rowToBuild);
}

export async function getBuild(id: string, userId: string): Promise<BuildProject | null> {
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT id, user_id, name, description, status, tags, created_at, updated_at
       FROM agos_maker_builds
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToBuild(r.rows[0]);
}

export async function createBuild(userId: string, data: BuildUpsert): Promise<BuildProject> {
  const pool = getMakerPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_maker_builds (id, user_id, name, description, status, tags)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      id,
      userId,
      data.name,
      data.description ?? null,
      data.status ?? 'planning',
      JSON.stringify(data.tags ?? []),
    ],
  );
  const build = await getBuild(id, userId);
  if (!build) throw new Error('Failed to create build');
  return build;
}

export async function updateBuild(
  id: string,
  userId: string,
  patch: Partial<BuildUpsert>,
): Promise<BuildProject | null> {
  const pool = getMakerPool();
  await pool.query(
    `UPDATE agos_maker_builds
        SET name        = COALESCE($3, name),
            description = COALESCE($4, description),
            status      = COALESCE($5, status),
            tags        = COALESCE($6::jsonb, tags),
            updated_at  = now()
      WHERE id = $1 AND user_id = $2`,
    [
      id,
      userId,
      patch.name ?? null,
      patch.description ?? null,
      patch.status ?? null,
      patch.tags ? JSON.stringify(patch.tags) : null,
    ],
  );
  return getBuild(id, userId);
}

export async function deleteBuild(id: string, userId: string): Promise<void> {
  const pool = getMakerPool();
  await pool.query(`DELETE FROM agos_maker_builds WHERE id = $1 AND user_id = $2`, [id, userId]);
}

// ─── Parts ─────────────────────────────────────────────────────────────────

export interface PartUpsert {
  name: string;
  category?: PartCategory;
  quantity?: number;
  unit?: string;
  notes?: string | null;
  sourceUrl?: string | null;
  inStock?: boolean;
}

function rowToPart(row: any): PartItem {
  return {
    id: row.id,
    buildId: row.build_id,
    name: row.name,
    category: row.category as PartCategory,
    quantity: Number(row.quantity),
    unit: row.unit ?? 'pcs',
    notes: row.notes ?? null,
    sourceUrl: row.source_url ?? null,
    inStock: row.in_stock ?? false,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listParts(buildId: string): Promise<PartItem[]> {
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT id, build_id, name, category, quantity, unit, notes, source_url, in_stock,
            created_at, updated_at
       FROM agos_maker_parts
      WHERE build_id = $1
      ORDER BY category, name`,
    [buildId],
  );
  return r.rows.map(rowToPart);
}

export async function createPart(buildId: string, data: PartUpsert): Promise<PartItem> {
  const pool = getMakerPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_maker_parts
       (id, build_id, name, category, quantity, unit, notes, source_url, in_stock)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      buildId,
      data.name,
      data.category ?? 'other',
      data.quantity ?? 1,
      data.unit ?? 'pcs',
      data.notes ?? null,
      data.sourceUrl ?? null,
      data.inStock ?? false,
    ],
  );
  const parts = await listParts(buildId);
  const part = parts.find((p) => p.id === id);
  if (!part) throw new Error('Failed to create part');
  return part;
}

export async function updatePart(
  id: string,
  buildId: string,
  patch: Partial<PartUpsert>,
): Promise<PartItem | null> {
  const pool = getMakerPool();
  await pool.query(
    `UPDATE agos_maker_parts
        SET name       = COALESCE($3, name),
            category   = COALESCE($4, category),
            quantity   = COALESCE($5, quantity),
            unit       = COALESCE($6, unit),
            notes      = COALESCE($7, notes),
            source_url = COALESCE($8, source_url),
            in_stock   = COALESCE($9, in_stock),
            updated_at = now()
      WHERE id = $1 AND build_id = $2`,
    [
      id,
      buildId,
      patch.name ?? null,
      patch.category ?? null,
      patch.quantity ?? null,
      patch.unit ?? null,
      patch.notes ?? null,
      patch.sourceUrl ?? null,
      patch.inStock ?? null,
    ],
  );
  const parts = await listParts(buildId);
  return parts.find((p) => p.id === id) ?? null;
}

export async function deletePart(id: string, buildId: string): Promise<void> {
  const pool = getMakerPool();
  await pool.query(`DELETE FROM agos_maker_parts WHERE id = $1 AND build_id = $2`, [id, buildId]);
}

// ─── Audit ─────────────────────────────────────────────────────────────────

export async function recordAudit(args: {
  actorId: string;
  action: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const pool = getMakerPool();
  await pool.query(
    `INSERT INTO agos_audit (id, actor_id, os_slug, action, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      randomUUID(),
      args.actorId,
      'maker',
      args.action,
      JSON.stringify(args.payload ?? {}),
    ],
  );
}

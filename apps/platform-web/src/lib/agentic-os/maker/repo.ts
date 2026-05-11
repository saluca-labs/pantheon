/**
 * Maker OS — database repository for projects and parts inventory.
 *
 * All queries target the `agos_maker_projects` table (renamed from
 * `agos_maker_builds` in migration 0033_maker_phase1) and the legacy
 * `agos_maker_parts` table (which keeps its `build_id` FK column name in
 * Phase 1; renaming that column is a Phase 2 concern).
 *
 * Phase 1 changes from the scaffold:
 *   - `Build*` types renamed to `MakerProject*`; legacy aliases kept as
 *     soft-deprecation re-exports for one release.
 *   - Table name updated everywhere.
 *   - `recordAudit` switched to `_shared/audit` (slug-parameterized). The
 *     local one-arg shim is preserved here as a thin wrapper that fills in
 *     the pool + `osSlug: 'maker'` for callers still on the old signature.
 *   - New columns surfaced: cover_image_url, target_completion_date,
 *     team_size, phase_progress (JSONB), metadata (JSONB).
 *   - New helpers: `updatePhaseProgress`, `updateProject`.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getMakerPool } from './session';
import type { PartCategory, PartItem } from './inventory';
import {
  PROJECT_STATUSES,
  coercePhaseProgress,
  phaseProgressDefault,
  type MakerPhase,
  type PhaseProgress,
  type ProjectStatus,
} from './projects';
import {
  recordAudit as sharedRecordAudit,
  type RecordAuditArgs,
} from '../_shared/audit';

// ─── Project types ─────────────────────────────────────────────────────────

export interface MakerProject {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  tags: string[];
  coverImageUrl: string | null;
  targetCompletionDate: string | null;
  teamSize: number | null;
  phaseProgress: PhaseProgress;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMakerProjectInput {
  name: string;
  description?: string | null;
  status?: ProjectStatus;
  tags?: string[];
  coverImageUrl?: string | null;
  targetCompletionDate?: string | null;
  teamSize?: number | null;
  phaseProgress?: PhaseProgress;
  metadata?: Record<string, unknown>;
}

export type UpdateMakerProjectInput = Partial<CreateMakerProjectInput>;

// ─── Row mapping ───────────────────────────────────────────────────────────

const PROJECT_COLUMNS = `id, user_id, name, description, status, tags,
                         cover_image_url, target_completion_date, team_size,
                         phase_progress, metadata,
                         created_at, updated_at`;

function rowToProject(row: any): MakerProject {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description ?? null,
    status: (row.status as ProjectStatus) ?? 'concept',
    tags: row.tags ?? [],
    coverImageUrl: row.cover_image_url ?? null,
    targetCompletionDate: row.target_completion_date
      ? new Date(row.target_completion_date).toISOString().slice(0, 10)
      : null,
    teamSize: row.team_size == null ? null : Number(row.team_size),
    phaseProgress: coercePhaseProgress(row.phase_progress),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

// ─── Projects CRUD ─────────────────────────────────────────────────────────

export async function listProjects(userId: string): Promise<MakerProject[]> {
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT ${PROJECT_COLUMNS}
       FROM agos_maker_projects
      WHERE user_id = $1
      ORDER BY updated_at DESC`,
    [userId],
  );
  return r.rows.map(rowToProject);
}

export async function getProject(
  id: string,
  userId: string,
): Promise<MakerProject | null> {
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT ${PROJECT_COLUMNS}
       FROM agos_maker_projects
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToProject(r.rows[0]);
}

export async function createProject(
  userId: string,
  data: CreateMakerProjectInput,
): Promise<MakerProject> {
  const pool = getMakerPool();
  const id = randomUUID();

  const status: ProjectStatus = data.status ?? 'concept';
  if (!(PROJECT_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  const phaseProgress = data.phaseProgress ?? phaseProgressDefault();

  await pool.query(
    `INSERT INTO agos_maker_projects
       (id, user_id, name, description, status, tags,
        cover_image_url, target_completion_date, team_size,
        phase_progress, metadata)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11::jsonb)`,
    [
      id,
      userId,
      data.name,
      data.description ?? null,
      status,
      JSON.stringify(data.tags ?? []),
      data.coverImageUrl ?? null,
      data.targetCompletionDate ?? null,
      data.teamSize ?? null,
      JSON.stringify(phaseProgress),
      JSON.stringify(data.metadata ?? {}),
    ],
  );

  const project = await getProject(id, userId);
  if (!project) throw new Error('Failed to create maker project');
  return project;
}

export async function updateProject(
  id: string,
  userId: string,
  patch: UpdateMakerProjectInput,
): Promise<MakerProject | null> {
  const pool = getMakerPool();
  if (
    patch.status !== undefined &&
    !(PROJECT_STATUSES as readonly string[]).includes(patch.status)
  ) {
    throw new Error(`Invalid status: ${patch.status}`);
  }
  await pool.query(
    `UPDATE agos_maker_projects
        SET name                   = COALESCE($3,  name),
            description            = COALESCE($4,  description),
            status                 = COALESCE($5,  status),
            tags                   = COALESCE($6::jsonb, tags),
            cover_image_url        = COALESCE($7,  cover_image_url),
            target_completion_date = COALESCE($8,  target_completion_date),
            team_size              = COALESCE($9,  team_size),
            phase_progress         = COALESCE($10::jsonb, phase_progress),
            metadata               = COALESCE($11::jsonb, metadata),
            updated_at             = now()
      WHERE id = $1 AND user_id = $2`,
    [
      id,
      userId,
      patch.name ?? null,
      patch.description ?? null,
      patch.status ?? null,
      patch.tags ? JSON.stringify(patch.tags) : null,
      patch.coverImageUrl ?? null,
      patch.targetCompletionDate ?? null,
      patch.teamSize ?? null,
      patch.phaseProgress ? JSON.stringify(patch.phaseProgress) : null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  return getProject(id, userId);
}

/**
 * Update one or more phase percentages for a project. Other phases are
 * preserved. Returns the updated project, or null if not found.
 */
export async function updatePhaseProgress(
  id: string,
  userId: string,
  patch: Partial<Record<MakerPhase, number>>,
): Promise<MakerProject | null> {
  const current = await getProject(id, userId);
  if (!current) return null;
  const merged: PhaseProgress = { ...current.phaseProgress, ...patch };
  return updateProject(id, userId, { phaseProgress: coercePhaseProgress(merged) });
}

export async function deleteProject(id: string, userId: string): Promise<boolean> {
  const pool = getMakerPool();
  const r = await pool.query(
    `DELETE FROM agos_maker_projects WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Parts CRUD ────────────────────────────────────────────────────────────
//
// Parts keep their `build_id` column name in Phase 1; renaming is a Phase 2
// concern. The route layer exposes `projectId` to callers, but the SQL still
// reads `build_id`.

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
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function listParts(projectId: string): Promise<PartItem[]> {
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT id, build_id, name, category, quantity, unit, notes, source_url, in_stock,
            created_at, updated_at
       FROM agos_maker_parts
      WHERE build_id = $1
      ORDER BY category, name`,
    [projectId],
  );
  return r.rows.map(rowToPart);
}

export async function createPart(
  projectId: string,
  data: PartUpsert,
): Promise<PartItem> {
  const pool = getMakerPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_maker_parts
       (id, build_id, name, category, quantity, unit, notes, source_url, in_stock)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      projectId,
      data.name,
      data.category ?? 'other',
      data.quantity ?? 1,
      data.unit ?? 'pcs',
      data.notes ?? null,
      data.sourceUrl ?? null,
      data.inStock ?? false,
    ],
  );
  const parts = await listParts(projectId);
  const part = parts.find((p) => p.id === id);
  if (!part) throw new Error('Failed to create part');
  return part;
}

export async function updatePart(
  id: string,
  projectId: string,
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
      projectId,
      patch.name ?? null,
      patch.category ?? null,
      patch.quantity ?? null,
      patch.unit ?? null,
      patch.notes ?? null,
      patch.sourceUrl ?? null,
      patch.inStock ?? null,
    ],
  );
  const parts = await listParts(projectId);
  return parts.find((p) => p.id === id) ?? null;
}

export async function deletePart(id: string, projectId: string): Promise<void> {
  const pool = getMakerPool();
  await pool.query(`DELETE FROM agos_maker_parts WHERE id = $1 AND build_id = $2`, [
    id,
    projectId,
  ]);
}

// ─── Audit ─────────────────────────────────────────────────────────────────
//
// Phase 1 migrates the audit writer to `_shared/audit.ts` (slug-parameterized).
// `recordAudit` below is a thin convenience wrapper so route handlers can pass
// just the per-call fields; `osSlug` and `pool` are filled in for them.
//
// The legacy single-argument shape (`{ actorId, action, payload }`) is still
// accepted via the `LegacyRecordAuditArgs` overload so the existing parts
// route continues to compile. The shim is documented as soft-deprecated and
// will be removed in Phase 2.

interface LegacyRecordAuditArgs {
  actorId: string;
  action: string;
  payload?: Record<string, unknown>;
  projectId?: string | null;
}

/** Slug-parameterized audit writer. The `osSlug` is locked to `'maker'`. */
export async function recordAudit(
  args: LegacyRecordAuditArgs | Omit<RecordAuditArgs, 'pool' | 'osSlug'>,
): Promise<void> {
  const pool = getMakerPool();
  await sharedRecordAudit({
    pool,
    osSlug: 'maker',
    actorId: args.actorId,
    action: args.action,
    payload: args.payload,
    projectId: args.projectId ?? null,
  });
}

// ─── Legacy aliases (soft-deprecated; remove in Phase 2) ────────────────────

/** @deprecated — use `MakerProject` from `./projects.ts`. */
export type Build = MakerProject;

/** @deprecated — use `MakerProject` from `./projects.ts`. */
export type BuildProject = MakerProject;

/** @deprecated — use `CreateMakerProjectInput`. */
export type BuildUpsert = CreateMakerProjectInput;

/** @deprecated — use `listProjects`. */
export const listBuilds = listProjects;

/** @deprecated — use `getProject`. */
export const getBuild = getProject;

/** @deprecated — use `createProject`. */
export const createBuild = createProject;

/** @deprecated — use `updateProject`. */
export const updateBuild = updateProject;

/** @deprecated — use `deleteProject`. */
export const deleteBuild = deleteProject;

/**
 * Filmmaker OS — database repository for projects and shot lists.
 *
 * All queries target the `agos_filmmaker_*` tables. Uses the same shared
 * pg Pool as the rest of the Agentic OS suite to avoid N pools per vertical.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { getFilmmakerPool } from './session';
import type { ShotListEntry, ShotType, CameraMove } from './shots';
import type {
  FilmmakerProject,
  ProjectUpsert,
  ProjectStatus,
  ProjectFormat,
  PhaseProgress,
} from './projects';
import { coercePhaseProgress, phaseProgressDefault } from './projects';

// ─── Row mappers ─────────────────────────────────────────────────────────────

function rowToProject(row: any): FilmmakerProject {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description ?? null,
    status: row.status as ProjectStatus,
    tags: row.tags ?? [],
    format: (row.format as ProjectFormat) ?? 'feature',
    logline: row.logline ?? null,
    coverImageUrl: row.cover_image_url ?? null,
    phaseProgress: coercePhaseProgress(row.phase_progress),
    targetCompletionDate: row.target_completion_date
      ? new Date(row.target_completion_date).toISOString().slice(0, 10)
      : null,
    teamSize: row.team_size == null ? null : Number(row.team_size),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const PROJECT_COLUMNS = `id, user_id, name, description, status, tags,
                         format, logline, cover_image_url, phase_progress,
                         target_completion_date, team_size, metadata,
                         created_at, updated_at`;

const PROJECT_COLUMNS_P = PROJECT_COLUMNS
  .split(',')
  .map((c) => `p.${c.trim()}`)
  .join(', ');

// ─── Projects ────────────────────────────────────────────────────────────────

export async function listProjects(userId: string): Promise<FilmmakerProject[]> {
  const pool = getFilmmakerPool();
  const r = await pool.query(
    `SELECT ${PROJECT_COLUMNS}
       FROM agos_filmmaker_projects
      WHERE user_id = $1
      ORDER BY updated_at DESC`,
    [userId],
  );
  return r.rows.map(rowToProject);
}

export async function getProject(id: string, userId: string): Promise<FilmmakerProject | null> {
  const pool = getFilmmakerPool();
  const r = await pool.query(
    `SELECT ${PROJECT_COLUMNS}
       FROM agos_filmmaker_projects
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToProject(r.rows[0]);
}

/**
 * Project enriched with denormalized shot-list stats. The hub page uses
 * these counts to render the stats row without a second roundtrip.
 */
export interface ProjectWithStats extends FilmmakerProject {
  shotCount: number;
  completedShotCount: number;
  totalEstimatedSeconds: number;
}

export async function getProjectWithStats(
  id: string,
  userId: string,
): Promise<ProjectWithStats | null> {
  const pool = getFilmmakerPool();
  const r = await pool.query(
    `SELECT ${PROJECT_COLUMNS_P},
            COALESCE(s.shot_count, 0)              AS shot_count,
            COALESCE(s.completed_shot_count, 0)    AS completed_shot_count,
            COALESCE(s.total_estimated_seconds, 0) AS total_estimated_seconds
       FROM agos_filmmaker_projects p
       LEFT JOIN (
         SELECT project_id,
                COUNT(*)                                       AS shot_count,
                COUNT(*) FILTER (WHERE completed)              AS completed_shot_count,
                COALESCE(SUM(estimated_seconds), 0)            AS total_estimated_seconds
           FROM agos_filmmaker_shots
          GROUP BY project_id
       ) s ON s.project_id = p.id
      WHERE p.id = $1 AND p.user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  const row = r.rows[0];
  return {
    ...rowToProject(row),
    shotCount: Number(row.shot_count),
    completedShotCount: Number(row.completed_shot_count),
    totalEstimatedSeconds: Number(row.total_estimated_seconds),
  };
}

export async function createProject(
  userId: string,
  data: ProjectUpsert | string,
  legacySynopsis?: string,
): Promise<FilmmakerProject> {
  const pool = getFilmmakerPool();
  const id = randomUUID();

  // Legacy call-site: createProject(userId, title, synopsis?)
  // New call-site:    createProject(userId, { name, ... })
  let name: string;
  let description: string | null;
  let status: ProjectStatus;
  let tags: string[];
  let format: ProjectFormat;
  let logline: string | null;
  let coverImageUrl: string | null;
  let phaseProgress: PhaseProgress;
  let targetCompletionDate: string | null;
  let teamSize: number | null;
  let metadata: Record<string, unknown>;

  if (typeof data === 'string') {
    name = data;
    description = legacySynopsis ?? null;
    status = 'pre_production';
    tags = [];
    format = 'feature';
    logline = null;
    coverImageUrl = null;
    phaseProgress = phaseProgressDefault();
    targetCompletionDate = null;
    teamSize = null;
    metadata = {};
  } else {
    name = data.name;
    description = data.description ?? null;
    status = data.status ?? 'pre_production';
    tags = data.tags ?? [];
    format = data.format ?? 'feature';
    logline = data.logline ?? null;
    coverImageUrl = data.coverImageUrl ?? null;
    phaseProgress = data.phaseProgress ?? phaseProgressDefault();
    targetCompletionDate = data.targetCompletionDate ?? null;
    teamSize = data.teamSize ?? null;
    metadata = data.metadata ?? {};
  }

  await pool.query(
    `INSERT INTO agos_filmmaker_projects
       (id, user_id, name, description, status, tags,
        format, logline, cover_image_url, phase_progress,
        target_completion_date, team_size, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13::jsonb)`,
    [
      id,
      userId,
      name,
      description,
      status,
      tags,
      format,
      logline,
      coverImageUrl,
      JSON.stringify(phaseProgress),
      targetCompletionDate,
      teamSize,
      JSON.stringify(metadata),
    ],
  );

  const project = await getProject(id, userId);
  if (!project) throw new Error('Failed to create filmmaker project');
  return project;
}

export async function updateProject(
  id: string,
  userId: string,
  patch: Partial<ProjectUpsert>,
): Promise<FilmmakerProject | null> {
  const pool = getFilmmakerPool();
  await pool.query(
    `UPDATE agos_filmmaker_projects
        SET name                   = COALESCE($3,  name),
            description            = COALESCE($4,  description),
            status                 = COALESCE($5,  status),
            tags                   = COALESCE($6,  tags),
            format                 = COALESCE($7,  format),
            logline                = COALESCE($8,  logline),
            cover_image_url        = COALESCE($9,  cover_image_url),
            phase_progress         = COALESCE($10::jsonb, phase_progress),
            target_completion_date = COALESCE($11, target_completion_date),
            team_size              = COALESCE($12, team_size),
            metadata               = COALESCE($13::jsonb, metadata),
            updated_at             = now()
      WHERE id = $1 AND user_id = $2`,
    [
      id,
      userId,
      patch.name ?? null,
      patch.description ?? null,
      patch.status ?? null,
      patch.tags ?? null,
      patch.format ?? null,
      patch.logline ?? null,
      patch.coverImageUrl ?? null,
      patch.phaseProgress ? JSON.stringify(patch.phaseProgress) : null,
      patch.targetCompletionDate ?? null,
      patch.teamSize ?? null,
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
  patch: Partial<PhaseProgress>,
): Promise<FilmmakerProject | null> {
  const current = await getProject(id, userId);
  if (!current) return null;
  const merged: PhaseProgress = { ...current.phaseProgress, ...patch };
  return updateProject(id, userId, { phaseProgress: coercePhaseProgress(merged) });
}

/**
 * Delete a project. The FK on `agos_filmmaker_shots.project_id` was
 * declared `ON DELETE CASCADE` in migration 0008, so shots are cleaned
 * up automatically.
 */
export async function deleteProject(id: string, userId: string): Promise<boolean> {
  const pool = getFilmmakerPool();
  const r = await pool.query(
    `DELETE FROM agos_filmmaker_projects WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Shot List ───────────────────────────────────────────────────────────────

export async function listShots(projectId: string): Promise<ShotListEntry[]> {
  const pool = getFilmmakerPool();
  const r = await pool.query(
    `SELECT id, project_id, scene_number, shot_number, shot_type, camera_move,
            subject, description, estimated_seconds, completed, created_at, updated_at
       FROM agos_filmmaker_shots
      WHERE project_id = $1
      ORDER BY scene_number, shot_number`,
    [projectId],
  );
  return r.rows.map((row: any) => ({
    id: row.id,
    projectId: row.project_id,
    sceneNumber: row.scene_number,
    shotNumber: row.shot_number,
    shotType: row.shot_type as ShotType,
    cameraMove: row.camera_move as CameraMove,
    subject: row.subject,
    description: row.description,
    estimatedSeconds: row.estimated_seconds === null ? null : Number(row.estimated_seconds),
    completed: row.completed,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}

export interface ShotUpsert {
  sceneNumber: string;
  shotNumber: string;
  shotType: ShotType;
  cameraMove: CameraMove;
  subject: string;
  description?: string;
  estimatedSeconds?: number | null;
}

export async function createShot(projectId: string, data: ShotUpsert): Promise<ShotListEntry> {
  const pool = getFilmmakerPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_filmmaker_shots
       (id, project_id, scene_number, shot_number, shot_type, camera_move,
        subject, description, estimated_seconds)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      projectId,
      data.sceneNumber,
      data.shotNumber,
      data.shotType,
      data.cameraMove,
      data.subject,
      data.description ?? '',
      data.estimatedSeconds ?? null,
    ],
  );
  const rows = await listShots(projectId);
  const created = rows.find((s) => s.id === id);
  if (!created) throw new Error('Failed to create shot');
  return created;
}

export async function toggleShotCompleted(shotId: string): Promise<void> {
  const pool = getFilmmakerPool();
  await pool.query(
    `UPDATE agos_filmmaker_shots
        SET completed = NOT completed, updated_at = now()
      WHERE id = $1`,
    [shotId],
  );
}

// ─── Legacy FilmProject alias ────────────────────────────────────────────────

/** @deprecated — use FilmmakerProject from projects.ts instead */
export type FilmProject = FilmmakerProject;

// ─── Audit ──────────────────────────────────────────────────────────────────

export async function recordAudit(args: {
  actorId: string;
  action: string;
  payload?: Record<string, unknown>;
  projectId?: string;
}): Promise<void> {
  const pool = getFilmmakerPool();
  await pool.query(
    `INSERT INTO agos_audit (id, project_id, actor_id, os_slug, action, payload)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [
      randomUUID(),
      args.projectId ?? null,
      args.actorId,
      'filmmaker',
      args.action,
      JSON.stringify(args.payload ?? {}),
    ],
  );
}

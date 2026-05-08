/**
 * Filmmaker OS — database repository for projects and shot lists.
 *
 * All queries target the `agos_filmmaker_*` tables. Uses the same shared
 * pg Pool as the Health OS to avoid N connections per vertical.
 *
 * ── Exports ─────────────────────────────────────────────────────────────────
 *
 * Projects (Workstream B — new table: agos_filmmaker_projects)
 *   listProjects, getProject, createProject, updateProject
 *
 * Shot List (agos_filmmaker_shots)
 *   listShots, createShot, toggleShotCompleted
 *
 * Audit
 *   recordAudit
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { getFilmmakerPool } from './session';
import type { ShotListEntry, ShotType, CameraMove } from './shots';
import type { FilmmakerProject, ProjectUpsert, ProjectStatus } from './projects';

// ─── Row mappers ─────────────────────────────────────────────────────────────

function rowToProject(row: any): FilmmakerProject {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description ?? null,
    status: row.status as ProjectStatus,
    tags: row.tags ?? [],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// ─── Projects (new Workstream-B table) ───────────────────────────────────────

export async function listProjects(userId: string): Promise<FilmmakerProject[]> {
  const pool = getFilmmakerPool();
  const r = await pool.query(
    `SELECT id, user_id, name, description, status, tags, created_at, updated_at
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
    `SELECT id, user_id, name, description, status, tags, created_at, updated_at
       FROM agos_filmmaker_projects
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToProject(r.rows[0]);
}

export async function createProject(
  userId: string,
  data: ProjectUpsert | string,
  legacySynopsis?: string,
): Promise<FilmmakerProject> {
  const pool = getFilmmakerPool();
  const id = randomUUID();

  // Legacy call-site: createProject(userId, title, synopsis?)
  // New call-site:    createProject(userId, { name, description?, status?, tags? })
  let name: string;
  let description: string | null;
  let status: ProjectStatus;
  let tags: string[];

  if (typeof data === 'string') {
    name = data;
    description = legacySynopsis ?? null;
    status = 'pre_production';
    tags = [];
  } else {
    name = data.name;
    description = data.description ?? null;
    status = data.status ?? 'pre_production';
    tags = data.tags ?? [];
  }

  await pool.query(
    `INSERT INTO agos_filmmaker_projects (id, user_id, name, description, status, tags)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, userId, name, description, status, tags],
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
        SET name        = COALESCE($3, name),
            description = COALESCE($4, description),
            status      = COALESCE($5, status),
            tags        = COALESCE($6, tags),
            updated_at  = now()
      WHERE id = $1 AND user_id = $2`,
    [
      id,
      userId,
      patch.name ?? null,
      patch.description ?? null,
      patch.status ?? null,
      patch.tags ?? null,
    ],
  );
  return getProject(id, userId);
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
// Keep this so existing callers that imported FilmProject continue to compile.

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

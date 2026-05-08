/**
 * Filmmaker OS — database CRUD for shot lists.
 *
 * All queries target the `agos_filmmaker_*` tables added in migration
 * 0008_filmmaker_os.py. Uses the same shared pg Pool as the Health OS to
 * avoid N connections per vertical.
 *
 * @license MIT — original work for Tiresias platform
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { getFilmmakerPool } from './session';
import type { ShotListEntry, ShotType, CameraMove } from './shots';

// ─── Projects ───────────────────────────────────────────────────────────────

export interface FilmProject {
  id: string;
  userId: string;
  title: string;
  synopsis: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listProjects(userId: string): Promise<FilmProject[]> {
  const pool = getFilmmakerPool();
  const r = await pool.query(
    `SELECT id, user_id, title, synopsis, created_at, updated_at
       FROM agos_filmmaker_projects
      WHERE user_id = $1
      ORDER BY updated_at DESC`,
    [userId],
  );
  return r.rows.map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    synopsis: row.synopsis,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}

export async function createProject(userId: string, title: string, synopsis?: string): Promise<FilmProject> {
  const pool = getFilmmakerPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_filmmaker_projects (id, user_id, title, synopsis)
     VALUES ($1, $2, $3, $4)`,
    [id, userId, title, synopsis ?? null],
  );
  const r = await pool.query(
    `SELECT id, user_id, title, synopsis, created_at, updated_at
       FROM agos_filmmaker_projects WHERE id = $1`,
    [id],
  );
  const row = r.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    synopsis: row.synopsis,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
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

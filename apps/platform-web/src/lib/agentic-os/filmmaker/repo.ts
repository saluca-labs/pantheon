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
import {
  STORY_DOCUMENT_KIND_VALUES,
  extractPlainText,
  countWords,
  getStoryDocumentKindInfo,
  type StoryDocument,
  type StoryDocumentKind,
  type StoryDocumentVersion,
  type ProseMirrorJson,
} from './story-documents';
import {
  CHARACTER_ROLE_VALUES,
  RELATIONSHIP_KIND_VALUES,
  RELATIONSHIP_DIRECTION_VALUES,
  type Character,
  type CharacterRole,
  type CharacterUpsert,
  type CharacterRelationship,
  type RelationshipKind,
  type RelationshipDirection,
  type CharacterRelationshipUpsert,
} from './characters';
import {
  SCREENPLAY_FORMAT_VALUES,
  SCREENPLAY_STATUS_VALUES,
  type Screenplay,
  type ScreenplayFormat,
  type ScreenplayStatus,
  type ScreenplayUpsert,
  type ScreenplayVersion,
  type ScreenplayScene,
} from './screenplays';
import { parseFountain, countWords as countFountainWords } from './fountain-parser';

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

// ─── Story Documents ────────────────────────────────────────────────────────

const STORY_DOC_COLUMNS = `id, project_id, kind, title, content_json,
                           content_text, version, word_count, metadata,
                           created_at, updated_at`;

function rowToStoryDocument(row: any): StoryDocument {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind as StoryDocumentKind,
    title: row.title,
    contentJson: (row.content_json as ProseMirrorJson) ?? {},
    contentText: row.content_text ?? '',
    version: Number(row.version),
    wordCount: Number(row.word_count),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function rowToStoryDocumentVersion(row: any): StoryDocumentVersion {
  return {
    id: row.id,
    documentId: row.document_id,
    version: Number(row.version),
    contentJson: (row.content_json as ProseMirrorJson) ?? {},
    contentText: row.content_text ?? '',
    wordCount: Number(row.word_count),
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * List all story documents for a project. The caller is responsible
 * for verifying project ownership through `getProject` first; this
 * function does its own ownership check via the project join so a
 * cross-tenant call returns an empty array rather than leaking rows.
 *
 * `tenantId` is currently accepted for API parity with the rest of the
 * Agentic OS suite but is not used directly: the filmmaker project
 * table is user-scoped (no tenant_id column). Once filmmaker grows a
 * tenant_id column the join here gains an `AND tenant_id = $3` clause.
 */
export async function listStoryDocuments(
  projectId: string,
  _tenantId: string,
  userId: string,
): Promise<StoryDocument[]> {
  const pool = getFilmmakerPool();
  const r = await pool.query(
    `SELECT ${STORY_DOC_COLUMNS.split(',').map((c) => `d.${c.trim()}`).join(', ')}
       FROM agos_filmmaker_story_documents d
       JOIN agos_filmmaker_projects p ON p.id = d.project_id
      WHERE d.project_id = $1 AND p.user_id = $2
      ORDER BY d.updated_at DESC`,
    [projectId, userId],
  );
  return r.rows.map(rowToStoryDocument);
}

export async function getStoryDocument(
  documentId: string,
  _tenantId: string,
  userId: string,
): Promise<StoryDocument | null> {
  const pool = getFilmmakerPool();
  const r = await pool.query(
    `SELECT ${STORY_DOC_COLUMNS.split(',').map((c) => `d.${c.trim()}`).join(', ')}
       FROM agos_filmmaker_story_documents d
       JOIN agos_filmmaker_projects p ON p.id = d.project_id
      WHERE d.id = $1 AND p.user_id = $2`,
    [documentId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToStoryDocument(r.rows[0]);
}

export interface CreateStoryDocumentArgs {
  projectId: string;
  tenantId: string;
  userId: string;
  kind: StoryDocumentKind;
  title?: string;
  contentJson?: ProseMirrorJson;
}

export async function createStoryDocument(
  args: CreateStoryDocumentArgs,
): Promise<StoryDocument> {
  const { projectId, userId, kind } = args;
  if (!(STORY_DOCUMENT_KIND_VALUES as readonly string[]).includes(kind)) {
    throw new Error(`Invalid story document kind: ${kind}`);
  }

  const project = await getProject(projectId, userId);
  if (!project) throw new Error('Project not found or not owned by user');

  const title =
    args.title && args.title.trim().length > 0
      ? args.title.trim()
      : getStoryDocumentKindInfo(kind).defaultTitle(project.name);

  const contentJson = args.contentJson ?? {};
  const contentText = extractPlainText(contentJson);
  const wordCount = countWords(contentText);

  const id = randomUUID();
  const pool = getFilmmakerPool();
  await pool.query(
    `INSERT INTO agos_filmmaker_story_documents
       (id, project_id, kind, title, content_json, content_text,
        version, word_count, metadata)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,1,$7,'{}'::jsonb)`,
    [id, projectId, kind, title, JSON.stringify(contentJson), contentText, wordCount],
  );

  const created = await getStoryDocument(id, args.tenantId, userId);
  if (!created) throw new Error('Failed to create story document');
  return created;
}

export interface UpdateStoryDocumentArgs {
  id: string;
  tenantId: string;
  userId: string;
  contentJson?: ProseMirrorJson;
  title?: string;
}

/**
 * Update content and/or title. Recomputes content_text + word_count from
 * the new contentJson server-side and bumps `version`. Does NOT auto-write
 * a version-history row; snapshotting is a separate explicit action.
 */
export async function updateStoryDocument(
  args: UpdateStoryDocumentArgs,
): Promise<StoryDocument | null> {
  const existing = await getStoryDocument(args.id, args.tenantId, args.userId);
  if (!existing) return null;

  const nextContentJson = args.contentJson ?? existing.contentJson;
  const nextTitle =
    typeof args.title === 'string' && args.title.trim().length > 0
      ? args.title.trim()
      : existing.title;
  const nextContentText =
    args.contentJson !== undefined ? extractPlainText(nextContentJson) : existing.contentText;
  const nextWordCount =
    args.contentJson !== undefined ? countWords(nextContentText) : existing.wordCount;

  const pool = getFilmmakerPool();
  await pool.query(
    `UPDATE agos_filmmaker_story_documents
        SET title        = $2,
            content_json = $3::jsonb,
            content_text = $4,
            word_count   = $5,
            version      = version + 1,
            updated_at   = now()
      WHERE id = $1`,
    [args.id, nextTitle, JSON.stringify(nextContentJson), nextContentText, nextWordCount],
  );

  return getStoryDocument(args.id, args.tenantId, args.userId);
}

/**
 * Copy the document's current state into the version-history table.
 * Returns the freshly-written version row.
 */
export async function snapshotStoryDocument(args: {
  id: string;
  tenantId: string;
  userId: string;
}): Promise<StoryDocumentVersion | null> {
  const doc = await getStoryDocument(args.id, args.tenantId, args.userId);
  if (!doc) return null;

  const versionId = randomUUID();
  const pool = getFilmmakerPool();
  await pool.query(
    `INSERT INTO agos_filmmaker_story_document_versions
       (id, document_id, version, content_json, content_text, word_count)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
    [
      versionId,
      doc.id,
      doc.version,
      JSON.stringify(doc.contentJson),
      doc.contentText,
      doc.wordCount,
    ],
  );

  const r = await pool.query(
    `SELECT id, document_id, version, content_json, content_text,
            word_count, created_at
       FROM agos_filmmaker_story_document_versions
      WHERE id = $1`,
    [versionId],
  );
  return rowToStoryDocumentVersion(r.rows[0]);
}

export async function listStoryDocumentVersions(
  documentId: string,
  tenantId: string,
  userId: string,
): Promise<StoryDocumentVersion[]> {
  // Ownership gate: must own the document via project FK.
  const doc = await getStoryDocument(documentId, tenantId, userId);
  if (!doc) return [];

  const pool = getFilmmakerPool();
  const r = await pool.query(
    `SELECT id, document_id, version, content_json, content_text,
            word_count, created_at
       FROM agos_filmmaker_story_document_versions
      WHERE document_id = $1
      ORDER BY version DESC, created_at DESC`,
    [documentId],
  );
  return r.rows.map(rowToStoryDocumentVersion);
}

/**
 * Restore a prior version back into the live document. Before
 * overwriting, snapshots the current state so the restore itself can be
 * undone. The live document's `version` is bumped by 1.
 */
export async function restoreStoryDocumentVersion(args: {
  documentId: string;
  versionId: string;
  tenantId: string;
  userId: string;
}): Promise<StoryDocument | null> {
  const doc = await getStoryDocument(args.documentId, args.tenantId, args.userId);
  if (!doc) return null;

  const pool = getFilmmakerPool();
  const r = await pool.query(
    `SELECT id, document_id, version, content_json, content_text, word_count, created_at
       FROM agos_filmmaker_story_document_versions
      WHERE id = $1 AND document_id = $2`,
    [args.versionId, args.documentId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  const target = rowToStoryDocumentVersion(r.rows[0]);

  // Snapshot the pre-restore state so the restore is itself undoable.
  await snapshotStoryDocument({
    id: args.documentId,
    tenantId: args.tenantId,
    userId: args.userId,
  });

  await pool.query(
    `UPDATE agos_filmmaker_story_documents
        SET content_json = $2::jsonb,
            content_text = $3,
            word_count   = $4,
            version      = version + 1,
            updated_at   = now()
      WHERE id = $1`,
    [
      args.documentId,
      JSON.stringify(target.contentJson),
      target.contentText,
      target.wordCount,
    ],
  );

  return getStoryDocument(args.documentId, args.tenantId, args.userId);
}

export async function deleteStoryDocument(
  documentId: string,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const doc = await getStoryDocument(documentId, tenantId, userId);
  if (!doc) return false;

  const pool = getFilmmakerPool();
  const r = await pool.query(
    `DELETE FROM agos_filmmaker_story_documents WHERE id = $1`,
    [documentId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Characters ─────────────────────────────────────────────────────────────

const CHARACTER_COLUMNS = `id, project_id, name, role, archetype, logline,
                           age, pronouns, gender, occupation,
                           backstory, goals, needs, fears, wounds, arc,
                           voice_notes, physical_description, portrait_url,
                           tags, metadata, created_at, updated_at`;

function rowToCharacter(row: any): Character {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    role: row.role as CharacterRole,
    archetype: row.archetype ?? null,
    logline: row.logline ?? null,
    age: row.age ?? null,
    pronouns: row.pronouns ?? null,
    gender: row.gender ?? null,
    occupation: row.occupation ?? null,
    backstory: row.backstory ?? null,
    goals: row.goals ?? null,
    needs: row.needs ?? null,
    fears: row.fears ?? null,
    wounds: row.wounds ?? null,
    arc: row.arc ?? null,
    voiceNotes: row.voice_notes ?? null,
    physicalDescription: row.physical_description ?? null,
    portraitUrl: row.portrait_url ?? null,
    tags: row.tags ?? [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface ListCharactersArgs {
  projectId: string;
  tenantId: string;
  userId: string;
  q?: string;
  role?: CharacterRole;
}

export async function listCharacters(args: ListCharactersArgs): Promise<Character[]> {
  const pool = getFilmmakerPool();
  const columns = CHARACTER_COLUMNS.split(',').map((c) => `c.${c.trim()}`).join(', ');
  const params: any[] = [args.projectId, args.userId];
  const where: string[] = [`c.project_id = $1`, `p.user_id = $2`];
  if (args.role) {
    params.push(args.role);
    where.push(`c.role = $${params.length}`);
  }
  if (args.q && args.q.trim().length > 0) {
    params.push(`%${args.q.trim()}%`);
    where.push(`c.name ILIKE $${params.length}`);
  }
  const r = await pool.query(
    `SELECT ${columns}
       FROM agos_filmmaker_characters c
       JOIN agos_filmmaker_projects p ON p.id = c.project_id
      WHERE ${where.join(' AND ')}
      ORDER BY c.name ASC`,
    params,
  );
  return r.rows.map(rowToCharacter);
}

export async function getCharacter(
  characterId: string,
  userId: string,
): Promise<Character | null> {
  const pool = getFilmmakerPool();
  const columns = CHARACTER_COLUMNS.split(',').map((c) => `c.${c.trim()}`).join(', ');
  const r = await pool.query(
    `SELECT ${columns}
       FROM agos_filmmaker_characters c
       JOIN agos_filmmaker_projects p ON p.id = c.project_id
      WHERE c.id = $1 AND p.user_id = $2`,
    [characterId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToCharacter(r.rows[0]);
}

export interface CreateCharacterArgs {
  projectId: string;
  tenantId: string;
  userId: string;
  data: CharacterUpsert;
}

export async function createCharacter(args: CreateCharacterArgs): Promise<Character> {
  const { projectId, userId, data } = args;
  if (typeof data.name !== 'string' || data.name.trim().length === 0) {
    throw new Error('Character name is required');
  }
  const role: CharacterRole = data.role ?? 'supporting';
  if (!(CHARACTER_ROLE_VALUES as readonly string[]).includes(role)) {
    throw new Error(`Invalid character role: ${role}`);
  }

  const project = await getProject(projectId, userId);
  if (!project) throw new Error('Project not found or not owned by user');

  const id = randomUUID();
  const pool = getFilmmakerPool();
  await pool.query(
    `INSERT INTO agos_filmmaker_characters
       (id, project_id, name, role, archetype, logline,
        age, pronouns, gender, occupation,
        backstory, goals, needs, fears, wounds, arc,
        voice_notes, physical_description, portrait_url,
        tags, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
             $11,$12,$13,$14,$15,$16,$17,$18,$19,
             $20,$21::jsonb)`,
    [
      id,
      projectId,
      data.name.trim(),
      role,
      data.archetype ?? null,
      data.logline ?? null,
      data.age ?? null,
      data.pronouns ?? null,
      data.gender ?? null,
      data.occupation ?? null,
      data.backstory ?? null,
      data.goals ?? null,
      data.needs ?? null,
      data.fears ?? null,
      data.wounds ?? null,
      data.arc ?? null,
      data.voiceNotes ?? null,
      data.physicalDescription ?? null,
      data.portraitUrl ?? null,
      data.tags ?? [],
      JSON.stringify(data.metadata ?? {}),
    ],
  );

  const created = await getCharacter(id, userId);
  if (!created) throw new Error('Failed to create character');
  return created;
}

export interface UpdateCharacterArgs {
  id: string;
  tenantId: string;
  userId: string;
  patch: Partial<CharacterUpsert>;
}

export async function updateCharacter(args: UpdateCharacterArgs): Promise<Character | null> {
  const existing = await getCharacter(args.id, args.userId);
  if (!existing) return null;

  const patch = args.patch;
  if (
    patch.role !== undefined &&
    !(CHARACTER_ROLE_VALUES as readonly string[]).includes(patch.role)
  ) {
    throw new Error(`Invalid character role: ${patch.role}`);
  }
  if (patch.name !== undefined) {
    if (typeof patch.name !== 'string' || patch.name.trim().length === 0) {
      throw new Error('Character name cannot be empty');
    }
  }

  const pool = getFilmmakerPool();
  await pool.query(
    `UPDATE agos_filmmaker_characters
        SET name                 = COALESCE($2,  name),
            role                 = COALESCE($3,  role),
            archetype            = COALESCE($4,  archetype),
            logline              = COALESCE($5,  logline),
            age                  = COALESCE($6,  age),
            pronouns             = COALESCE($7,  pronouns),
            gender               = COALESCE($8,  gender),
            occupation           = COALESCE($9,  occupation),
            backstory            = COALESCE($10, backstory),
            goals                = COALESCE($11, goals),
            needs                = COALESCE($12, needs),
            fears                = COALESCE($13, fears),
            wounds               = COALESCE($14, wounds),
            arc                  = COALESCE($15, arc),
            voice_notes          = COALESCE($16, voice_notes),
            physical_description = COALESCE($17, physical_description),
            portrait_url         = COALESCE($18, portrait_url),
            tags                 = COALESCE($19, tags),
            metadata             = COALESCE($20::jsonb, metadata),
            updated_at           = now()
      WHERE id = $1`,
    [
      args.id,
      patch.name?.trim() ?? null,
      patch.role ?? null,
      patch.archetype ?? null,
      patch.logline ?? null,
      patch.age ?? null,
      patch.pronouns ?? null,
      patch.gender ?? null,
      patch.occupation ?? null,
      patch.backstory ?? null,
      patch.goals ?? null,
      patch.needs ?? null,
      patch.fears ?? null,
      patch.wounds ?? null,
      patch.arc ?? null,
      patch.voiceNotes ?? null,
      patch.physicalDescription ?? null,
      patch.portraitUrl ?? null,
      patch.tags ?? null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  return getCharacter(args.id, args.userId);
}

export async function deleteCharacter(
  characterId: string,
  userId: string,
): Promise<boolean> {
  const existing = await getCharacter(characterId, userId);
  if (!existing) return false;
  const pool = getFilmmakerPool();
  const r = await pool.query(
    `DELETE FROM agos_filmmaker_characters WHERE id = $1`,
    [characterId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Character relationships ─────────────────────────────────────────────────

const RELATIONSHIP_COLUMNS = `id, project_id, from_id, to_id, kind, direction,
                              description, tension, created_at, updated_at`;

function rowToRelationship(row: any): CharacterRelationship {
  return {
    id: row.id,
    projectId: row.project_id,
    fromId: row.from_id,
    toId: row.to_id,
    kind: row.kind as RelationshipKind,
    direction: row.direction as RelationshipDirection,
    description: row.description ?? null,
    tension: row.tension == null ? null : Number(row.tension),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface ListRelationshipsArgs {
  projectId: string;
  tenantId: string;
  userId: string;
  characterId?: string;
}

export async function listCharacterRelationships(
  args: ListRelationshipsArgs,
): Promise<CharacterRelationship[]> {
  const pool = getFilmmakerPool();
  const columns = RELATIONSHIP_COLUMNS.split(',').map((c) => `r.${c.trim()}`).join(', ');
  const params: any[] = [args.projectId, args.userId];
  const where: string[] = [`r.project_id = $1`, `p.user_id = $2`];
  if (args.characterId) {
    params.push(args.characterId);
    where.push(`(r.from_id = $${params.length} OR r.to_id = $${params.length})`);
  }
  const r = await pool.query(
    `SELECT ${columns}
       FROM agos_filmmaker_character_relationships r
       JOIN agos_filmmaker_projects p ON p.id = r.project_id
      WHERE ${where.join(' AND ')}
      ORDER BY r.created_at ASC`,
    params,
  );
  return r.rows.map(rowToRelationship);
}

export async function getCharacterRelationship(
  relationshipId: string,
  userId: string,
): Promise<CharacterRelationship | null> {
  const pool = getFilmmakerPool();
  const columns = RELATIONSHIP_COLUMNS.split(',').map((c) => `r.${c.trim()}`).join(', ');
  const res = await pool.query(
    `SELECT ${columns}
       FROM agos_filmmaker_character_relationships r
       JOIN agos_filmmaker_projects p ON p.id = r.project_id
      WHERE r.id = $1 AND p.user_id = $2`,
    [relationshipId, userId],
  );
  if ((res.rowCount ?? 0) === 0) return null;
  return rowToRelationship(res.rows[0]);
}

export interface CreateRelationshipArgs {
  tenantId: string;
  userId: string;
  data: CharacterRelationshipUpsert;
}

export async function createCharacterRelationship(
  args: CreateRelationshipArgs,
): Promise<CharacterRelationship> {
  const { userId, data } = args;
  if (data.fromId === data.toId) {
    throw new Error('A character cannot have a relationship with themselves');
  }
  const kind: RelationshipKind = data.kind ?? 'other';
  if (!(RELATIONSHIP_KIND_VALUES as readonly string[]).includes(kind)) {
    throw new Error(`Invalid relationship kind: ${kind}`);
  }
  const direction: RelationshipDirection = data.direction ?? 'mutual';
  if (!(RELATIONSHIP_DIRECTION_VALUES as readonly string[]).includes(direction)) {
    throw new Error(`Invalid relationship direction: ${direction}`);
  }
  if (data.tension != null && (data.tension < 0 || data.tension > 10)) {
    throw new Error('Tension must be between 0 and 10');
  }

  const from = await getCharacter(data.fromId, userId);
  const to = await getCharacter(data.toId, userId);
  if (!from || !to) {
    throw new Error('Character not found or not owned by user');
  }
  if (from.projectId !== to.projectId) {
    throw new Error('Both characters must belong to the same project');
  }

  const id = randomUUID();
  const pool = getFilmmakerPool();
  await pool.query(
    `INSERT INTO agos_filmmaker_character_relationships
       (id, project_id, from_id, to_id, kind, direction, description, tension)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      id,
      from.projectId,
      data.fromId,
      data.toId,
      kind,
      direction,
      data.description ?? null,
      data.tension ?? null,
    ],
  );

  const created = await getCharacterRelationship(id, userId);
  if (!created) throw new Error('Failed to create relationship');
  return created;
}

export interface UpdateRelationshipArgs {
  id: string;
  tenantId: string;
  userId: string;
  patch: Partial<Omit<CharacterRelationshipUpsert, 'fromId' | 'toId'>>;
}

export async function updateCharacterRelationship(
  args: UpdateRelationshipArgs,
): Promise<CharacterRelationship | null> {
  const existing = await getCharacterRelationship(args.id, args.userId);
  if (!existing) return null;

  const patch = args.patch;
  if (
    patch.kind !== undefined &&
    !(RELATIONSHIP_KIND_VALUES as readonly string[]).includes(patch.kind)
  ) {
    throw new Error(`Invalid relationship kind: ${patch.kind}`);
  }
  if (
    patch.direction !== undefined &&
    !(RELATIONSHIP_DIRECTION_VALUES as readonly string[]).includes(patch.direction)
  ) {
    throw new Error(`Invalid relationship direction: ${patch.direction}`);
  }
  if (patch.tension != null && (patch.tension < 0 || patch.tension > 10)) {
    throw new Error('Tension must be between 0 and 10');
  }

  const pool = getFilmmakerPool();
  await pool.query(
    `UPDATE agos_filmmaker_character_relationships
        SET kind        = COALESCE($2, kind),
            direction   = COALESCE($3, direction),
            description = COALESCE($4, description),
            tension     = COALESCE($5, tension),
            updated_at  = now()
      WHERE id = $1`,
    [
      args.id,
      patch.kind ?? null,
      patch.direction ?? null,
      patch.description ?? null,
      patch.tension ?? null,
    ],
  );
  return getCharacterRelationship(args.id, args.userId);
}

export async function deleteCharacterRelationship(
  relationshipId: string,
  userId: string,
): Promise<boolean> {
  const existing = await getCharacterRelationship(relationshipId, userId);
  if (!existing) return false;
  const pool = getFilmmakerPool();
  const r = await pool.query(
    `DELETE FROM agos_filmmaker_character_relationships WHERE id = $1`,
    [relationshipId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Screenplays ────────────────────────────────────────────────────────────

const SCREENPLAY_COLUMNS = `id, project_id, title, format, status,
                            head_version_id, metadata, created_at, updated_at`;

const SCREENPLAY_VERSION_COLUMNS = `id, screenplay_id, version_number, label,
                                    is_head, fountain_text, word_count,
                                    page_count_estimate, created_at`;

const SCREENPLAY_SCENE_COLUMNS = `id, screenplay_id, version_id, scene_number,
                                  heading, interior, location, time_of_day,
                                  page_start, eighths, dialogue_word_counts,
                                  action_text, dialogue_text, metadata`;

function rowToScreenplay(row: any): Screenplay {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    format: row.format as ScreenplayFormat,
    status: row.status as ScreenplayStatus,
    headVersionId: row.head_version_id ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function rowToScreenplayVersion(row: any): ScreenplayVersion {
  return {
    id: row.id,
    screenplayId: row.screenplay_id,
    versionNumber: Number(row.version_number),
    label: row.label ?? null,
    isHead: Boolean(row.is_head),
    fountainText: row.fountain_text ?? '',
    wordCount: Number(row.word_count),
    pageCountEstimate: Number(row.page_count_estimate),
    createdAt: row.created_at.toISOString(),
  };
}

function rowToScreenplayScene(row: any): ScreenplayScene {
  return {
    id: row.id,
    screenplayId: row.screenplay_id,
    versionId: row.version_id,
    sceneNumber: Number(row.scene_number),
    heading: row.heading,
    interior: row.interior == null ? null : Boolean(row.interior),
    location: row.location ?? null,
    timeOfDay: row.time_of_day ?? null,
    pageStart: row.page_start == null ? null : Number(row.page_start),
    eighths: row.eighths == null ? null : Number(row.eighths),
    dialogueWordCounts: (row.dialogue_word_counts as Record<string, number>) ?? {},
    actionText: row.action_text ?? null,
    dialogueText: row.dialogue_text ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

/**
 * Lookup the project's screenplay (returns null when none exists).
 * Projects rarely have more than one screenplay in practice; the
 * routes auto-create on first GET to keep the editor stateless.
 */
export async function getScreenplayByProject(
  projectId: string,
  userId: string,
): Promise<Screenplay | null> {
  const pool = getFilmmakerPool();
  const columns = SCREENPLAY_COLUMNS.split(',').map((c) => `s.${c.trim()}`).join(', ');
  const r = await pool.query(
    `SELECT ${columns}
       FROM agos_filmmaker_screenplays s
       JOIN agos_filmmaker_projects p ON p.id = s.project_id
      WHERE s.project_id = $1 AND p.user_id = $2
      ORDER BY s.created_at ASC
      LIMIT 1`,
    [projectId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToScreenplay(r.rows[0]);
}

export async function getScreenplay(
  screenplayId: string,
  userId: string,
): Promise<Screenplay | null> {
  const pool = getFilmmakerPool();
  const columns = SCREENPLAY_COLUMNS.split(',').map((c) => `s.${c.trim()}`).join(', ');
  const r = await pool.query(
    `SELECT ${columns}
       FROM agos_filmmaker_screenplays s
       JOIN agos_filmmaker_projects p ON p.id = s.project_id
      WHERE s.id = $1 AND p.user_id = $2`,
    [screenplayId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToScreenplay(r.rows[0]);
}

export interface CreateScreenplayArgs {
  projectId: string;
  userId: string;
  title?: string;
  format?: ScreenplayFormat;
  status?: ScreenplayStatus;
}

/**
 * Create a screenplay together with its initial empty version (v1, head).
 * Returns the new screenplay.
 */
export async function createScreenplay(args: CreateScreenplayArgs): Promise<Screenplay> {
  const project = await getProject(args.projectId, args.userId);
  if (!project) throw new Error('Project not found or not owned by user');

  const format: ScreenplayFormat = args.format ?? 'feature';
  if (!(SCREENPLAY_FORMAT_VALUES as readonly string[]).includes(format)) {
    throw new Error(`Invalid screenplay format: ${format}`);
  }
  const status: ScreenplayStatus = args.status ?? 'draft';
  if (!(SCREENPLAY_STATUS_VALUES as readonly string[]).includes(status)) {
    throw new Error(`Invalid screenplay status: ${status}`);
  }

  const title =
    args.title && args.title.trim().length > 0
      ? args.title.trim()
      : `${project.name} — Screenplay`;

  const pool = getFilmmakerPool();
  const client = await pool.connect();
  const screenplayId = randomUUID();
  const versionId = randomUUID();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO agos_filmmaker_screenplays
         (id, project_id, title, format, status, head_version_id, metadata)
       VALUES ($1,$2,$3,$4,$5,NULL,'{}'::jsonb)`,
      [screenplayId, args.projectId, title, format, status],
    );
    await client.query(
      `INSERT INTO agos_filmmaker_screenplay_versions
         (id, screenplay_id, version_number, label, is_head,
          fountain_text, word_count, page_count_estimate)
       VALUES ($1,$2,1,NULL,true,'',0,0)`,
      [versionId, screenplayId],
    );
    await client.query(
      `UPDATE agos_filmmaker_screenplays
          SET head_version_id = $2, updated_at = now()
        WHERE id = $1`,
      [screenplayId, versionId],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const created = await getScreenplay(screenplayId, args.userId);
  if (!created) throw new Error('Failed to create screenplay');
  return created;
}

export interface UpdateScreenplayMetaArgs {
  id: string;
  userId: string;
  patch: ScreenplayUpsert;
}

export async function updateScreenplayMeta(
  args: UpdateScreenplayMetaArgs,
): Promise<Screenplay | null> {
  const existing = await getScreenplay(args.id, args.userId);
  if (!existing) return null;

  const { patch } = args;
  if (
    patch.format !== undefined &&
    !(SCREENPLAY_FORMAT_VALUES as readonly string[]).includes(patch.format)
  ) {
    throw new Error(`Invalid screenplay format: ${patch.format}`);
  }
  if (
    patch.status !== undefined &&
    !(SCREENPLAY_STATUS_VALUES as readonly string[]).includes(patch.status)
  ) {
    throw new Error(`Invalid screenplay status: ${patch.status}`);
  }
  if (patch.title !== undefined) {
    if (typeof patch.title !== 'string' || patch.title.trim().length === 0) {
      throw new Error('Screenplay title cannot be empty');
    }
  }

  const pool = getFilmmakerPool();
  await pool.query(
    `UPDATE agos_filmmaker_screenplays
        SET title      = COALESCE($2, title),
            format     = COALESCE($3, format),
            status     = COALESCE($4, status),
            metadata   = COALESCE($5::jsonb, metadata),
            updated_at = now()
      WHERE id = $1`,
    [
      args.id,
      patch.title?.trim() ?? null,
      patch.format ?? null,
      patch.status ?? null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  return getScreenplay(args.id, args.userId);
}

export async function listScreenplayVersions(
  screenplayId: string,
  userId: string,
): Promise<ScreenplayVersion[]> {
  const screenplay = await getScreenplay(screenplayId, userId);
  if (!screenplay) return [];
  const pool = getFilmmakerPool();
  const r = await pool.query(
    `SELECT ${SCREENPLAY_VERSION_COLUMNS}
       FROM agos_filmmaker_screenplay_versions
      WHERE screenplay_id = $1
      ORDER BY version_number DESC`,
    [screenplayId],
  );
  return r.rows.map(rowToScreenplayVersion);
}

export async function getScreenplayVersion(
  versionId: string,
  userId: string,
): Promise<ScreenplayVersion | null> {
  const pool = getFilmmakerPool();
  const columns = SCREENPLAY_VERSION_COLUMNS.split(',').map((c) => `v.${c.trim()}`).join(', ');
  const r = await pool.query(
    `SELECT ${columns}
       FROM agos_filmmaker_screenplay_versions v
       JOIN agos_filmmaker_screenplays s ON s.id = v.screenplay_id
       JOIN agos_filmmaker_projects   p ON p.id = s.project_id
      WHERE v.id = $1 AND p.user_id = $2`,
    [versionId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToScreenplayVersion(r.rows[0]);
}

export async function listScreenplayScenes(
  versionId: string,
  userId: string,
): Promise<ScreenplayScene[]> {
  const version = await getScreenplayVersion(versionId, userId);
  if (!version) return [];
  const pool = getFilmmakerPool();
  const r = await pool.query(
    `SELECT ${SCREENPLAY_SCENE_COLUMNS}
       FROM agos_filmmaker_screenplay_scenes
      WHERE version_id = $1
      ORDER BY scene_number ASC`,
    [versionId],
  );
  return r.rows.map(rowToScreenplayScene);
}

export async function getScreenplayScene(
  sceneId: string,
  userId: string,
): Promise<ScreenplayScene | null> {
  const pool = getFilmmakerPool();
  const columns = SCREENPLAY_SCENE_COLUMNS.split(',').map((c) => `sc.${c.trim()}`).join(', ');
  const r = await pool.query(
    `SELECT ${columns}
       FROM agos_filmmaker_screenplay_scenes sc
       JOIN agos_filmmaker_screenplays s ON s.id = sc.screenplay_id
       JOIN agos_filmmaker_projects   p ON p.id = s.project_id
      WHERE sc.id = $1 AND p.user_id = $2`,
    [sceneId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToScreenplayScene(r.rows[0]);
}

export interface SaveDraftVersionArgs {
  screenplayId: string;
  userId: string;
  fountainText: string;
  label?: string | null;
}

/**
 * Save a new version of the screenplay. Parses the Fountain text,
 * writes the new version + replaces scenes, clears the previous head
 * flag, and flips this version to head. All in one transaction so
 * a half-saved version can't leave stale scenes behind.
 */
export async function saveDraftVersion(
  args: SaveDraftVersionArgs,
): Promise<{ version: ScreenplayVersion; scenes: ScreenplayScene[] } | null> {
  const screenplay = await getScreenplay(args.screenplayId, args.userId);
  if (!screenplay) return null;

  const parsed = parseFountain(args.fountainText);
  const wordCount = parsed.totalWordCount;
  const pageCount = parsed.pageCountEstimate;

  const pool = getFilmmakerPool();
  const client = await pool.connect();
  const versionId = randomUUID();
  try {
    await client.query('BEGIN');

    const numRow = await client.query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
         FROM agos_filmmaker_screenplay_versions
        WHERE screenplay_id = $1`,
      [args.screenplayId],
    );
    const nextVersionNumber = Number(numRow.rows[0].next_version);

    // Clear previous head.
    await client.query(
      `UPDATE agos_filmmaker_screenplay_versions
          SET is_head = false
        WHERE screenplay_id = $1 AND is_head = true`,
      [args.screenplayId],
    );

    // Insert new version (head=true).
    await client.query(
      `INSERT INTO agos_filmmaker_screenplay_versions
         (id, screenplay_id, version_number, label, is_head,
          fountain_text, word_count, page_count_estimate)
       VALUES ($1,$2,$3,$4,true,$5,$6,$7)`,
      [
        versionId,
        args.screenplayId,
        nextVersionNumber,
        args.label?.trim() || null,
        args.fountainText,
        wordCount,
        pageCount,
      ],
    );

    // Insert scenes for this new version.
    for (const scene of parsed.scenes) {
      await client.query(
        `INSERT INTO agos_filmmaker_screenplay_scenes
           (id, screenplay_id, version_id, scene_number, heading,
            interior, location, time_of_day, page_start,
            dialogue_word_counts, action_text, dialogue_text, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,'{}'::jsonb)`,
        [
          randomUUID(),
          args.screenplayId,
          versionId,
          scene.sceneNumber,
          scene.heading,
          scene.interior ?? null,
          scene.location ?? null,
          scene.timeOfDay ?? null,
          scene.pageStart,
          JSON.stringify(scene.dialogueWordCounts),
          scene.actionText,
          scene.dialogueText,
        ],
      );
    }

    // Flip the screenplay's head pointer.
    await client.query(
      `UPDATE agos_filmmaker_screenplays
          SET head_version_id = $2, updated_at = now()
        WHERE id = $1`,
      [args.screenplayId, versionId],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const version = await getScreenplayVersion(versionId, args.userId);
  const scenes = await listScreenplayScenes(versionId, args.userId);
  if (!version) throw new Error('Failed to save draft version');
  return { version, scenes };
}

/**
 * Restore a historical version by copying its `fountain_text` into a
 * brand-new version that becomes head. The original version stays put.
 */
export async function restoreScreenplayVersion(
  versionId: string,
  userId: string,
): Promise<{ version: ScreenplayVersion; scenes: ScreenplayScene[] } | null> {
  const target = await getScreenplayVersion(versionId, userId);
  if (!target) return null;
  return saveDraftVersion({
    screenplayId: target.screenplayId,
    userId,
    fountainText: target.fountainText,
    label: `Restored from v${target.versionNumber}`,
  });
}

export async function deleteScreenplay(
  screenplayId: string,
  userId: string,
): Promise<boolean> {
  const existing = await getScreenplay(screenplayId, userId);
  if (!existing) return false;
  const pool = getFilmmakerPool();
  const r = await pool.query(
    `DELETE FROM agos_filmmaker_screenplays WHERE id = $1`,
    [screenplayId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Convenience helper that mirrors the "auto-create on first GET" flow
 * used by the project screenplay route.
 */
export async function getOrCreateScreenplayForProject(
  projectId: string,
  userId: string,
): Promise<Screenplay> {
  const existing = await getScreenplayByProject(projectId, userId);
  if (existing) return existing;
  return createScreenplay({ projectId, userId });
}

// Re-export for fountain-text word counting parity in tests / routes.
export { countFountainWords };

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

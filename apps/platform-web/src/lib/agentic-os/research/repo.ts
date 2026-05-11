/**
 * Research OS — database repository for hypotheses and experiments.
 *
 * All queries target `agos_research_hypotheses` and `agos_research_experiments`
 * introduced in migration 0005_research_os.py, with experiments promoted to a
 * first-class per-OS project entity in 0041_research_phase1.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getResearchPool } from './session';
import type { Hypothesis, HypothesisStatus, ConfidenceLevel, ExperimentDesign } from './hypotheses';
import {
  EXPERIMENT_STATUSES,
  coercePhaseProgress,
  phaseProgressDefault,
  type ExperimentStatus,
  type PhaseProgress,
} from './experiments';

// ─── Hypotheses ────────────────────────────────────────────────────────────

export interface HypothesisUpsert {
  title: string;
  ifClause: string;
  thenClause: string;
  becauseClause: string;
  status?: HypothesisStatus;
  confidence?: ConfidenceLevel;
  tags?: string[];
}

function rowToHypothesis(row: any): Hypothesis {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    ifClause: row.if_clause,
    thenClause: row.then_clause,
    becauseClause: row.because_clause,
    status: row.status as HypothesisStatus,
    confidence: row.confidence as ConfidenceLevel,
    tags: row.tags ?? [],
    experimentIds: row.experiment_ids ?? [],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listHypotheses(userId: string): Promise<Hypothesis[]> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT h.id, h.user_id, h.title, h.if_clause, h.then_clause, h.because_clause,
            h.status, h.confidence, h.tags, h.created_at, h.updated_at,
            COALESCE(
              (SELECT jsonb_agg(e.id) FROM agos_research_experiments e WHERE e.hypothesis_id = h.id),
              '[]'::jsonb
            ) AS experiment_ids
       FROM agos_research_hypotheses h
      WHERE h.user_id = $1
      ORDER BY h.updated_at DESC`,
    [userId],
  );
  return r.rows.map(rowToHypothesis);
}

export async function getHypothesis(id: string, userId: string): Promise<Hypothesis | null> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT h.id, h.user_id, h.title, h.if_clause, h.then_clause, h.because_clause,
            h.status, h.confidence, h.tags, h.created_at, h.updated_at,
            COALESCE(
              (SELECT jsonb_agg(e.id) FROM agos_research_experiments e WHERE e.hypothesis_id = h.id),
              '[]'::jsonb
            ) AS experiment_ids
       FROM agos_research_hypotheses h
      WHERE h.id = $1 AND h.user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToHypothesis(r.rows[0]);
}

export async function createHypothesis(userId: string, data: HypothesisUpsert): Promise<Hypothesis> {
  const pool = getResearchPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_research_hypotheses
       (id, user_id, title, if_clause, then_clause, because_clause, status, confidence, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
    [
      id, userId, data.title, data.ifClause, data.thenClause, data.becauseClause,
      data.status ?? 'draft', data.confidence ?? 'medium', JSON.stringify(data.tags ?? []),
    ],
  );
  const h = await getHypothesis(id, userId);
  if (!h) throw new Error('Failed to create hypothesis');
  return h;
}

export async function updateHypothesis(
  id: string,
  userId: string,
  patch: Partial<HypothesisUpsert>,
): Promise<Hypothesis | null> {
  const pool = getResearchPool();
  await pool.query(
    `UPDATE agos_research_hypotheses
        SET title         = COALESCE($3, title),
            if_clause     = COALESCE($4, if_clause),
            then_clause   = COALESCE($5, then_clause),
            because_clause= COALESCE($6, because_clause),
            status        = COALESCE($7, status),
            confidence    = COALESCE($8, confidence),
            tags          = COALESCE($9::jsonb, tags),
            updated_at    = now()
      WHERE id = $1 AND user_id = $2`,
    [
      id, userId,
      patch.title ?? null, patch.ifClause ?? null, patch.thenClause ?? null,
      patch.becauseClause ?? null, patch.status ?? null, patch.confidence ?? null,
      patch.tags ? JSON.stringify(patch.tags) : null,
    ],
  );
  return getHypothesis(id, userId);
}

// ─── Experiments — legacy hypothesis-keyed view (kept for back-compat) ────

function rowToExperimentDesign(row: any): ExperimentDesign {
  return {
    id: row.id,
    hypothesisId: row.hypothesis_id,
    userId: row.user_id,
    title: row.title,
    independent: row.independent,
    dependent: row.dependent,
    controls: row.controls ?? '',
    protocol: row.protocol ?? '',
    successCriteria: row.success_criteria ?? '',
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listExperimentsForHypothesis(hypothesisId: string): Promise<ExperimentDesign[]> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT id, hypothesis_id, user_id, title, independent, dependent, controls,
            protocol, success_criteria, status, created_at, updated_at
       FROM agos_research_experiments
      WHERE hypothesis_id = $1
      ORDER BY created_at DESC`,
    [hypothesisId],
  );
  return r.rows.map(rowToExperimentDesign);
}

/**
 * @deprecated Renamed to `listExperimentsForHypothesis` in Phase 1. The
 * Phase 1 hub uses `listExperiments(userId, opts)` (below) which returns
 * the new project-shaped rows. This wrapper exists for one release to keep
 * the legacy hypothesis-ledger API working.
 */
export async function listExperiments(hypothesisId: string): Promise<ExperimentDesign[]> {
  return listExperimentsForHypothesis(hypothesisId);
}

// ─── Experiments — Phase 1 project hub ─────────────────────────────────────

export interface ResearchExperiment {
  id: string;
  userId: string;
  /**
   * Legacy optional pointer from the 0005_research_os hypothesis-as-parent
   * shape. Nullable in Phase 1; Phase 3 starts treating
   * `agos_research_experiment_hypotheses` as authoritative.
   */
  hypothesisId: string | null;
  name: string;
  description: string;
  status: ExperimentStatus;
  tags: string[];
  coverImageUrl: string | null;
  targetCompletionDate: string | null;
  teamSize: number | null;
  phaseProgress: PhaseProgress;
  archivedAt: string | null;
  metadata: Record<string, unknown>;
  /** Bench-side fields preserved from 0005 (read-only on the hub). */
  independent: string;
  dependent: string;
  controls: string;
  protocol: string;
  successCriteria: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateResearchExperimentInput {
  name: string;
  description?: string;
  status?: ExperimentStatus;
  tags?: string[];
  coverImageUrl?: string | null;
  targetCompletionDate?: string | null;
  teamSize?: number | null;
  phaseProgress?: PhaseProgress;
  metadata?: Record<string, unknown>;
  /** Optional legacy pointer; not required. */
  hypothesisId?: string | null;
  /** Bench-side fields (optional on create). */
  independent?: string;
  dependent?: string;
  controls?: string;
  protocol?: string;
  successCriteria?: string;
}

export type UpdateResearchExperimentInput = Partial<CreateResearchExperimentInput>;

export interface ListExperimentsOpts {
  status?: ExperimentStatus;
  tag?: string;
  archived?: boolean;
  limit?: number;
  offset?: number;
}

const EXPERIMENT_COLUMNS = `id, user_id, hypothesis_id, title AS name, description, status, tags,
                            cover_image_url, target_completion_date, team_size,
                            phase_progress, archived_at, metadata,
                            independent, dependent, controls, protocol, success_criteria,
                            created_at, updated_at`;

function rowToExperiment(row: any): ResearchExperiment {
  return {
    id: row.id,
    userId: row.user_id,
    hypothesisId: row.hypothesis_id ?? null,
    name: row.name,
    description: row.description ?? '',
    status: (row.status as ExperimentStatus) ?? 'planning',
    tags: Array.isArray(row.tags) ? row.tags : [],
    coverImageUrl: row.cover_image_url ?? null,
    targetCompletionDate: row.target_completion_date
      ? new Date(row.target_completion_date).toISOString().slice(0, 10)
      : null,
    teamSize: row.team_size == null ? null : Number(row.team_size),
    phaseProgress: coercePhaseProgress(row.phase_progress),
    archivedAt:
      row.archived_at == null
        ? null
        : row.archived_at instanceof Date
          ? row.archived_at.toISOString()
          : String(row.archived_at),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    independent: row.independent ?? '',
    dependent: row.dependent ?? '',
    controls: row.controls ?? '',
    protocol: row.protocol ?? '',
    successCriteria: row.success_criteria ?? '',
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function listExperimentsForUser(
  userId: string,
  opts: ListExperimentsOpts = {},
): Promise<ResearchExperiment[]> {
  const pool = getResearchPool();
  const params: any[] = [userId];
  const where: string[] = ['user_id = $1'];

  if (opts.status) {
    if (!(EXPERIMENT_STATUSES as readonly string[]).includes(opts.status)) {
      throw new Error(`Invalid status: ${opts.status}`);
    }
    params.push(opts.status);
    where.push(`status = $${params.length}`);
  }

  if (opts.tag && opts.tag.trim()) {
    params.push(opts.tag.trim().toLowerCase());
    where.push(`$${params.length} = ANY(tags)`);
  }

  if (opts.archived === true) {
    where.push(`archived_at IS NOT NULL`);
  } else if (opts.archived === false || opts.archived === undefined) {
    where.push(`archived_at IS NULL`);
  }

  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${EXPERIMENT_COLUMNS}
       FROM agos_research_experiments
      WHERE ${where.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToExperiment);
}

export async function getExperiment(
  id: string,
  userId: string,
): Promise<ResearchExperiment | null> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT ${EXPERIMENT_COLUMNS}
       FROM agos_research_experiments
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToExperiment(r.rows[0]);
}

export async function createExperiment(
  userId: string,
  data: CreateResearchExperimentInput,
): Promise<ResearchExperiment> {
  const pool = getResearchPool();
  const id = randomUUID();

  const status: ExperimentStatus = data.status ?? 'planning';
  if (!(EXPERIMENT_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  const phaseProgress = data.phaseProgress ?? phaseProgressDefault();

  await pool.query(
    `INSERT INTO agos_research_experiments
       (id, user_id, hypothesis_id, title, description, status, tags,
        cover_image_url, target_completion_date, team_size,
        phase_progress, metadata,
        independent, dependent, controls, protocol, success_criteria)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17)`,
    [
      id,
      userId,
      data.hypothesisId ?? null,
      data.name,
      data.description ?? '',
      status,
      data.tags ?? [],
      data.coverImageUrl ?? null,
      data.targetCompletionDate ?? null,
      data.teamSize ?? null,
      JSON.stringify(phaseProgress),
      JSON.stringify(data.metadata ?? {}),
      data.independent ?? '',
      data.dependent ?? '',
      data.controls ?? '',
      data.protocol ?? '',
      data.successCriteria ?? '',
    ],
  );

  const experiment = await getExperiment(id, userId);
  if (!experiment) throw new Error('Failed to create research experiment');
  return experiment;
}

export async function updateExperiment(
  id: string,
  userId: string,
  patch: UpdateResearchExperimentInput,
): Promise<ResearchExperiment | null> {
  const pool = getResearchPool();
  if (
    patch.status !== undefined &&
    !(EXPERIMENT_STATUSES as readonly string[]).includes(patch.status)
  ) {
    throw new Error(`Invalid status: ${patch.status}`);
  }
  await pool.query(
    `UPDATE agos_research_experiments
        SET title                  = COALESCE($3,  title),
            description            = COALESCE($4,  description),
            status                 = COALESCE($5,  status),
            tags                   = COALESCE($6::text[], tags),
            cover_image_url        = COALESCE($7,  cover_image_url),
            target_completion_date = COALESCE($8,  target_completion_date),
            team_size              = COALESCE($9,  team_size),
            phase_progress         = COALESCE($10::jsonb, phase_progress),
            metadata               = COALESCE($11::jsonb, metadata),
            hypothesis_id          = COALESCE($12,  hypothesis_id),
            independent            = COALESCE($13,  independent),
            dependent              = COALESCE($14,  dependent),
            controls               = COALESCE($15,  controls),
            protocol               = COALESCE($16,  protocol),
            success_criteria       = COALESCE($17,  success_criteria),
            updated_at             = now()
      WHERE id = $1 AND user_id = $2`,
    [
      id,
      userId,
      patch.name ?? null,
      patch.description ?? null,
      patch.status ?? null,
      patch.tags ?? null,
      patch.coverImageUrl ?? null,
      patch.targetCompletionDate ?? null,
      patch.teamSize ?? null,
      patch.phaseProgress ? JSON.stringify(patch.phaseProgress) : null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
      patch.hypothesisId ?? null,
      patch.independent ?? null,
      patch.dependent ?? null,
      patch.controls ?? null,
      patch.protocol ?? null,
      patch.successCriteria ?? null,
    ],
  );
  return getExperiment(id, userId);
}

/**
 * Soft-archive an experiment. Sets `archived_at = now()` and flips status to
 * `archived` if it isn't already. Returns the updated row, or null if the
 * experiment doesn't exist for this user.
 */
export async function archiveExperiment(
  id: string,
  userId: string,
): Promise<ResearchExperiment | null> {
  const pool = getResearchPool();
  const r = await pool.query(
    `UPDATE agos_research_experiments
        SET archived_at = now(),
            status      = 'archived',
            updated_at  = now()
      WHERE id = $1 AND user_id = $2
        AND archived_at IS NULL
      RETURNING id`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) {
    // Either not found, or already archived. Fall through to a fresh fetch.
    return getExperiment(id, userId);
  }
  return getExperiment(id, userId);
}

/**
 * Restore a soft-archived experiment. Clears `archived_at` and resets status
 * to `planning` if the row was archived; no-op otherwise.
 */
export async function restoreExperiment(
  id: string,
  userId: string,
): Promise<ResearchExperiment | null> {
  const pool = getResearchPool();
  await pool.query(
    `UPDATE agos_research_experiments
        SET archived_at = NULL,
            status      = CASE WHEN status = 'archived' THEN 'planning' ELSE status END,
            updated_at  = now()
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return getExperiment(id, userId);
}

/**
 * Hard-delete an experiment. Reserved for the explicit `?hard=true` path on
 * the DELETE route — the default UI flow soft-archives.
 */
export async function deleteExperiment(id: string, userId: string): Promise<boolean> {
  const pool = getResearchPool();
  const r = await pool.query(
    `DELETE FROM agos_research_experiments WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Audit ─────────────────────────────────────────────────────────────────

export async function recordAudit(args: {
  actorId: string;
  action: string;
  payload?: Record<string, unknown>;
  projectId?: string | null;
}): Promise<void> {
  const pool = getResearchPool();
  await pool.query(
    `INSERT INTO agos_audit (id, project_id, actor_id, os_slug, action, payload)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [
      randomUUID(),
      args.projectId ?? null,
      args.actorId,
      'research',
      args.action,
      JSON.stringify(args.payload ?? {}),
    ],
  );
}

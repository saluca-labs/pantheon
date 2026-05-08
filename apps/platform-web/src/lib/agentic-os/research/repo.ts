/**
 * Research OS — database repository for hypotheses and experiments.
 *
 * All queries target `agos_research_hypotheses` and `agos_research_experiments`
 * introduced in migration 0005_research_os.py.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getResearchPool } from './session';
import type { Hypothesis, HypothesisStatus, ConfidenceLevel, ExperimentDesign } from './hypotheses';

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

// ─── Experiments ───────────────────────────────────────────────────────────

function rowToExperiment(row: any): ExperimentDesign {
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

export async function listExperiments(hypothesisId: string): Promise<ExperimentDesign[]> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT id, hypothesis_id, user_id, title, independent, dependent, controls,
            protocol, success_criteria, status, created_at, updated_at
       FROM agos_research_experiments
      WHERE hypothesis_id = $1
      ORDER BY created_at DESC`,
    [hypothesisId],
  );
  return r.rows.map(rowToExperiment);
}

// ─── Audit ─────────────────────────────────────────────────────────────────

export async function recordAudit(args: {
  actorId: string;
  action: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const pool = getResearchPool();
  await pool.query(
    `INSERT INTO agos_audit (id, actor_id, os_slug, action, payload)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [randomUUID(), args.actorId, 'research', args.action, JSON.stringify(args.payload ?? {})],
  );
}

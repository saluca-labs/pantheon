/**
 * Research OS Phase 3 — experiment ↔ hypothesis join repo.
 *
 * Cross-ownership: the join row's `experiment_id` carries NO FK (per
 * platform v0.1.30); ownership of both sides must be validated by the
 * caller via `isExperimentOwnedByUser` + `isHypothesisOwnedByUser`
 * BEFORE inserting. Every per-row read also re-validates ownership of
 * both sides via EXISTS clauses, so a row pointing at someone else's
 * experiment OR hypothesis is invisible.
 *
 * UNIQUE constraint on (experiment_id, hypothesis_id, role) — the
 * INSERT path catches a duplicate and surfaces a `kind: 'duplicate'`
 * outcome to the route, which translates it to 409.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getResearchPool } from './session';
import {
  LINK_ROLES,
  asLinkRole,
  type LinkRole,
  type ExperimentHypothesisLink,
  type LinkedHypothesis,
  type CreateLinkInput,
  type UpdateLinkInput,
} from './experiment-hypotheses';
import type { Hypothesis } from './hypotheses';

const LINK_COLUMNS = `id, experiment_id, hypothesis_id, role, notes, created_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function rowToLink(row: any): ExperimentHypothesisLink {
  return {
    id: row.id,
    experimentId: row.experiment_id,
    hypothesisId: row.hypothesis_id,
    role: (asLinkRole(row.role) ?? 'tests') as LinkRole,
    notes: row.notes ?? null,
    createdAt: toIso(row.created_at),
  };
}

function rowToHypothesis(row: any): Hypothesis {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    ifClause: row.if_clause,
    thenClause: row.then_clause,
    becauseClause: row.because_clause,
    status: row.status,
    confidence: row.confidence,
    tags: Array.isArray(row.tags) ? row.tags : (row.tags ?? []),
    experimentIds: [],
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── Ownership probes ───────────────────────────────────────────────────────

export async function isExperimentOwnedByUser(
  experimentId: string,
  userId: string,
): Promise<boolean> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_research_experiments
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [experimentId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function isHypothesisOwnedByUser(
  hypothesisId: string,
  userId: string,
): Promise<boolean> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_research_hypotheses
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [hypothesisId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── List linked hypotheses for an experiment ──────────────────────────────

/**
 * Returns the join rows + the hypothesis for each, scoped to one
 * experiment. The caller must validate the experiment is owned by
 * `userId` first; this helper double-checks via the EXISTS guard
 * inside the WHERE clause.
 */
export async function listLinkedHypothesesForExperiment(
  experimentId: string,
  userId: string,
): Promise<LinkedHypothesis[]> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT ${LINK_COLUMNS
      .split(',')
      .map((c) => `lk.${c.trim()}`)
      .join(', ')},
            h.id          AS h_id,
            h.user_id     AS h_user_id,
            h.title       AS h_title,
            h.if_clause   AS h_if_clause,
            h.then_clause AS h_then_clause,
            h.because_clause AS h_because_clause,
            h.status      AS h_status,
            h.confidence  AS h_confidence,
            h.tags        AS h_tags,
            h.created_at  AS h_created_at,
            h.updated_at  AS h_updated_at
       FROM agos_research_experiment_hypotheses lk
       JOIN agos_research_hypotheses h ON h.id = lk.hypothesis_id
      WHERE lk.experiment_id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = lk.experiment_id AND e.user_id = $2
            )
        AND h.user_id = $2
      ORDER BY lk.created_at ASC`,
    [experimentId, userId],
  );
  return r.rows.map((row: any) => ({
    link: rowToLink({
      id: row.id,
      experiment_id: row.experiment_id,
      hypothesis_id: row.hypothesis_id,
      role: row.role,
      notes: row.notes,
      created_at: row.created_at,
    }),
    hypothesis: rowToHypothesis({
      id: row.h_id,
      user_id: row.h_user_id,
      title: row.h_title,
      if_clause: row.h_if_clause,
      then_clause: row.h_then_clause,
      because_clause: row.h_because_clause,
      status: row.h_status,
      confidence: row.h_confidence,
      tags: row.h_tags,
      created_at: row.h_created_at,
      updated_at: row.h_updated_at,
    }),
  }));
}

// ─── Get one link row ───────────────────────────────────────────────────────

/**
 * Fetch a single link row by (experimentId, hypothesisId) — or by
 * `id` via `getLinkById`. Returns null when either side belongs to
 * another user. Used by the per-link PATCH/DELETE route.
 */
export async function getLinkByPair(
  experimentId: string,
  hypothesisId: string,
  userId: string,
): Promise<ExperimentHypothesisLink | null> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT ${LINK_COLUMNS}
       FROM agos_research_experiment_hypotheses lk
      WHERE lk.experiment_id = $1
        AND lk.hypothesis_id = $2
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = lk.experiment_id AND e.user_id = $3
            )
        AND EXISTS (
              SELECT 1 FROM agos_research_hypotheses h
               WHERE h.id = lk.hypothesis_id AND h.user_id = $3
            )
      LIMIT 1`,
    [experimentId, hypothesisId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToLink(r.rows[0]);
}

// ─── Create / link ──────────────────────────────────────────────────────────

export type CreateLinkOutcome =
  | { kind: 'ok'; link: ExperimentHypothesisLink }
  | { kind: 'duplicate' };

/**
 * Insert a join row. Caller MUST have validated both `experimentId`
 * and the hypothesis belong to `userId`. Returns `{kind:'duplicate'}`
 * when the UNIQUE (experiment_id, hypothesis_id, role) constraint
 * fires — the route translates this to 409.
 */
export async function createLink(
  experimentId: string,
  userId: string,
  data: CreateLinkInput,
): Promise<CreateLinkOutcome> {
  const pool = getResearchPool();
  const role: LinkRole = data.role ?? 'tests';
  if (!(LINK_ROLES as readonly string[]).includes(role)) {
    throw new Error(`Invalid role: ${role}`);
  }
  const id = randomUUID();
  try {
    await pool.query(
      `INSERT INTO agos_research_experiment_hypotheses
         (id, experiment_id, hypothesis_id, role, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        id,
        experimentId,
        data.hypothesisId,
        role,
        data.notes ?? null,
      ],
    );
  } catch (err: unknown) {
    if (!(err instanceof Error)) throw err;
    const errErr = err as Error & { code?: string; constraint?: string };
    // Postgres unique-violation SQLSTATE = '23505'
    if (errErr?.code === '23505') {
      return { kind: 'duplicate' };
    }
    throw err;
  }
  const link = await getLinkByPair(experimentId, data.hypothesisId, userId);
  if (!link) {
    // Concurrent delete or cross-ownership oddity. Surface as duplicate
    // so the route returns 409 instead of 500.
    return { kind: 'duplicate' };
  }
  // If the role we wanted is the role we got, return it. Otherwise the
  // existing link is a different role; refetch by id below.
  if (link.role === role) return { kind: 'ok', link };
  // Different role row returned — the just-inserted row exists with `id`.
  const pool2 = getResearchPool();
  const r = await pool2.query(
    `SELECT ${LINK_COLUMNS}
       FROM agos_research_experiment_hypotheses
      WHERE id = $1`,
    [id],
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'duplicate' };
  return { kind: 'ok', link: rowToLink(r.rows[0]) };
}

// ─── Update link (role / notes) ─────────────────────────────────────────────

export async function updateLink(
  experimentId: string,
  hypothesisId: string,
  userId: string,
  patch: UpdateLinkInput,
): Promise<ExperimentHypothesisLink | null> {
  const pool = getResearchPool();
  if (patch.role !== undefined && !(LINK_ROLES as readonly string[]).includes(patch.role)) {
    throw new Error(`Invalid role: ${patch.role}`);
  }
  const r = await pool.query(
    `UPDATE agos_research_experiment_hypotheses lk
        SET role  = COALESCE($4, role),
            notes = COALESCE($5, notes)
      WHERE lk.experiment_id = $1
        AND lk.hypothesis_id = $2
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = lk.experiment_id AND e.user_id = $3
            )
        AND EXISTS (
              SELECT 1 FROM agos_research_hypotheses h
               WHERE h.id = lk.hypothesis_id AND h.user_id = $3
            )
      RETURNING lk.id`,
    [
      experimentId,
      hypothesisId,
      userId,
      patch.role ?? null,
      patch.notes === undefined ? null : patch.notes,
    ],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getLinkByPair(experimentId, hypothesisId, userId);
}

// ─── Delete / unlink ────────────────────────────────────────────────────────

export async function deleteLink(
  experimentId: string,
  hypothesisId: string,
  userId: string,
): Promise<boolean> {
  const pool = getResearchPool();
  const r = await pool.query(
    `DELETE FROM agos_research_experiment_hypotheses lk
      WHERE lk.experiment_id = $1
        AND lk.hypothesis_id = $2
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = lk.experiment_id AND e.user_id = $3
            )
        AND EXISTS (
              SELECT 1 FROM agos_research_hypotheses h
               WHERE h.id = lk.hypothesis_id AND h.user_id = $3
            )`,
    [experimentId, hypothesisId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

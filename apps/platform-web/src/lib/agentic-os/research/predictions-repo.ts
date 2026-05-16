/**
 * Research OS Phase 3 — predictions DB repository.
 *
 * Cross-ownership contract
 * ------------------------
 * `agos_research_hypothesis_predictions.hypothesis_id` IS a FK CASCADE
 * to `agos_research_hypotheses`. Ownership is enforced by JOIN-ing
 * every per-prediction lookup back to the hypothesis row filtered by
 * `user_id`. A prediction under another user's hypothesis returns
 * `null` on get / update / delete.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getResearchPool } from './session';
import {
  PREDICTION_KINDS,
  asPredictionKind,
  type Prediction,
  type CreatePredictionInput,
  type UpdatePredictionInput,
} from './predictions';
import type { ConfidenceLevel } from './hypotheses';

const PREDICTION_COLUMNS = `id, hypothesis_id, user_id, text, kind, confidence,
                            metadata, created_at, updated_at`;

const CONFIDENCE_VALUES: readonly ConfidenceLevel[] = ['low', 'medium', 'high'];

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

interface RawPredictionRow {
  id: string;
  hypothesis_id: string;
  user_id: string;
  text: string;
  kind: string;
  confidence: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function rowToPrediction(row: RawPredictionRow): Prediction {
  return {
    id: row.id,
    hypothesisId: row.hypothesis_id,
    userId: row.user_id,
    text: row.text,
    kind: (asPredictionKind(row.kind) ?? 'positive') as Prediction['kind'],
    confidence: (row.confidence as ConfidenceLevel) ?? 'medium',
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── Ownership probe ────────────────────────────────────────────────────────

/**
 * Returns true when `hypothesisId` belongs to `userId`, false otherwise.
 * Used as a pre-flight probe by the hypothesis-scoped list + create
 * routes so a cross-tenant hypothesis_id returns 404 BEFORE any
 * SELECT/INSERT against the predictions table.
 */
export async function isHypothesisOwnedByUser(
  hypothesisId: string,
  userId: string,
): Promise<boolean> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT 1
       FROM agos_research_hypotheses
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [hypothesisId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── List ───────────────────────────────────────────────────────────────────

export async function listPredictionsForHypothesis(
  hypothesisId: string,
  userId: string,
): Promise<Prediction[]> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT ${PREDICTION_COLUMNS}
       FROM agos_research_hypothesis_predictions p
      WHERE p.hypothesis_id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_hypotheses h
               WHERE h.id = p.hypothesis_id AND h.user_id = $2
            )
      ORDER BY p.created_at ASC`,
    [hypothesisId, userId],
  );
  return r.rows.map(rowToPrediction);
}

// ─── Get one ────────────────────────────────────────────────────────────────

export async function getPrediction(
  id: string,
  userId: string,
): Promise<Prediction | null> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT ${PREDICTION_COLUMNS}
       FROM agos_research_hypothesis_predictions p
      WHERE p.id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_hypotheses h
               WHERE h.id = p.hypothesis_id AND h.user_id = $2
            )
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToPrediction(r.rows[0]);
}

// ─── Create ─────────────────────────────────────────────────────────────────

export async function createPrediction(
  hypothesisId: string,
  userId: string,
  data: CreatePredictionInput,
): Promise<Prediction> {
  const pool = getResearchPool();
  const id = randomUUID();
  const kind = data.kind ?? 'positive';
  const confidence = data.confidence ?? 'medium';
  if (!(PREDICTION_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`Invalid prediction kind: ${kind}`);
  }
  if (!CONFIDENCE_VALUES.includes(confidence)) {
    throw new Error(`Invalid prediction confidence: ${confidence}`);
  }

  await pool.query(
    `INSERT INTO agos_research_hypothesis_predictions
       (id, hypothesis_id, user_id, text, kind, confidence, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      id,
      hypothesisId,
      userId,
      data.text,
      kind,
      confidence,
      JSON.stringify(data.metadata ?? {}),
    ],
  );

  const created = await getPrediction(id, userId);
  if (!created) throw new Error('Failed to create prediction');
  return created;
}

// ─── Update ─────────────────────────────────────────────────────────────────

export async function updatePrediction(
  id: string,
  userId: string,
  patch: UpdatePredictionInput,
): Promise<Prediction | null> {
  const pool = getResearchPool();
  if (
    patch.kind !== undefined &&
    !(PREDICTION_KINDS as readonly string[]).includes(patch.kind)
  ) {
    throw new Error(`Invalid prediction kind: ${patch.kind}`);
  }
  if (
    patch.confidence !== undefined &&
    !CONFIDENCE_VALUES.includes(patch.confidence)
  ) {
    throw new Error(`Invalid prediction confidence: ${patch.confidence}`);
  }
  const r = await pool.query(
    `UPDATE agos_research_hypothesis_predictions p
        SET text       = COALESCE($3, text),
            kind       = COALESCE($4, kind),
            confidence = COALESCE($5, confidence),
            metadata   = COALESCE($6::jsonb, metadata),
            updated_at = now()
      WHERE p.id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_hypotheses h
               WHERE h.id = p.hypothesis_id AND h.user_id = $2
            )
      RETURNING p.id`,
    [
      id,
      userId,
      patch.text ?? null,
      patch.kind ?? null,
      patch.confidence ?? null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getPrediction(id, userId);
}

// ─── Delete ─────────────────────────────────────────────────────────────────

export async function deletePrediction(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getResearchPool();
  const r = await pool.query(
    `DELETE FROM agos_research_hypothesis_predictions p
      WHERE p.id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_hypotheses h
               WHERE h.id = p.hypothesis_id AND h.user_id = $2
            )`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

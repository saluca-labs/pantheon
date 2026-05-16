/**
 * Research OS Phase 3 — falsifiers DB repository.
 *
 * Cross-ownership: identical pattern to predictions — falsifier rows
 * cascade off the hypothesis (FK on `hypothesis_id`), and every
 * per-row lookup re-JOINs against `agos_research_hypotheses` filtered
 * by `user_id`. Returns null on cross-tenant access.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getResearchPool } from './session';
import type {
  Falsifier,
  CreateFalsifierInput,
  UpdateFalsifierInput,
} from './falsifiers';

const FALSIFIER_COLUMNS = `id, hypothesis_id, user_id, text, criterion_md,
                           metadata, created_at, updated_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

interface RawFalsifierRow {
  id: string;
  hypothesis_id: string;
  user_id: string;
  text: string;
  criterion_md: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function rowToFalsifier(row: RawFalsifierRow): Falsifier {
  return {
    id: row.id,
    hypothesisId: row.hypothesis_id,
    userId: row.user_id,
    text: row.text,
    criterionMd: row.criterion_md ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── List ───────────────────────────────────────────────────────────────────

export async function listFalsifiersForHypothesis(
  hypothesisId: string,
  userId: string,
): Promise<Falsifier[]> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT ${FALSIFIER_COLUMNS}
       FROM agos_research_hypothesis_falsifiers f
      WHERE f.hypothesis_id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_hypotheses h
               WHERE h.id = f.hypothesis_id AND h.user_id = $2
            )
      ORDER BY f.created_at ASC`,
    [hypothesisId, userId],
  );
  return r.rows.map(rowToFalsifier);
}

// ─── Get one ────────────────────────────────────────────────────────────────

export async function getFalsifier(
  id: string,
  userId: string,
): Promise<Falsifier | null> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT ${FALSIFIER_COLUMNS}
       FROM agos_research_hypothesis_falsifiers f
      WHERE f.id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_hypotheses h
               WHERE h.id = f.hypothesis_id AND h.user_id = $2
            )
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToFalsifier(r.rows[0]);
}

// ─── Create ─────────────────────────────────────────────────────────────────

export async function createFalsifier(
  hypothesisId: string,
  userId: string,
  data: CreateFalsifierInput,
): Promise<Falsifier> {
  const pool = getResearchPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_research_hypothesis_falsifiers
       (id, hypothesis_id, user_id, text, criterion_md, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      id,
      hypothesisId,
      userId,
      data.text,
      data.criterionMd ?? null,
      JSON.stringify(data.metadata ?? {}),
    ],
  );

  const created = await getFalsifier(id, userId);
  if (!created) throw new Error('Failed to create falsifier');
  return created;
}

// ─── Update ─────────────────────────────────────────────────────────────────

export async function updateFalsifier(
  id: string,
  userId: string,
  patch: UpdateFalsifierInput,
): Promise<Falsifier | null> {
  const pool = getResearchPool();
  const r = await pool.query(
    `UPDATE agos_research_hypothesis_falsifiers f
        SET text         = COALESCE($3, text),
            criterion_md = COALESCE($4, criterion_md),
            metadata     = COALESCE($5::jsonb, metadata),
            updated_at   = now()
      WHERE f.id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_hypotheses h
               WHERE h.id = f.hypothesis_id AND h.user_id = $2
            )
      RETURNING f.id`,
    [
      id,
      userId,
      patch.text ?? null,
      patch.criterionMd === undefined ? null : patch.criterionMd,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getFalsifier(id, userId);
}

// ─── Delete ─────────────────────────────────────────────────────────────────

export async function deleteFalsifier(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getResearchPool();
  const r = await pool.query(
    `DELETE FROM agos_research_hypothesis_falsifiers f
      WHERE f.id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_hypotheses h
               WHERE h.id = f.hypothesis_id AND h.user_id = $2
            )`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

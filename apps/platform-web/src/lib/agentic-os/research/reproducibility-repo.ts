/**
 * Research OS Phase 6 — Reproducibility checks DB repository.
 *
 * Cross-ownership contract
 * ------------------------
 * `agos_research_reproducibility_checks.experiment_id` is NOT a FK — per the
 * v0.1.30 platform contract. Ownership is enforced at the SQL layer by
 * JOIN-ing every check-level lookup to `agos_research_experiments` filtered
 * by `user_id`. A check under another user's experiment is invisible.
 *
 * Lazy seeding
 * ------------
 * `seedCanonicalReproItems` inserts the 7 canonical item_keys for an
 * experiment with `ON CONFLICT (experiment_id, item_key) DO NOTHING` so
 * repeated calls are idempotent. Existing experiments backfill cleanly on
 * first GET to `/reproducibility`.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getResearchPool } from './session';
import {
  REPRO_STATE_VALUES,
  CANONICAL_REPRO_ITEM_KEYS,
  type ReproCheck,
  type ReproState,
  type CreateReproCheckInput,
  type UpdateReproCheckInput,
} from './reproducibility';

const REPRO_COLUMNS = `id, experiment_id, user_id, item_key, state,
                       evidence_url, notes, completed_at, metadata,
                       created_at, updated_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function toIsoOrNull(v: unknown): string | null {
  if (v == null) return null;
  return toIso(v);
}

function rowToReproCheck(row: any): ReproCheck {
  return {
    id: row.id,
    experimentId: row.experiment_id,
    userId: row.user_id,
    itemKey: row.item_key,
    state: row.state as ReproState,
    evidenceUrl: row.evidence_url ?? null,
    notes: row.notes ?? null,
    completedAt: toIsoOrNull(row.completed_at),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── Ownership probe ───────────────────────────────────────────────────────

export async function isExperimentOwnedByUser(
  experimentId: string,
  userId: string,
): Promise<boolean> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT 1
       FROM agos_research_experiments
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [experimentId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Lazy seeding ──────────────────────────────────────────────────────────

/**
 * Insert the 7 canonical item_keys for an experiment, with
 * `ON CONFLICT (experiment_id, item_key) DO NOTHING` so the operation is
 * idempotent on repeated calls. Caller must have validated experiment
 * ownership first.
 */
export async function seedCanonicalReproItems(
  experimentId: string,
  userId: string,
): Promise<void> {
  const pool = getResearchPool();
  const ids = CANONICAL_REPRO_ITEM_KEYS.map(() => randomUUID());
  // Build VALUES list with positional parameters for each canonical key.
  const valuesSql: string[] = [];
  const params: any[] = [];
  let p = 1;
  CANONICAL_REPRO_ITEM_KEYS.forEach((key, i) => {
    valuesSql.push(
      `($${p++}, $${p++}, $${p++}, $${p++}, 'pending')`,
    );
    params.push(ids[i], experimentId, userId, key);
  });
  await pool.query(
    `INSERT INTO agos_research_reproducibility_checks
       (id, experiment_id, user_id, item_key, state)
     VALUES ${valuesSql.join(', ')}
     ON CONFLICT (experiment_id, item_key) DO NOTHING`,
    params,
  );
}

// ─── List ──────────────────────────────────────────────────────────────────

export async function listReproChecksForExperiment(
  experimentId: string,
  userId: string,
): Promise<ReproCheck[]> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT ${REPRO_COLUMNS}
       FROM agos_research_reproducibility_checks c
      WHERE c.experiment_id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = c.experiment_id AND e.user_id = $2
            )
      ORDER BY c.item_key ASC`,
    [experimentId, userId],
  );
  return r.rows.map(rowToReproCheck);
}

// ─── Get one (by id) ───────────────────────────────────────────────────────

export async function getReproCheck(
  id: string,
  userId: string,
): Promise<ReproCheck | null> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT ${REPRO_COLUMNS}
       FROM agos_research_reproducibility_checks c
      WHERE c.id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = c.experiment_id AND e.user_id = $2
            )
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToReproCheck(r.rows[0]);
}

// ─── Get one (by experiment + item_key) ───────────────────────────────────

export async function getReproCheckByItemKey(
  experimentId: string,
  itemKey: string,
  userId: string,
): Promise<ReproCheck | null> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT ${REPRO_COLUMNS}
       FROM agos_research_reproducibility_checks c
      WHERE c.experiment_id = $1
        AND c.item_key = $2
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = c.experiment_id AND e.user_id = $3
            )
      LIMIT 1`,
    [experimentId, itemKey, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToReproCheck(r.rows[0]);
}

// ─── Create ────────────────────────────────────────────────────────────────

export class ReproDuplicateError extends Error {
  constructor() {
    super('Reproducibility item already exists.');
    this.name = 'ReproDuplicateError';
  }
}

export async function createReproCheck(
  experimentId: string,
  userId: string,
  data: CreateReproCheckInput,
): Promise<ReproCheck> {
  if (
    data.state !== undefined &&
    !(REPRO_STATE_VALUES as readonly string[]).includes(data.state)
  ) {
    throw new Error(`Invalid state: ${data.state}`);
  }
  const state: ReproState = data.state ?? 'pending';
  const completedAtClause = state === 'done' ? `now()` : `NULL`;

  const pool = getResearchPool();
  const id = randomUUID();
  try {
    await pool.query(
      `INSERT INTO agos_research_reproducibility_checks
         (id, experiment_id, user_id, item_key, state,
          evidence_url, notes, metadata, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, ${completedAtClause})`,
      [
        id,
        experimentId,
        userId,
        data.itemKey,
        state,
        data.evidenceUrl ?? null,
        data.notes ?? null,
        JSON.stringify(data.metadata ?? {}),
      ],
    );
  } catch (err: unknown) {
    if (!(err instanceof Error)) throw err;
    const errErr = err as Error & { code?: string; constraint?: string };
    if (err && errErr.code === '23505') {
      throw new ReproDuplicateError();
    }
    throw err;
  }
  const created = await getReproCheck(id, userId);
  if (!created) throw new Error('Failed to create reproducibility item');
  return created;
}

// ─── Update (by experiment + item_key) ─────────────────────────────────────

/**
 * PATCH by `(experimentId, itemKey)`. Setting state='done' auto-stamps
 * completed_at to now() if null; setting state to any non-done value
 * (pending / in_progress / not_applicable / waived) clears completed_at
 * back to null.
 */
export async function updateReproCheckByItemKey(
  experimentId: string,
  itemKey: string,
  userId: string,
  patch: UpdateReproCheckInput,
): Promise<ReproCheck | null> {
  if (
    patch.state !== undefined &&
    !(REPRO_STATE_VALUES as readonly string[]).includes(patch.state)
  ) {
    throw new Error(`Invalid state: ${patch.state}`);
  }

  const pool = getResearchPool();
  const r = await pool.query(
    `UPDATE agos_research_reproducibility_checks c
        SET state         = COALESCE($4, state),
            evidence_url  = CASE WHEN $5::boolean THEN $6 ELSE evidence_url END,
            notes         = CASE WHEN $7::boolean THEN $8 ELSE notes END,
            metadata      = COALESCE($9::jsonb, metadata),
            completed_at  = CASE
                              WHEN $4 = 'done' AND completed_at IS NULL THEN now()
                              WHEN $4 IS NOT NULL AND $4 <> 'done' THEN NULL
                              ELSE completed_at
                            END,
            updated_at    = now()
      WHERE c.experiment_id = $1
        AND c.item_key = $2
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = c.experiment_id AND e.user_id = $3
            )
      RETURNING c.id`,
    [
      experimentId,
      itemKey,
      userId,
      patch.state ?? null,
      patch.evidenceUrl !== undefined,
      patch.evidenceUrl ?? null,
      patch.notes !== undefined,
      patch.notes ?? null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getReproCheckByItemKey(experimentId, itemKey, userId);
}

// ─── Delete (by experiment + item_key) ─────────────────────────────────────

export async function deleteReproCheckByItemKey(
  experimentId: string,
  itemKey: string,
  userId: string,
): Promise<boolean> {
  const pool = getResearchPool();
  const r = await pool.query(
    `DELETE FROM agos_research_reproducibility_checks c
      WHERE c.experiment_id = $1
        AND c.item_key = $2
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = c.experiment_id AND e.user_id = $3
            )`,
    [experimentId, itemKey, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Research OS Phase 6 — Cross-experiment dependency repository.
 *
 * Cross-ownership contract
 * ------------------------
 * Both endpoints of every edge (`from_experiment_id`, `to_experiment_id`)
 * carry NO FK to `agos_research_experiments` per the v0.1.30 platform
 * contract. Ownership is enforced at the SQL layer by JOIN-ing each side
 * to `agos_research_experiments` filtered by `user_id`. An edge created
 * by another user (or whose peer is owned by another user) is invisible.
 *
 * On create:
 *   1. Validate self-loop (from != to) before SQL.
 *   2. Probe `from_experiment_id` is owned by user.
 *   3. Probe `to_experiment_id` is owned by user — 404 if not.
 *   4. INSERT; UNIQUE constraint may throw → route maps to 409.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getResearchPool } from './session';
import {
  DEPENDENCY_KIND_VALUES,
  DEPENDENCY_STATUS_VALUES,
  type ExperimentDependency,
  type ExperimentDependenciesView,
  type ExperimentDependencyHydrated,
  type DependencyKind,
  type DependencyStatus,
  type CreateDependencyInput,
  type UpdateDependencyInput,
} from './dependencies';

const DEPENDENCY_COLUMNS = `id, user_id, from_experiment_id, to_experiment_id,
                            kind, status, notes, metadata,
                            created_at, updated_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function rowToDependency(row: any): ExperimentDependency {
  return {
    id: row.id,
    userId: row.user_id,
    fromExperimentId: row.from_experiment_id,
    toExperimentId: row.to_experiment_id,
    kind: row.kind as DependencyKind,
    status: row.status as DependencyStatus,
    notes: row.notes ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── Ownership probes ──────────────────────────────────────────────────────

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

// ─── List (both directions, hydrated with peer) ────────────────────────────

/**
 * List dependencies in BOTH directions for an experiment. Each edge is
 * hydrated with the peer experiment's `{ id, name, status }`. Edges whose
 * peer is owned by another user are dropped (cross-ownership), not leaked.
 */
export async function listDependenciesForExperiment(
  experimentId: string,
  userId: string,
): Promise<ExperimentDependenciesView> {
  const pool = getResearchPool();

  const upstream = await pool.query(
    `SELECT d.id, d.user_id, d.from_experiment_id, d.to_experiment_id,
            d.kind, d.status, d.notes, d.metadata,
            d.created_at, d.updated_at,
            peer.id     AS peer_id,
            peer.title  AS peer_name,
            peer.status AS peer_status
       FROM agos_research_experiment_dependencies d
       JOIN agos_research_experiments peer
         ON peer.id = d.to_experiment_id
        AND peer.user_id = $2
      WHERE d.from_experiment_id = $1
        AND d.user_id = $2
      ORDER BY d.created_at DESC`,
    [experimentId, userId],
  );

  const downstream = await pool.query(
    `SELECT d.id, d.user_id, d.from_experiment_id, d.to_experiment_id,
            d.kind, d.status, d.notes, d.metadata,
            d.created_at, d.updated_at,
            peer.id     AS peer_id,
            peer.title  AS peer_name,
            peer.status AS peer_status
       FROM agos_research_experiment_dependencies d
       JOIN agos_research_experiments peer
         ON peer.id = d.from_experiment_id
        AND peer.user_id = $2
      WHERE d.to_experiment_id = $1
        AND d.user_id = $2
      ORDER BY d.created_at DESC`,
    [experimentId, userId],
  );

  function hydrate(row: any): ExperimentDependencyHydrated {
    return {
      ...rowToDependency(row),
      peer: {
        id: row.peer_id,
        name: row.peer_name ?? 'Untitled experiment',
        status: row.peer_status ?? 'planning',
      },
    };
  }

  return {
    upstream: upstream.rows.map(hydrate),
    downstream: downstream.rows.map(hydrate),
  };
}

// ─── Get one ───────────────────────────────────────────────────────────────

export async function getDependency(
  id: string,
  userId: string,
): Promise<ExperimentDependency | null> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT ${DEPENDENCY_COLUMNS}
       FROM agos_research_experiment_dependencies
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToDependency(r.rows[0]);
}

// ─── Create ────────────────────────────────────────────────────────────────

export class DependencyDuplicateError extends Error {
  constructor() {
    super('Dependency already exists.');
    this.name = 'DependencyDuplicateError';
  }
}

export class DependencyCrossOwnershipError extends Error {
  constructor(side: 'from' | 'to') {
    super(`${side === 'from' ? 'From' : 'To'} experiment not found or not owned by user.`);
    this.name = 'DependencyCrossOwnershipError';
  }
}

export class DependencySelfLoopError extends Error {
  constructor() {
    super('An experiment cannot depend on itself.');
    this.name = 'DependencySelfLoopError';
  }
}

export async function createDependency(
  fromExperimentId: string,
  userId: string,
  data: CreateDependencyInput,
): Promise<ExperimentDependency> {
  if (fromExperimentId === data.toExperimentId) {
    throw new DependencySelfLoopError();
  }

  // Cross-ownership gates BEFORE any INSERT.
  const fromOwned = await isExperimentOwnedByUser(fromExperimentId, userId);
  if (!fromOwned) throw new DependencyCrossOwnershipError('from');
  const toOwned = await isExperimentOwnedByUser(data.toExperimentId, userId);
  if (!toOwned) throw new DependencyCrossOwnershipError('to');

  if (
    data.kind !== undefined &&
    !(DEPENDENCY_KIND_VALUES as readonly string[]).includes(data.kind)
  ) {
    throw new Error(`Invalid kind: ${data.kind}`);
  }

  const pool = getResearchPool();
  const id = randomUUID();
  try {
    await pool.query(
      `INSERT INTO agos_research_experiment_dependencies
         (id, user_id, from_experiment_id, to_experiment_id,
          kind, status, notes, metadata)
       VALUES ($1, $2, $3, $4, $5, 'open', $6, $7::jsonb)`,
      [
        id,
        userId,
        fromExperimentId,
        data.toExperimentId,
        data.kind ?? 'feeds',
        data.notes ?? null,
        JSON.stringify(data.metadata ?? {}),
      ],
    );
  } catch (err: unknown) {
    if (!(err instanceof Error)) throw err;
    const errErr = err as Error & { code?: string; constraint?: string };
    // 23505 = unique_violation in Postgres.
    if (err && errErr.code === '23505') {
      throw new DependencyDuplicateError();
    }
    throw err;
  }
  const created = await getDependency(id, userId);
  if (!created) throw new Error('Failed to create dependency');
  return created;
}

// ─── Update ────────────────────────────────────────────────────────────────

export async function updateDependency(
  id: string,
  userId: string,
  patch: UpdateDependencyInput,
): Promise<ExperimentDependency | null> {
  if (
    patch.kind !== undefined &&
    !(DEPENDENCY_KIND_VALUES as readonly string[]).includes(patch.kind)
  ) {
    throw new Error(`Invalid kind: ${patch.kind}`);
  }
  if (
    patch.status !== undefined &&
    !(DEPENDENCY_STATUS_VALUES as readonly string[]).includes(patch.status)
  ) {
    throw new Error(`Invalid status: ${patch.status}`);
  }

  const pool = getResearchPool();
  const r = await pool.query(
    `UPDATE agos_research_experiment_dependencies
        SET kind       = COALESCE($3, kind),
            status     = COALESCE($4, status),
            notes      = CASE WHEN $5::boolean THEN $6 ELSE notes END,
            metadata   = COALESCE($7::jsonb, metadata),
            updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [
      id,
      userId,
      patch.kind ?? null,
      patch.status ?? null,
      patch.notes !== undefined,
      patch.notes ?? null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getDependency(id, userId);
}

// ─── Delete ────────────────────────────────────────────────────────────────

export async function deleteDependency(id: string, userId: string): Promise<boolean> {
  const pool = getResearchPool();
  const r = await pool.query(
    `DELETE FROM agos_research_experiment_dependencies
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Shared SavedViews — DB repository.
 *
 * Server-side persistence for the cross-OS `SavedViews` UI primitive
 * (`components/agentic-os/_shared/views/saved-views.tsx`). Backs the
 * `agos_shared_saved_views` table created in migration
 * `0070_shared_saved_views`.
 *
 * Cross-ownership contract: every read / write filters by `user_id`
 * directly, and list / scoped operations also filter by `entity_kind`
 * (the opaque per-surface scope key the list page picks). A view id
 * belonging to another user — or queried under the wrong surface — is
 * invisible: `deleteSavedView` returns false, `listSavedViews` omits it.
 *
 * The `query` column is opaque serialized view state; this module never
 * inspects it, only round-trips it through JSONB.
 *
 * @license MIT — Tiresias platform / Wave E shared primitives (internal).
 */

import 'server-only';
import { getOsPool } from './session';

/** A persisted, named filter/sort preset row. */
export interface SavedViewRow {
  id: string;
  userId: string;
  entityKind: string;
  name: string;
  /** Opaque serialized view state — the UI owns this shape. */
  query: unknown;
  createdAt: string;
  updatedAt: string;
}

const SAVED_VIEW_COLUMNS = `id, user_id, entity_kind, name, query,
                            created_at, updated_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function rowToSavedView(row: any): SavedViewRow {
  return {
    id: row.id,
    userId: row.user_id,
    entityKind: row.entity_kind,
    name: row.name,
    query: row.query ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── List ──────────────────────────────────────────────────────────────────

/**
 * List the caller's saved views for one surface, oldest-first (stable
 * pill order — matches the localStorage mock's append semantics).
 */
export async function listSavedViews(
  userId: string,
  entityKind: string,
): Promise<SavedViewRow[]> {
  const pool = getOsPool();
  const r = await pool.query(
    `SELECT ${SAVED_VIEW_COLUMNS}
       FROM agos_shared_saved_views
      WHERE user_id = $1 AND entity_kind = $2
      ORDER BY created_at ASC`,
    [userId, entityKind],
  );
  return r.rows.map(rowToSavedView);
}

// ─── Get one ───────────────────────────────────────────────────────────────

export async function getSavedView(
  id: string,
  userId: string,
): Promise<SavedViewRow | null> {
  const pool = getOsPool();
  const r = await pool.query(
    `SELECT ${SAVED_VIEW_COLUMNS}
       FROM agos_shared_saved_views
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToSavedView(r.rows[0]);
}

// ─── Create ────────────────────────────────────────────────────────────────

export interface CreateSavedViewInput {
  /** Opaque per-surface scope key (e.g. `research:hypotheses`). */
  entityKind: string;
  /** Human label rendered in the pill. */
  name: string;
  /** Opaque serialized view state. */
  query: unknown;
  /**
   * Optional caller-supplied id. The hook generates the id client-side
   * so its `saveView` can stay synchronous (callers read `.id`
   * immediately); the route passes it through. Omitted → DB-side UUID.
   */
  id?: string;
}

export async function createSavedView(
  userId: string,
  data: CreateSavedViewInput,
): Promise<SavedViewRow> {
  const pool = getOsPool();
  // `gen_random_uuid()` is available on every PG the platform targets
  // (pgcrypto / PG13+ core). The client normally supplies the id.
  const r = await pool.query(
    `INSERT INTO agos_shared_saved_views
       (id, user_id, entity_kind, name, query)
     VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5::jsonb)
     RETURNING ${SAVED_VIEW_COLUMNS}`,
    [
      data.id ?? null,
      userId,
      data.entityKind,
      data.name,
      JSON.stringify(data.query ?? {}),
    ],
  );
  return rowToSavedView(r.rows[0]);
}

// ─── Delete ────────────────────────────────────────────────────────────────

/**
 * Hard-delete a saved view. Returns true when a row was removed, false
 * when the id does not belong to this user (cross-ownership guard).
 * Saved views are a convenience layer, not a system of record — no soft
 * delete.
 */
export async function deleteSavedView(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getOsPool();
  const r = await pool.query(
    `DELETE FROM agos_shared_saved_views
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

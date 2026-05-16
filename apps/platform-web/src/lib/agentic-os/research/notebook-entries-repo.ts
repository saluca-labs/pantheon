/**
 * Research OS Phase 2 — Notebook entries DB repository.
 *
 * Cross-ownership contract
 * ------------------------
 * `agos_research_notebook_entries.experiment_id` is NOT a FK — per the
 * v0.1.30 platform contract. This repo's read/write paths therefore
 * enforce ownership at the SQL layer by JOIN-ing every entry-level
 * lookup to `agos_research_experiments` filtered by `user_id`. A
 * notebook entry under another user's experiment is invisible to this
 * user (returns null on get/update/archive/restore).
 *
 * The repo enforces ownership in TWO places:
 *   1. `assertExperimentOwned(experimentId, userId)` — explicit probe
 *      called by the list / create routes BEFORE any insert.
 *   2. Every per-entry SQL statement JOINs notebook_entries to
 *      experiments via `experiment_id` + `user_id`, so even a
 *      handcrafted UUID can't read or mutate someone else's entry.
 *
 * @license MIT — Tiresias Research OS Phase 2 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getResearchPool } from './session';
import {
  ENTRY_KINDS,
  asEntryKind,
  type EntryKind,
} from './entry-kinds';
import type {
  NotebookEntry,
  CreateNotebookEntryInput,
  UpdateNotebookEntryInput,
  NotebookListOpts,
} from './notebook-entries';

// ─── Row hydration ──────────────────────────────────────────────────────────

const ENTRY_COLUMNS = `id, user_id, experiment_id, entry_kind, title, body_md,
                       attached_urls, tags, entry_at, archived_at, metadata,
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

interface RawNotebookEntryRow {
  id: string;
  user_id: string;
  experiment_id: string;
  entry_kind: string;
  title: string;
  body_md: string | null;
  attached_urls: string[] | null;
  tags: string[] | null;
  entry_at: Date | string;
  archived_at: Date | string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function rowToEntry(row: RawNotebookEntryRow): NotebookEntry {
  const kind = asEntryKind(row.entry_kind);
  if (!kind) {
    // Defensive: the CHECK should make this unreachable, but a corrupt
    // row shouldn't crash the timeline. Fall through to 'note'.
    return {
      id: row.id,
      userId: row.user_id,
      experimentId: row.experiment_id,
      entryKind: 'note',
      title: row.title,
      bodyMd: row.body_md ?? '',
      attachedUrls: Array.isArray(row.attached_urls) ? row.attached_urls : [],
      tags: Array.isArray(row.tags) ? row.tags : [],
      entryAt: toIso(row.entry_at),
      archivedAt: toIsoOrNull(row.archived_at),
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    };
  }
  return {
    id: row.id,
    userId: row.user_id,
    experimentId: row.experiment_id,
    entryKind: kind,
    title: row.title,
    bodyMd: row.body_md ?? '',
    attachedUrls: Array.isArray(row.attached_urls) ? row.attached_urls : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    entryAt: toIso(row.entry_at),
    archivedAt: toIsoOrNull(row.archived_at),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── Ownership probe ────────────────────────────────────────────────────────

/**
 * Returns true when the supplied `experimentId` belongs to `userId`,
 * false otherwise. Used as a pre-flight probe by the experiment-scoped
 * list + create routes so a cross-tenant experiment_id returns a 404
 * BEFORE any SELECT/INSERT against the notebook table.
 */
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

// ─── List ───────────────────────────────────────────────────────────────────

/**
 * List entries for a single experiment, ordered by entry_at DESC.
 * Caller must have already validated `experimentId` is owned by
 * `userId` — this method assumes the probe ran. (The cross-ownership
 * JOIN to experiments is still applied as a belt-and-suspenders gate.)
 */
export async function listNotebookEntriesForExperiment(
  experimentId: string,
  userId: string,
  opts: NotebookListOpts = {},
): Promise<NotebookEntry[]> {
  const pool = getResearchPool();
  const params: unknown[] = [experimentId, userId];
  const where: string[] = [
    `n.experiment_id = $1`,
    `EXISTS (
       SELECT 1 FROM agos_research_experiments e
        WHERE e.id = n.experiment_id AND e.user_id = $2
     )`,
  ];

  if (opts.archived === true) {
    where.push(`n.archived_at IS NOT NULL`);
  } else if (opts.archived === false || opts.archived === undefined) {
    where.push(`n.archived_at IS NULL`);
  }

  if (opts.entryKind) {
    if (!(ENTRY_KINDS as readonly string[]).includes(opts.entryKind)) {
      throw new Error(`Invalid entry_kind filter: ${opts.entryKind}`);
    }
    params.push(opts.entryKind);
    where.push(`n.entry_kind = $${params.length}`);
  }

  if (opts.tag && opts.tag.trim()) {
    params.push(opts.tag.trim().toLowerCase());
    where.push(`$${params.length} = ANY(n.tags)`);
  }

  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${ENTRY_COLUMNS}
       FROM agos_research_notebook_entries n
      WHERE ${where.join(' AND ')}
      ORDER BY n.entry_at DESC, n.created_at DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToEntry);
}

// ─── Get one ───────────────────────────────────────────────────────────────

/**
 * Fetch a single entry by id, gated by cross-ownership JOIN. Returns
 * null when the entry does not exist OR when it belongs to an
 * experiment owned by another user.
 */
export async function getNotebookEntry(
  id: string,
  userId: string,
): Promise<NotebookEntry | null> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT ${ENTRY_COLUMNS}
       FROM agos_research_notebook_entries n
      WHERE n.id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = n.experiment_id AND e.user_id = $2
            )
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToEntry(r.rows[0]);
}

// ─── Create ────────────────────────────────────────────────────────────────

/**
 * Insert a new notebook entry. Caller MUST have validated that
 * `experimentId` belongs to `userId` via `isExperimentOwnedByUser`
 * first — this helper inserts unconditionally on the assumption that
 * the route enforced the gate.
 */
export async function createNotebookEntry(
  experimentId: string,
  userId: string,
  data: CreateNotebookEntryInput,
): Promise<NotebookEntry> {
  const pool = getResearchPool();
  const id = randomUUID();
  const kind: EntryKind = data.entryKind ?? 'note';
  if (!(ENTRY_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`Invalid entry_kind: ${kind}`);
  }

  await pool.query(
    `INSERT INTO agos_research_notebook_entries
       (id, user_id, experiment_id, entry_kind, title, body_md,
        attached_urls, tags, entry_at, metadata)
     VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::text[], $8::text[],
        COALESCE($9::timestamptz, now()),
        $10::jsonb
     )`,
    [
      id,
      userId,
      experimentId,
      kind,
      data.title,
      data.bodyMd ?? '',
      data.attachedUrls ?? [],
      data.tags ?? [],
      data.entryAt ?? null,
      JSON.stringify(data.metadata ?? {}),
    ],
  );

  const created = await getNotebookEntry(id, userId);
  if (!created) {
    throw new Error('Failed to create notebook entry');
  }
  return created;
}

// ─── Update ────────────────────────────────────────────────────────────────

/**
 * Partial update — every field is opt-in via COALESCE so untouched
 * columns survive. Cross-ownership is enforced by JOIN-ing to
 * agos_research_experiments inside the WHERE clause; rows belonging
 * to another user are invisible (rowCount = 0 → null return).
 *
 * Disallowed via the type system: experiment_id, id, user_id,
 * created_at, updated_at, archived_at.
 */
export async function updateNotebookEntry(
  id: string,
  userId: string,
  patch: UpdateNotebookEntryInput,
): Promise<NotebookEntry | null> {
  const pool = getResearchPool();

  if (
    patch.entryKind !== undefined &&
    !(ENTRY_KINDS as readonly string[]).includes(patch.entryKind)
  ) {
    throw new Error(`Invalid entry_kind: ${patch.entryKind}`);
  }

  const r = await pool.query(
    `UPDATE agos_research_notebook_entries n
        SET entry_kind    = COALESCE($3, entry_kind),
            title         = COALESCE($4, title),
            body_md       = COALESCE($5, body_md),
            attached_urls = COALESCE($6::text[], attached_urls),
            tags          = COALESCE($7::text[], tags),
            entry_at      = COALESCE($8::timestamptz, entry_at),
            metadata      = COALESCE($9::jsonb, metadata),
            updated_at    = now()
      WHERE n.id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = n.experiment_id AND e.user_id = $2
            )
      RETURNING n.id`,
    [
      id,
      userId,
      patch.entryKind ?? null,
      patch.title ?? null,
      patch.bodyMd ?? null,
      patch.attachedUrls ?? null,
      patch.tags ?? null,
      patch.entryAt ?? null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );

  if ((r.rowCount ?? 0) === 0) return null;
  return getNotebookEntry(id, userId);
}

// ─── Archive / restore ─────────────────────────────────────────────────────

/**
 * Soft-archive: set `archived_at = now()`. Returns the updated row,
 * or null if the entry doesn't exist / isn't owned by this user, or
 * if it's already archived (no-op). The "already archived" branch
 * still returns the row so the route can decide to 200 vs 400.
 *
 * The route uses `archiveNotebookEntry` for the DELETE verb. There is
 * no hard-delete path per spec.
 */
export async function archiveNotebookEntry(
  id: string,
  userId: string,
): Promise<NotebookEntry | null> {
  const pool = getResearchPool();
  await pool.query(
    `UPDATE agos_research_notebook_entries n
        SET archived_at = now(),
            updated_at  = now()
      WHERE n.id = $1
        AND n.archived_at IS NULL
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = n.experiment_id AND e.user_id = $2
            )`,
    [id, userId],
  );
  return getNotebookEntry(id, userId);
}

/**
 * Restore a soft-archived entry: clear `archived_at`. Returns null
 * when the entry doesn't exist / isn't owned by this user. Returns
 * the row with archived_at = null on success. The `alreadyActive`
 * flag tells the route to 400 on no-op (per spec: 400 if already
 * not archived).
 */
export async function restoreNotebookEntry(
  id: string,
  userId: string,
): Promise<
  | { entry: NotebookEntry; alreadyActive: false }
  | { entry: NotebookEntry; alreadyActive: true }
  | null
> {
  // Pre-fetch so we can distinguish "already active" from "found + flipped".
  const before = await getNotebookEntry(id, userId);
  if (!before) return null;
  if (before.archivedAt == null) {
    return { entry: before, alreadyActive: true };
  }
  const pool = getResearchPool();
  await pool.query(
    `UPDATE agos_research_notebook_entries n
        SET archived_at = NULL,
            updated_at  = now()
      WHERE n.id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = n.experiment_id AND e.user_id = $2
            )`,
    [id, userId],
  );
  const after = await getNotebookEntry(id, userId);
  if (!after) return null;
  return { entry: after, alreadyActive: false };
}

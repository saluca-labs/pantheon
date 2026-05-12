/**
 * Research OS Phase 4 — papers DB repository.
 *
 * Cross-ownership contract
 * ------------------------
 * `agos_research_papers.user_id` is the ownership column. Every read /
 * write path scopes by `user_id` directly; no JOIN is needed because
 * papers are workshop-global per the spec (not nested under an
 * experiment). A paper id belonging to another user returns null on
 * get / update / archive / restore.
 *
 * DOI / arXiv dedupe contract
 * ---------------------------
 * Partial UNIQUE indexes on `(user_id, doi) WHERE doi IS NOT NULL` and
 * `(user_id, arxiv_id) WHERE arxiv_id IS NOT NULL` enforce per-user
 * dedupe at the DB. The create path catches SQLSTATE 23505 and surfaces
 * a `{kind: 'duplicate', field: 'doi' | 'arxiv_id'}` outcome the route
 * turns into 409.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getResearchPool } from './session';
import {
  PAPER_KINDS,
  asPaperKind,
  type Paper,
  type CreatePaperInput,
  type UpdatePaperInput,
  type PapersListOpts,
} from './papers';

// ─── Row hydration ──────────────────────────────────────────────────────────

const PAPER_COLUMNS = `id, user_id, title, kind, doi, arxiv_id, url, authors_text,
                       venue, year, abstract_md, tags, metadata, archived_at,
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

function rowToPaper(row: any): Paper {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    kind: (asPaperKind(row.kind) ?? 'paper'),
    doi: row.doi ?? null,
    arxivId: row.arxiv_id ?? null,
    url: row.url ?? null,
    authorsText: row.authors_text ?? null,
    venue: row.venue ?? null,
    year: row.year == null ? null : Number(row.year),
    abstractMd: row.abstract_md ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    archivedAt: toIsoOrNull(row.archived_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── List ───────────────────────────────────────────────────────────────────

export async function listPapers(
  userId: string,
  opts: PapersListOpts = {},
): Promise<Paper[]> {
  const pool = getResearchPool();
  const params: any[] = [userId];
  const where: string[] = [`p.user_id = $1`];

  if (opts.archived === true) {
    where.push(`p.archived_at IS NOT NULL`);
  } else if (opts.archived === false || opts.archived === undefined) {
    where.push(`p.archived_at IS NULL`);
  }

  if (opts.kind) {
    if (!(PAPER_KINDS as readonly string[]).includes(opts.kind)) {
      throw new Error(`Invalid kind filter: ${opts.kind}`);
    }
    params.push(opts.kind);
    where.push(`p.kind = $${params.length}`);
  }

  if (opts.tag && opts.tag.trim()) {
    params.push(opts.tag.trim().toLowerCase());
    where.push(`$${params.length} = ANY(p.tags)`);
  }

  if (opts.year != null) {
    params.push(opts.year);
    where.push(`p.year = $${params.length}`);
  }

  if (opts.q && opts.q.trim()) {
    params.push(`%${opts.q.trim().toLowerCase()}%`);
    where.push(
      `(LOWER(p.title) LIKE $${params.length} OR LOWER(COALESCE(p.authors_text, '')) LIKE $${params.length})`,
    );
  }

  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${PAPER_COLUMNS}
       FROM agos_research_papers p
      WHERE ${where.join(' AND ')}
      ORDER BY p.updated_at DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToPaper);
}

// ─── Get one ────────────────────────────────────────────────────────────────

export async function getPaper(id: string, userId: string): Promise<Paper | null> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT ${PAPER_COLUMNS}
       FROM agos_research_papers p
      WHERE p.id = $1 AND p.user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToPaper(r.rows[0]);
}

// ─── Create ─────────────────────────────────────────────────────────────────

export type CreatePaperOutcome =
  | { kind: 'ok'; paper: Paper }
  | { kind: 'duplicate'; field: 'doi' | 'arxiv_id' };

/**
 * Insert a new paper. Translates the Postgres unique-violation into a
 * `{kind: 'duplicate'}` outcome that the route turns into 409. The
 * field is disambiguated from the constraint name in the error.
 */
export async function createPaper(
  userId: string,
  data: CreatePaperInput,
): Promise<CreatePaperOutcome> {
  const pool = getResearchPool();
  const id = randomUUID();
  const kind = data.kind ?? 'paper';
  if (!(PAPER_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`Invalid paper kind: ${kind}`);
  }
  try {
    await pool.query(
      `INSERT INTO agos_research_papers
         (id, user_id, title, kind, doi, arxiv_id, url, authors_text,
          venue, year, abstract_md, tags, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::text[], $13::jsonb)`,
      [
        id,
        userId,
        data.title,
        kind,
        data.doi ?? null,
        data.arxivId ?? null,
        data.url ?? null,
        data.authorsText ?? null,
        data.venue ?? null,
        data.year ?? null,
        data.abstractMd ?? null,
        data.tags ?? [],
        JSON.stringify(data.metadata ?? {}),
      ],
    );
  } catch (err: any) {
    if (err?.code === '23505') {
      const constraint: string = err.constraint ?? '';
      if (constraint.includes('arxiv')) return { kind: 'duplicate', field: 'arxiv_id' };
      if (constraint.includes('doi')) return { kind: 'duplicate', field: 'doi' };
      // Fall through to a generic duplicate signal if the constraint
      // name doesn't disambiguate (we only have two; default to doi).
      return { kind: 'duplicate', field: 'doi' };
    }
    throw err;
  }
  const created = await getPaper(id, userId);
  if (!created) throw new Error('Failed to create paper');
  return { kind: 'ok', paper: created };
}

// ─── Update ─────────────────────────────────────────────────────────────────

export type UpdatePaperOutcome =
  | { kind: 'ok'; paper: Paper }
  | { kind: 'duplicate'; field: 'doi' | 'arxiv_id' }
  | { kind: 'not_found' };

export async function updatePaper(
  id: string,
  userId: string,
  patch: UpdatePaperInput,
): Promise<UpdatePaperOutcome> {
  const pool = getResearchPool();
  if (patch.kind !== undefined && !(PAPER_KINDS as readonly string[]).includes(patch.kind)) {
    throw new Error(`Invalid paper kind: ${patch.kind}`);
  }
  // Three-valued: undefined => leave alone, null => set to NULL, string =>
  // set to value. We can't express that in a single COALESCE, so the
  // patch uses CASE WHEN ... or explicit set-if-present per column.
  // Simpler approach: only update columns the caller actually included.
  const set: string[] = [];
  const params: any[] = [id, userId];
  let n = 2;

  if (patch.title !== undefined) {
    params.push(patch.title);
    n += 1;
    set.push(`title = $${n}`);
  }
  if (patch.kind !== undefined) {
    params.push(patch.kind);
    n += 1;
    set.push(`kind = $${n}`);
  }
  if (patch.doi !== undefined) {
    params.push(patch.doi);
    n += 1;
    set.push(`doi = $${n}`);
  }
  if (patch.arxivId !== undefined) {
    params.push(patch.arxivId);
    n += 1;
    set.push(`arxiv_id = $${n}`);
  }
  if (patch.url !== undefined) {
    params.push(patch.url);
    n += 1;
    set.push(`url = $${n}`);
  }
  if (patch.authorsText !== undefined) {
    params.push(patch.authorsText);
    n += 1;
    set.push(`authors_text = $${n}`);
  }
  if (patch.venue !== undefined) {
    params.push(patch.venue);
    n += 1;
    set.push(`venue = $${n}`);
  }
  if (patch.year !== undefined) {
    params.push(patch.year);
    n += 1;
    set.push(`year = $${n}`);
  }
  if (patch.abstractMd !== undefined) {
    params.push(patch.abstractMd);
    n += 1;
    set.push(`abstract_md = $${n}`);
  }
  if (patch.tags !== undefined) {
    params.push(patch.tags);
    n += 1;
    set.push(`tags = $${n}::text[]`);
  }
  if (patch.metadata !== undefined) {
    params.push(JSON.stringify(patch.metadata));
    n += 1;
    set.push(`metadata = $${n}::jsonb`);
  }

  set.push(`updated_at = now()`);

  try {
    const r = await pool.query(
      `UPDATE agos_research_papers
          SET ${set.join(', ')}
        WHERE id = $1 AND user_id = $2
        RETURNING id`,
      params,
    );
    if ((r.rowCount ?? 0) === 0) {
      return { kind: 'not_found' };
    }
  } catch (err: any) {
    if (err?.code === '23505') {
      const constraint: string = err.constraint ?? '';
      if (constraint.includes('arxiv')) return { kind: 'duplicate', field: 'arxiv_id' };
      if (constraint.includes('doi')) return { kind: 'duplicate', field: 'doi' };
      return { kind: 'duplicate', field: 'doi' };
    }
    throw err;
  }
  const after = await getPaper(id, userId);
  if (!after) return { kind: 'not_found' };
  return { kind: 'ok', paper: after };
}

// ─── Archive / restore ──────────────────────────────────────────────────────

/**
 * Soft-archive: set `archived_at = now()`. Returns the updated row, or
 * null if the paper doesn't exist for this user. Idempotent — calling
 * twice on an already-archived row leaves the original archived_at
 * timestamp untouched (the WHERE clause requires NULL).
 */
export async function archivePaper(id: string, userId: string): Promise<Paper | null> {
  const pool = getResearchPool();
  await pool.query(
    `UPDATE agos_research_papers
        SET archived_at = now(),
            updated_at  = now()
      WHERE id = $1 AND user_id = $2
        AND archived_at IS NULL`,
    [id, userId],
  );
  return getPaper(id, userId);
}

/**
 * Restore a soft-archived paper. Returns:
 *   - null when the paper doesn't exist for this user.
 *   - { paper, alreadyActive: true }  when already active (400 on the route).
 *   - { paper, alreadyActive: false } on a successful restore.
 */
export async function restorePaper(
  id: string,
  userId: string,
): Promise<
  | { paper: Paper; alreadyActive: false }
  | { paper: Paper; alreadyActive: true }
  | null
> {
  const before = await getPaper(id, userId);
  if (!before) return null;
  if (before.archivedAt == null) {
    return { paper: before, alreadyActive: true };
  }
  const pool = getResearchPool();
  await pool.query(
    `UPDATE agos_research_papers
        SET archived_at = NULL,
            updated_at  = now()
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  const after = await getPaper(id, userId);
  if (!after) return null;
  return { paper: after, alreadyActive: false };
}

// ─── Count linked experiments (for detail page sidebar) ─────────────────────

/**
 * How many distinct experiments cite this paper (any relevance)? Used by
 * the paper-detail header and the library card.
 */
export async function countLinkedExperimentsForPaper(
  paperId: string,
  userId: string,
): Promise<number> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT COUNT(DISTINCT er.experiment_id)::int AS n
       FROM agos_research_experiment_references er
       JOIN agos_research_experiments e
         ON e.id = er.experiment_id
        AND e.user_id = $2
      WHERE er.paper_id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_papers p
               WHERE p.id = er.paper_id AND p.user_id = $2
            )`,
    [paperId, userId],
  );
  return Number(r.rows[0]?.n ?? 0);
}

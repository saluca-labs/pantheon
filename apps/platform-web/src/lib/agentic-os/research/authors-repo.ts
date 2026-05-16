/**
 * Research OS Phase 4 — authors DB repository.
 *
 * Authors are workshop-global per user. Partial UNIQUE on (user_id,
 * orcid) WHERE orcid IS NOT NULL dedupes by ORCID; the create path
 * catches SQLSTATE 23505 and surfaces a `{kind: 'duplicate'}` outcome
 * the route turns into 409.
 *
 * Delete contract
 * ---------------
 * `agos_research_paper_authors.author_id` carries FK CASCADE → authors.
 * A hard-delete would silently cascade and drop ordered author rows on
 * every linked paper, which is destructive. The route layer enforces
 * the "force-unlink first" contract via `countLinkedPapersForAuthor`
 * BEFORE issuing the DELETE; this repo trusts the route to have
 * checked.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getResearchPool } from './session';
import type {
  Author,
  CreateAuthorInput,
  UpdateAuthorInput,
  AuthorsListOpts,
} from './authors';

const AUTHOR_COLUMNS = `id, user_id, display_name, given_name, family_name,
                        orcid, affiliation, metadata, created_at, updated_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

interface RawAuthorRow {
  id: string;
  user_id: string;
  display_name: string;
  given_name: string | null;
  family_name: string | null;
  orcid: string | null;
  affiliation: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function rowToAuthor(row: RawAuthorRow): Author {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    givenName: row.given_name ?? null,
    familyName: row.family_name ?? null,
    orcid: row.orcid ?? null,
    affiliation: row.affiliation ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── List ───────────────────────────────────────────────────────────────────

export async function listAuthors(
  userId: string,
  opts: AuthorsListOpts = {},
): Promise<Author[]> {
  const pool = getResearchPool();
  const params: unknown[] = [userId];
  const where: string[] = [`user_id = $1`];

  if (opts.familyNamePrefix && opts.familyNamePrefix.trim()) {
    params.push(`${opts.familyNamePrefix.trim().toLowerCase()}%`);
    where.push(`LOWER(COALESCE(family_name, '')) LIKE $${params.length}`);
  }

  if (opts.q && opts.q.trim()) {
    params.push(`%${opts.q.trim().toLowerCase()}%`);
    where.push(`LOWER(display_name) LIKE $${params.length}`);
  }

  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 1000);
  const offset = Math.max(opts.offset ?? 0, 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${AUTHOR_COLUMNS}
       FROM agos_research_authors
      WHERE ${where.join(' AND ')}
      ORDER BY family_name ASC NULLS LAST, display_name ASC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToAuthor);
}

// ─── Get one ────────────────────────────────────────────────────────────────

export async function getAuthor(id: string, userId: string): Promise<Author | null> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT ${AUTHOR_COLUMNS}
       FROM agos_research_authors
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToAuthor(r.rows[0]);
}

// ─── Create ─────────────────────────────────────────────────────────────────

export type CreateAuthorOutcome =
  | { kind: 'ok'; author: Author }
  | { kind: 'duplicate'; field: 'orcid' };

export async function createAuthor(
  userId: string,
  data: CreateAuthorInput,
): Promise<CreateAuthorOutcome> {
  const pool = getResearchPool();
  const id = randomUUID();
  try {
    await pool.query(
      `INSERT INTO agos_research_authors
         (id, user_id, display_name, given_name, family_name,
          orcid, affiliation, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        id,
        userId,
        data.displayName,
        data.givenName ?? null,
        data.familyName ?? null,
        data.orcid ?? null,
        data.affiliation ?? null,
        JSON.stringify(data.metadata ?? {}),
      ],
    );
  } catch (err: unknown) {
    if (!(err instanceof Error)) throw err;
    const errErr = err as Error & { code?: string; constraint?: string };
    if (errErr?.code === '23505') {
      return { kind: 'duplicate', field: 'orcid' };
    }
    throw err;
  }
  const created = await getAuthor(id, userId);
  if (!created) throw new Error('Failed to create author');
  return { kind: 'ok', author: created };
}

// ─── Update ─────────────────────────────────────────────────────────────────

export type UpdateAuthorOutcome =
  | { kind: 'ok'; author: Author }
  | { kind: 'duplicate'; field: 'orcid' }
  | { kind: 'not_found' };

export async function updateAuthor(
  id: string,
  userId: string,
  patch: UpdateAuthorInput,
): Promise<UpdateAuthorOutcome> {
  const pool = getResearchPool();
  const set: string[] = [];
  const params: unknown[] = [id, userId];
  let n = 2;

  if (patch.displayName !== undefined) {
    params.push(patch.displayName);
    n += 1;
    set.push(`display_name = $${n}`);
  }
  if (patch.givenName !== undefined) {
    params.push(patch.givenName);
    n += 1;
    set.push(`given_name = $${n}`);
  }
  if (patch.familyName !== undefined) {
    params.push(patch.familyName);
    n += 1;
    set.push(`family_name = $${n}`);
  }
  if (patch.orcid !== undefined) {
    params.push(patch.orcid);
    n += 1;
    set.push(`orcid = $${n}`);
  }
  if (patch.affiliation !== undefined) {
    params.push(patch.affiliation);
    n += 1;
    set.push(`affiliation = $${n}`);
  }
  if (patch.metadata !== undefined) {
    params.push(JSON.stringify(patch.metadata));
    n += 1;
    set.push(`metadata = $${n}::jsonb`);
  }

  set.push(`updated_at = now()`);

  try {
    const r = await pool.query(
      `UPDATE agos_research_authors
          SET ${set.join(', ')}
        WHERE id = $1 AND user_id = $2
        RETURNING id`,
      params,
    );
    if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };
  } catch (err: unknown) {
    if (!(err instanceof Error)) throw err;
    const errErr = err as Error & { code?: string; constraint?: string };
    if (errErr?.code === '23505') {
      return { kind: 'duplicate', field: 'orcid' };
    }
    throw err;
  }
  const after = await getAuthor(id, userId);
  if (!after) return { kind: 'not_found' };
  return { kind: 'ok', author: after };
}

// ─── Linked-paper count (force-unlink-first guard) ─────────────────────────

export async function countLinkedPapersForAuthor(
  authorId: string,
  userId: string,
): Promise<number> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM agos_research_paper_authors pa
       JOIN agos_research_papers p ON p.id = pa.paper_id
      WHERE pa.author_id = $1
        AND p.user_id = $2
        AND EXISTS (
              SELECT 1 FROM agos_research_authors a
               WHERE a.id = pa.author_id AND a.user_id = $2
            )`,
    [authorId, userId],
  );
  return Number(r.rows[0]?.n ?? 0);
}

// ─── Delete ─────────────────────────────────────────────────────────────────

export type DeleteAuthorOutcome =
  | { kind: 'ok' }
  | { kind: 'not_found' }
  | { kind: 'in_use'; count: number };

/**
 * Hard-delete an author row. Returns `{kind: 'in_use'}` when any paper
 * still links the author — the route turns that into 409 per spec
 * (force-unlink-first contract).
 */
export async function deleteAuthor(
  id: string,
  userId: string,
): Promise<DeleteAuthorOutcome> {
  const owned = await getAuthor(id, userId);
  if (!owned) return { kind: 'not_found' };
  const links = await countLinkedPapersForAuthor(id, userId);
  if (links > 0) return { kind: 'in_use', count: links };
  const pool = getResearchPool();
  const r = await pool.query(
    `DELETE FROM agos_research_authors
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };
  return { kind: 'ok' };
}

// ─── Count papers for the authors-list index ───────────────────────────────

export async function authorPaperCounts(
  userId: string,
  authorIds: string[],
): Promise<Record<string, number>> {
  if (authorIds.length === 0) return {};
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT pa.author_id AS id, COUNT(*)::int AS n
       FROM agos_research_paper_authors pa
       JOIN agos_research_papers p
         ON p.id = pa.paper_id
        AND p.user_id = $1
      WHERE pa.author_id = ANY($2::uuid[])
        AND EXISTS (
              SELECT 1 FROM agos_research_authors a
               WHERE a.id = pa.author_id AND a.user_id = $1
            )
      GROUP BY pa.author_id`,
    [userId, authorIds],
  );
  const out: Record<string, number> = {};
  for (const row of r.rows) {
    out[row.id] = Number(row.n);
  }
  for (const id of authorIds) {
    if (out[id] === undefined) out[id] = 0;
  }
  return out;
}

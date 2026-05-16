/**
 * Research OS Phase 4 — paper-author join DB repository.
 *
 * The join is ordered (`position`, 1-indexed) and carries TWO UNIQUE
 * constraints:
 *   - UNIQUE (paper_id, position) — one author per slot
 *   - UNIQUE (paper_id, author_id) — no duplicate links
 *
 * Cross-ownership
 * ---------------
 * Both `paper_id` and `author_id` carry FK CASCADE inside the same
 * tenant — but the schema lets a row reference any paper/author UUID.
 * The repo therefore JOINs both sides back to `user_id` for every read
 * and mutation. Cross-tenant ids return null / not_found.
 *
 * Position reorder transaction
 * ----------------------------
 * Moving author A from position 2 to position 4 would collide with the
 * author currently at position 4. The reorder helper runs a single
 * UPDATE with a CASE-expression inside a transaction that closes the
 * gap left by A and pushes the displaced authors forward / backward
 * accordingly. This avoids needing a DEFERRABLE constraint while still
 * holding atomicity. The UPDATE sets `position` for ALL affected rows
 * in one statement; PostgreSQL evaluates the new values column-wise so
 * the UNIQUE check sees the post-shift state.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getResearchPool } from './session';
import type { Pool, PoolClient } from 'pg';
import {
  type PaperAuthorLink,
  type OrderedAuthor,
  type LinkAuthorInput,
} from './paper-authors';
import type { Author } from './authors';

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

interface RawPaperAuthorLinkRow {
  id: string;
  paper_id: string;
  author_id: string;
  position: number | string;
  created_at: Date | string;
}

interface RawJoinedAuthorRow {
  a_id: string;
  a_user_id: string;
  a_display_name: string;
  a_given_name: string | null;
  a_family_name: string | null;
  a_orcid: string | null;
  a_affiliation: string | null;
  a_metadata: Record<string, unknown> | null;
  a_created_at: Date | string;
  a_updated_at: Date | string;
}

function rowToLink(row: RawPaperAuthorLinkRow): PaperAuthorLink {
  return {
    id: row.id,
    paperId: row.paper_id,
    authorId: row.author_id,
    position: Number(row.position),
    createdAt: toIso(row.created_at),
  };
}

function rowToAuthor(row: RawJoinedAuthorRow): Author {
  return {
    id: row.a_id,
    userId: row.a_user_id,
    displayName: row.a_display_name,
    givenName: row.a_given_name ?? null,
    familyName: row.a_family_name ?? null,
    orcid: row.a_orcid ?? null,
    affiliation: row.a_affiliation ?? null,
    metadata: (row.a_metadata as Record<string, unknown>) ?? {},
    createdAt: toIso(row.a_created_at),
    updatedAt: toIso(row.a_updated_at),
  };
}

// ─── Ownership probe (paper-side) ──────────────────────────────────────────

export async function isPaperOwnedByUser(
  paperId: string,
  userId: string,
): Promise<boolean> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_research_papers
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [paperId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function isAuthorOwnedByUser(
  authorId: string,
  userId: string,
): Promise<boolean> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_research_authors
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [authorId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── List ordered authors for a paper ──────────────────────────────────────

export async function listOrderedAuthorsForPaper(
  paperId: string,
  userId: string,
): Promise<OrderedAuthor[]> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT pa.id, pa.paper_id, pa.author_id, pa.position, pa.created_at,
            a.id            AS a_id,
            a.user_id       AS a_user_id,
            a.display_name  AS a_display_name,
            a.given_name    AS a_given_name,
            a.family_name   AS a_family_name,
            a.orcid         AS a_orcid,
            a.affiliation   AS a_affiliation,
            a.metadata      AS a_metadata,
            a.created_at    AS a_created_at,
            a.updated_at    AS a_updated_at
       FROM agos_research_paper_authors pa
       JOIN agos_research_authors a ON a.id = pa.author_id
      WHERE pa.paper_id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_papers p
               WHERE p.id = pa.paper_id AND p.user_id = $2
            )
        AND a.user_id = $2
      ORDER BY pa.position ASC`,
    [paperId, userId],
  );
  return r.rows.map((row: RawPaperAuthorLinkRow & RawJoinedAuthorRow) => ({
    link: rowToLink({
      id: row.id,
      paper_id: row.paper_id,
      author_id: row.author_id,
      position: row.position,
      created_at: row.created_at,
    }),
    author: rowToAuthor(row),
  }));
}

// ─── Auto-position helper ──────────────────────────────────────────────────

async function nextPosition(
  client: Pool | PoolClient,
  paperId: string,
): Promise<number> {
  const r = await client.query(
    `SELECT COALESCE(MAX(position), 0)::int + 1 AS next
       FROM agos_research_paper_authors
      WHERE paper_id = $1`,
    [paperId],
  );
  return Number(r.rows[0]?.next ?? 1);
}

// ─── Link existing author ──────────────────────────────────────────────────

export type LinkAuthorOutcome =
  | { kind: 'ok'; link: PaperAuthorLink; authorId: string; created: boolean }
  | { kind: 'duplicate_author' }
  | { kind: 'duplicate_position' }
  | { kind: 'invalid_position' };

/**
 * Link an existing author by id. Paper ownership + author ownership
 * MUST have been validated by the caller. Returns:
 *   - 'duplicate_author' if (paper_id, author_id) already exists.
 *   - 'duplicate_position' if the position slot is already taken.
 *   - 'invalid_position' if position < 1.
 */
export async function linkExistingAuthor(
  paperId: string,
  authorId: string,
  position: number | undefined,
): Promise<LinkAuthorOutcome> {
  const pool = getResearchPool();
  const pos = position ?? (await nextPosition(pool, paperId));
  if (!Number.isInteger(pos) || pos < 1) {
    return { kind: 'invalid_position' };
  }
  const id = randomUUID();
  try {
    await pool.query(
      `INSERT INTO agos_research_paper_authors (id, paper_id, author_id, position)
       VALUES ($1, $2, $3, $4)`,
      [id, paperId, authorId, pos],
    );
  } catch (err: unknown) {
    if (!(err instanceof Error)) throw err;
    const errErr = err as Error & { code?: string; constraint?: string };
    if (errErr?.code === '23505') {
      const constraint: string = errErr.constraint ?? '';
      // Check `position` BEFORE `author` — the position-unique constraint
      // name contains "author" (the table name is `paper_authors`), so a
      // simple `.includes('author')` first would mis-route.
      if (constraint.includes('position')) return { kind: 'duplicate_position' };
      if (constraint.includes('author')) return { kind: 'duplicate_author' };
      // Fallback: a 23505 without a recognised constraint name — treat
      // as duplicate_author (most likely culprit).
      return { kind: 'duplicate_author' };
    }
    throw err;
  }
  const r = await pool.query(
    `SELECT id, paper_id, author_id, position, created_at
       FROM agos_research_paper_authors WHERE id = $1`,
    [id],
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'duplicate_author' };
  return { kind: 'ok', link: rowToLink(r.rows[0]), authorId, created: false };
}

// ─── Unlink ────────────────────────────────────────────────────────────────

export async function unlinkAuthor(
  paperId: string,
  authorId: string,
  userId: string,
): Promise<boolean> {
  const pool = getResearchPool();
  const r = await pool.query(
    `DELETE FROM agos_research_paper_authors pa
      WHERE pa.paper_id = $1
        AND pa.author_id = $2
        AND EXISTS (
              SELECT 1 FROM agos_research_papers p
               WHERE p.id = pa.paper_id AND p.user_id = $3
            )
        AND EXISTS (
              SELECT 1 FROM agos_research_authors a
               WHERE a.id = pa.author_id AND a.user_id = $3
            )`,
    [paperId, authorId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Reorder (move one link's position, swap with displaced) ──────────────

export type ReorderOutcome =
  | { kind: 'ok' }
  | { kind: 'not_found' }
  | { kind: 'invalid_position' };

/**
 * Change the position of one paper-author link, shifting the displaced
 * authors to keep positions contiguous. Runs in a transaction:
 *
 *   - If `newPos > oldPos`: every link with `oldPos < position <= newPos`
 *     decreases by 1.
 *   - If `newPos < oldPos`: every link with `newPos <= position < oldPos`
 *     increases by 1.
 *   - The target link is set to `newPos`.
 *
 * All in one UPDATE per phase. The UNIQUE (paper_id, position) constraint
 * is preserved at statement boundary because the displaced rows shift
 * BEFORE the target row moves into the slot — we issue them in two
 * statements inside the txn.
 */
export async function reorderPaperAuthor(
  paperId: string,
  authorId: string,
  newPosition: number,
  userId: string,
): Promise<ReorderOutcome> {
  if (!Number.isInteger(newPosition) || newPosition < 1) {
    return { kind: 'invalid_position' };
  }
  const pool = getResearchPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ownership probe inside the txn so a race-deleted paper / author
    // returns not_found cleanly.
    const ownership = await client.query(
      `SELECT 1 FROM agos_research_papers p
        WHERE p.id = $1 AND p.user_id = $2`,
      [paperId, userId],
    );
    if ((ownership.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return { kind: 'not_found' };
    }

    const linkRow = await client.query(
      `SELECT pa.id, pa.position
         FROM agos_research_paper_authors pa
        WHERE pa.paper_id = $1 AND pa.author_id = $2
          AND EXISTS (
                SELECT 1 FROM agos_research_authors a
                 WHERE a.id = pa.author_id AND a.user_id = $3
              )
        LIMIT 1`,
      [paperId, authorId, userId],
    );
    if ((linkRow.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return { kind: 'not_found' };
    }

    const linkId: string = linkRow.rows[0].id;
    const oldPos: number = Number(linkRow.rows[0].position);

    const maxRow = await client.query(
      `SELECT COALESCE(MAX(position), 0)::int AS m
         FROM agos_research_paper_authors WHERE paper_id = $1`,
      [paperId],
    );
    const maxPos: number = Number(maxRow.rows[0]?.m ?? 0);
    if (newPosition > maxPos) {
      await client.query('ROLLBACK');
      return { kind: 'invalid_position' };
    }

    if (newPosition === oldPos) {
      await client.query('COMMIT');
      return { kind: 'ok' };
    }

    // Step 1: park the target row at a sentinel position above max so it
    // doesn't collide with the displaced rows while they shift.
    const sentinel = maxPos + 1000;
    await client.query(
      `UPDATE agos_research_paper_authors
          SET position = $1
        WHERE id = $2`,
      [sentinel, linkId],
    );

    if (newPosition > oldPos) {
      // Shift rows in (oldPos, newPos] down by 1.
      await client.query(
        `UPDATE agos_research_paper_authors
            SET position = position - 1
          WHERE paper_id = $1
            AND position > $2
            AND position <= $3
            AND id <> $4`,
        [paperId, oldPos, newPosition, linkId],
      );
    } else {
      // newPosition < oldPos: shift rows in [newPos, oldPos) up by 1.
      await client.query(
        `UPDATE agos_research_paper_authors
            SET position = position + 1
          WHERE paper_id = $1
            AND position >= $2
            AND position < $3
            AND id <> $4`,
        [paperId, newPosition, oldPos, linkId],
      );
    }

    // Step 2: move the target row into its new slot.
    await client.query(
      `UPDATE agos_research_paper_authors
          SET position = $1
        WHERE id = $2`,
      [newPosition, linkId],
    );

    await client.query('COMMIT');
    return { kind: 'ok' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Unlink-all (used when archiving a paper — currently unused) ──────────

/**
 * Used internally on hard-delete paths (not in Phase 4). Kept here as a
 * seam for the future archive-truncates-authors flow.
 */
export async function unlinkAllAuthorsForPaper(
  paperId: string,
  userId: string,
): Promise<number> {
  const pool = getResearchPool();
  const r = await pool.query(
    `DELETE FROM agos_research_paper_authors pa
      WHERE pa.paper_id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_papers p
               WHERE p.id = pa.paper_id AND p.user_id = $2
            )`,
    [paperId, userId],
  );
  return r.rowCount ?? 0;
}

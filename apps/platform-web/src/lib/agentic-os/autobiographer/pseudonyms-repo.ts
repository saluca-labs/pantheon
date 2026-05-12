/**
 * Autobiographer OS — Pseudonyms repo.
 *
 * CRUD against ``agos_autobiographer_pseudonyms`` from migration
 * ``0047_autobiographer_phase6``. Cross-ownership is enforced by always
 * filtering on ``user_id`` and by the route layer validating both
 * ``book_id`` AND ``person_id`` belong to the caller before insert
 * (mirrors the chapter-sources pattern from Phase 4).
 *
 * Duplicate ``(book_id, person_id)`` rows raise the Postgres unique
 * violation code ``23505``; the repo translates that to a typed
 * ``duplicate`` error the route maps to 409 Conflict.
 *
 * The PDF export layer flips ``applied = true`` on every pseudonym
 * row that produced at least one substitution via
 * ``markPseudonymsApplied``. The flag is informational — it surfaces
 * in the privacy hub so the user knows which renames have actually
 * fired across PDF renders.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAutobiographerPool } from './session';
import {
  PSEUDONYM_NAME_MAX,
  PSEUDONYM_NOTES_MAX,
} from './pseudonyms';

export interface AutobiographerPseudonym {
  id: string;
  bookId: string;
  userId: string;
  personId: string;
  pseudonym: string;
  notes: string | null;
  applied: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Joined view: pseudonym row + display fields from the person row. */
export interface PseudonymWithPerson extends AutobiographerPseudonym {
  personCanonicalName: string;
  personAliases: string[];
}

export interface CreatePseudonymInput {
  bookId: string;
  personId: string;
  pseudonym: string;
  notes?: string | null;
}

export interface UpdatePseudonymInput {
  pseudonym?: string;
  notes?: string | null;
  /** Surfaced for visibility; the export layer is the typical writer. */
  applied?: boolean;
}

const PSEUDONYM_COLUMNS = `id, book_id, user_id, person_id, pseudonym,
                           notes, applied, created_at, updated_at`;

function rowToPseudonym(row: any): AutobiographerPseudonym {
  return {
    id: row.id,
    bookId: row.book_id,
    userId: row.user_id,
    personId: row.person_id,
    pseudonym: row.pseudonym,
    notes: row.notes ?? null,
    applied: Boolean(row.applied),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

function rowToPseudonymWithPerson(row: any): PseudonymWithPerson {
  return {
    ...rowToPseudonym(row),
    personCanonicalName: row.person_canonical_name ?? '',
    personAliases: Array.isArray(row.person_aliases) ? row.person_aliases : [],
  };
}

/**
 * List every pseudonym row for a book. Joined with the source person
 * row so the privacy hub + export layer can render canonical_name +
 * aliases without a second round trip.
 */
export async function listPseudonymsForBook(
  bookId: string,
  userId: string,
): Promise<PseudonymWithPerson[]> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${PSEUDONYM_COLUMNS.split(',')
      .map((c) => `p.${c.trim()}`)
      .join(', ')},
            pe.canonical_name AS person_canonical_name,
            pe.aliases        AS person_aliases
       FROM agos_autobiographer_pseudonyms p
       JOIN agos_autobiographer_people pe ON pe.id = p.person_id
      WHERE p.book_id = $1 AND p.user_id = $2
      ORDER BY lower(pe.canonical_name) ASC`,
    [bookId, userId],
  );
  return r.rows.map(rowToPseudonymWithPerson);
}

export async function getPseudonym(
  id: string,
  userId: string,
): Promise<AutobiographerPseudonym | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${PSEUDONYM_COLUMNS}
       FROM agos_autobiographer_pseudonyms
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToPseudonym(r.rows[0]);
}

/**
 * Confirm the caller owns both the book AND the person before
 * creating a pseudonym row. Returns true on success, false otherwise.
 */
export async function bookAndPersonBelongToUser(
  bookId: string,
  personId: string,
  userId: string,
): Promise<boolean> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT
       (SELECT 1 FROM agos_autobiographer_books  WHERE id = $1 AND user_id = $3 LIMIT 1) AS book_ok,
       (SELECT 1 FROM agos_autobiographer_people WHERE id = $2 AND user_id = $3 LIMIT 1) AS person_ok`,
    [bookId, personId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return false;
  const row = r.rows[0];
  return row.book_ok === 1 && row.person_ok === 1;
}

export async function createPseudonym(
  userId: string,
  data: CreatePseudonymInput,
): Promise<AutobiographerPseudonym> {
  const pool = getAutobiographerPool();
  if (!data.pseudonym || data.pseudonym.trim().length === 0) {
    throw new Error('pseudonym is required');
  }
  if (data.pseudonym.length > PSEUDONYM_NAME_MAX) {
    throw new Error(`pseudonym exceeds ${PSEUDONYM_NAME_MAX} characters`);
  }
  if (data.notes && data.notes.length > PSEUDONYM_NOTES_MAX) {
    throw new Error(`notes exceed ${PSEUDONYM_NOTES_MAX} characters`);
  }
  const id = randomUUID();
  try {
    await pool.query(
      `INSERT INTO agos_autobiographer_pseudonyms
         (id, book_id, user_id, person_id, pseudonym, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        data.bookId,
        userId,
        data.personId,
        data.pseudonym.trim(),
        data.notes ?? null,
      ],
    );
  } catch (err: any) {
    if (err?.code === '23505') {
      const dup = new Error('duplicate');
      (dup as any).code = 'duplicate';
      throw dup;
    }
    throw err;
  }
  const pseudonym = await getPseudonym(id, userId);
  if (!pseudonym) throw new Error('Failed to create pseudonym');
  return pseudonym;
}

export async function updatePseudonym(
  id: string,
  userId: string,
  patch: UpdatePseudonymInput,
): Promise<AutobiographerPseudonym | null> {
  const pool = getAutobiographerPool();
  if (patch.pseudonym !== undefined) {
    if (patch.pseudonym.trim().length === 0) {
      throw new Error('pseudonym is required');
    }
    if (patch.pseudonym.length > PSEUDONYM_NAME_MAX) {
      throw new Error(`pseudonym exceeds ${PSEUDONYM_NAME_MAX} characters`);
    }
  }
  if (patch.notes && patch.notes.length > PSEUDONYM_NOTES_MAX) {
    throw new Error(`notes exceed ${PSEUDONYM_NOTES_MAX} characters`);
  }
  await pool.query(
    `UPDATE agos_autobiographer_pseudonyms
        SET pseudonym  = COALESCE($3, pseudonym),
            notes      = CASE WHEN $4::boolean THEN $5 ELSE notes END,
            applied    = COALESCE($6, applied),
            updated_at = now()
      WHERE id = $1 AND user_id = $2`,
    [
      id,
      userId,
      patch.pseudonym ? patch.pseudonym.trim() : null,
      Object.prototype.hasOwnProperty.call(patch, 'notes'),
      patch.notes ?? null,
      patch.applied ?? null,
    ],
  );
  return getPseudonym(id, userId);
}

export async function deletePseudonym(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `DELETE FROM agos_autobiographer_pseudonyms
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Flip ``applied = true`` on every pseudonym id in the supplied set.
 * Called by the PDF export route AFTER a substitution actually fires
 * during render. The update is a single statement with ``= ANY($1)``
 * so a large set still runs in one round trip.
 *
 * Returns the number of rows touched.
 */
export async function markPseudonymsApplied(
  ids: readonly string[],
  userId: string,
): Promise<number> {
  if (ids.length === 0) return 0;
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `UPDATE agos_autobiographer_pseudonyms
        SET applied = true, updated_at = now()
      WHERE id = ANY($1::uuid[]) AND user_id = $2 AND applied = false`,
    [Array.from(new Set(ids)), userId],
  );
  return r.rowCount ?? 0;
}

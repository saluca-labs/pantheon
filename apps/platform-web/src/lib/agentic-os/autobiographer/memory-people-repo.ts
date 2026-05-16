/**
 * Autobiographer OS — Memory-people join-table repo.
 *
 * CRUD against `agos_autobiographer_memory_people` from migration
 * `0043_autobiographer_phase2`. Every write validates that both endpoints
 * (memory + person) belong to the caller before touching the join row —
 * if either is missing or belongs to someone else, the repo throws a
 * typed `not_found` error the route layer maps to 404. This intentionally
 * does NOT distinguish "memory missing" from "person missing" so a
 * caller can't enumerate other users' rows.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import 'server-only';
import { getAutobiographerPool } from './session';
import { normalizeRole } from './memory-people';
import type { AutobiographerPerson } from './people-repo';
import type { ConsentState } from './people';

export interface MemoryPersonLink {
  memoryId: string;
  personId: string;
  role: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A person joined to a memory, with the join's `role` + `notes`. */
export interface MemoryPersonJoined {
  person: AutobiographerPerson;
  role: string | null;
  notes: string | null;
}

/** A memory joined to a person, with the join's `role` + `notes`. */
export interface PersonMemoryJoined {
  memoryId: string;
  bookId: string | null;
  title: string;
  whenInLife: string | null;
  eraDateEstimate: string | null;
  role: string | null;
  notes: string | null;
  updatedAt: string;
}

const LINK_COLUMNS = `memory_id, person_id, role, notes, created_at, updated_at`;

interface RawMemoryPersonLinkRow {
  memory_id: string;
  person_id: string;
  role: string | null;
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RawPersonJoinedRow {
  id: string;
  user_id: string;
  canonical_name: string;
  aliases: string[] | null;
  relation: string | null;
  birth_year: number | string | null;
  death_year: number | string | null;
  consent_to_publish: string;
  consent_recorded_at: Date | string | null;
  consent_recorded_by: string | null;
  notes: string | null;
  image_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
  link_role: string | null;
  link_notes: string | null;
}

interface RawPersonMemoryRow {
  memory_id: string;
  book_id: string | null;
  title: string;
  when_in_life: string | null;
  era_date_estimate: Date | string | null;
  updated_at: Date | string;
  link_role: string | null;
  link_notes: string | null;
}

interface RawPersonBookAppearanceRow {
  book_id: string;
  book_title: string;
  memory_count: number | string;
}

function rowToLink(row: RawMemoryPersonLinkRow): MemoryPersonLink {
  return {
    memoryId: row.memory_id,
    personId: row.person_id,
    role: row.role ?? null,
    notes: row.notes ?? null,
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

/**
 * Validate that the supplied memory belongs to `userId`. Returns true if
 * the memory exists and is owned by the caller.
 */
async function memoryBelongsToUser(
  memoryId: string,
  userId: string,
): Promise<boolean> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_autobiographer_memories
      WHERE id = $1 AND user_id = $2`,
    [memoryId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

async function personBelongsToUser(
  personId: string,
  userId: string,
): Promise<boolean> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_autobiographer_people
      WHERE id = $1 AND user_id = $2`,
    [personId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

/** Joined list of people attached to `memoryId`, scoped to caller. */
export async function listPeopleForMemory(
  memoryId: string,
  userId: string,
): Promise<MemoryPersonJoined[]> {
  const pool = getAutobiographerPool();
  // The memory ownership check is enforced via the join — only rows where
  // the parent memory belongs to the caller are returned.
  const r = await pool.query(
    `SELECT mp.role            AS link_role,
            mp.notes           AS link_notes,
            p.id, p.user_id, p.canonical_name, p.aliases, p.relation,
            p.birth_year, p.death_year,
            p.consent_to_publish, p.consent_recorded_at, p.consent_recorded_by,
            p.notes, p.image_url, p.metadata,
            p.created_at, p.updated_at
       FROM agos_autobiographer_memory_people mp
       JOIN agos_autobiographer_people p ON p.id = mp.person_id
       JOIN agos_autobiographer_memories m ON m.id = mp.memory_id
      WHERE mp.memory_id = $1
        AND m.user_id     = $2
        AND p.user_id     = $2
      ORDER BY lower(p.canonical_name) ASC`,
    [memoryId, userId],
  );
  return r.rows.map((row: RawPersonJoinedRow) => ({
    person: {
      id: row.id,
      userId: row.user_id,
      canonicalName: row.canonical_name,
      aliases: Array.isArray(row.aliases) ? row.aliases : [],
      relation: row.relation ?? null,
      birthYear: row.birth_year === null ? null : Number(row.birth_year),
      deathYear: row.death_year === null ? null : Number(row.death_year),
      consentToPublish: row.consent_to_publish as ConsentState,
      consentRecordedAt:
        row.consent_recorded_at instanceof Date
          ? row.consent_recorded_at.toISOString()
          : row.consent_recorded_at ?? null,
      consentRecordedBy: row.consent_recorded_by ?? null,
      notes: row.notes ?? null,
      imageUrl: row.image_url ?? null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : String(row.updated_at),
    },
    role: row.link_role ?? null,
    notes: row.link_notes ?? null,
  }));
}

/** Joined list of memories that mention `personId`, scoped to caller. */
export async function listMemoriesForPerson(
  personId: string,
  userId: string,
): Promise<PersonMemoryJoined[]> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT m.id             AS memory_id,
            m.book_id,
            m.title,
            m.when_in_life,
            m.era_date_estimate,
            m.updated_at,
            mp.role          AS link_role,
            mp.notes         AS link_notes
       FROM agos_autobiographer_memory_people mp
       JOIN agos_autobiographer_memories m ON m.id = mp.memory_id
       JOIN agos_autobiographer_people  p ON p.id = mp.person_id
      WHERE mp.person_id = $1
        AND m.user_id    = $2
        AND p.user_id    = $2
      ORDER BY m.era_date_estimate ASC NULLS LAST, m.updated_at DESC`,
    [personId, userId],
  );
  return r.rows.map((row: RawPersonMemoryRow) => ({
    memoryId: row.memory_id,
    bookId: row.book_id ?? null,
    title: row.title,
    whenInLife: row.when_in_life ?? null,
    eraDateEstimate: row.era_date_estimate
      ? new Date(row.era_date_estimate).toISOString().slice(0, 10)
      : null,
    role: row.link_role ?? null,
    notes: row.link_notes ?? null,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  }));
}

/**
 * List of distinct books a person appears in, via memory→book. Implemented
 * as memory→book directly (Phase 4 introduces book→chapter→memory; this
 * function will extend cleanly when chapters land).
 */
export interface PersonBookAppearance {
  bookId: string;
  bookTitle: string;
  memoryCount: number;
}

export async function listBooksForPerson(
  personId: string,
  userId: string,
): Promise<PersonBookAppearance[]> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT b.id              AS book_id,
            b.title           AS book_title,
            COUNT(m.id)::int  AS memory_count
       FROM agos_autobiographer_memory_people mp
       JOIN agos_autobiographer_memories m ON m.id = mp.memory_id
       JOIN agos_autobiographer_books   b ON b.id = m.book_id
       JOIN agos_autobiographer_people  p ON p.id = mp.person_id
      WHERE mp.person_id = $1
        AND m.user_id    = $2
        AND p.user_id    = $2
        AND b.user_id    = $2
      GROUP BY b.id, b.title
      ORDER BY memory_count DESC, lower(b.title) ASC`,
    [personId, userId],
  );
  return r.rows.map((row: RawPersonBookAppearanceRow) => ({
    bookId: row.book_id,
    bookTitle: row.book_title,
    memoryCount: Number(row.memory_count),
  }));
}

export interface LinkPersonInput {
  role?: string | null;
  notes?: string | null;
}

/**
 * Insert a memory↔person link. Validates both endpoints belong to caller
 * before INSERT (cross-ownership safety). Throws `not_found` if either is
 * missing/foreign; throws `duplicate` if the link already exists.
 */
export async function linkPersonToMemory(
  memoryId: string,
  personId: string,
  userId: string,
  data: LinkPersonInput = {},
): Promise<MemoryPersonLink> {
  const [memOk, personOk] = await Promise.all([
    memoryBelongsToUser(memoryId, userId),
    personBelongsToUser(personId, userId),
  ]);
  if (!memOk || !personOk) {
    const err = new Error('not_found') as Error & { code?: string };
    err.code = 'not_found';
    throw err;
  }

  const pool = getAutobiographerPool();
  try {
    await pool.query(
      `INSERT INTO agos_autobiographer_memory_people
         (memory_id, person_id, role, notes)
       VALUES ($1, $2, $3, $4)`,
      [memoryId, personId, normalizeRole(data.role ?? null), data.notes ?? null],
    );
  } catch (err: unknown) {
    if (!(err instanceof Error)) throw err;
    const errErr = err as Error & { code?: string; constraint?: string };
    if (errErr?.code === '23505') {
      const dup = new Error('duplicate') as Error & { code?: string };
      dup.code = 'duplicate';
      throw dup;
    }
    throw err;
  }

  const r = await pool.query(
    `SELECT ${LINK_COLUMNS}
       FROM agos_autobiographer_memory_people
      WHERE memory_id = $1 AND person_id = $2`,
    [memoryId, personId],
  );
  if ((r.rowCount ?? 0) === 0) throw new Error('Failed to create link');
  return rowToLink(r.rows[0]);
}

/** Update `role` and/or `notes` on an existing link. */
export async function updateLink(
  memoryId: string,
  personId: string,
  userId: string,
  patch: LinkPersonInput,
): Promise<MemoryPersonLink | null> {
  const [memOk, personOk] = await Promise.all([
    memoryBelongsToUser(memoryId, userId),
    personBelongsToUser(personId, userId),
  ]);
  if (!memOk || !personOk) {
    const err = new Error('not_found') as Error & { code?: string };
    err.code = 'not_found';
    throw err;
  }

  const pool = getAutobiographerPool();
  const role =
    patch.role === undefined
      ? null
      : normalizeRole(patch.role) ?? '';
  await pool.query(
    `UPDATE agos_autobiographer_memory_people
        SET role       = CASE WHEN $4::boolean THEN $5 ELSE role END,
            notes      = COALESCE($6, notes),
            updated_at = now()
      WHERE memory_id = $1 AND person_id = $2
        AND EXISTS (
          SELECT 1 FROM agos_autobiographer_memories m
           WHERE m.id = $1 AND m.user_id = $3
        )`,
    [
      memoryId,
      personId,
      userId,
      patch.role !== undefined,
      role === '' ? null : role,
      patch.notes ?? null,
    ],
  );

  const r = await pool.query(
    `SELECT ${LINK_COLUMNS}
       FROM agos_autobiographer_memory_people
      WHERE memory_id = $1 AND person_id = $2`,
    [memoryId, personId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToLink(r.rows[0]);
}

/** Delete a single link. Returns true iff a row was removed. */
export async function deleteLink(
  memoryId: string,
  personId: string,
  userId: string,
): Promise<boolean> {
  const [memOk, personOk] = await Promise.all([
    memoryBelongsToUser(memoryId, userId),
    personBelongsToUser(personId, userId),
  ]);
  if (!memOk || !personOk) {
    const err = new Error('not_found') as Error & { code?: string };
    err.code = 'not_found';
    throw err;
  }

  const pool = getAutobiographerPool();
  const r = await pool.query(
    `DELETE FROM agos_autobiographer_memory_people
      WHERE memory_id = $1 AND person_id = $2`,
    [memoryId, personId],
  );
  return (r.rowCount ?? 0) > 0;
}

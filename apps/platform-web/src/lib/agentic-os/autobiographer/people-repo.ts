/**
 * Autobiographer OS — People repo.
 *
 * CRUD against `agos_autobiographer_people` from migration
 * `0043_autobiographer_phase2`. Every read filters by `user_id` so a row
 * is only ever visible to the user who created it. `(user_id,
 * lower(canonical_name))` is enforced by a functional UNIQUE index; the
 * repo catches the unique-violation error code (23505) and surfaces it as
 * a typed `duplicate_name` error the route layer maps to 409.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAutobiographerPool } from './session';
import {
  CONSENT_STATES,
  normalizeAliases,
  type ConsentState,
} from './people';

export interface AutobiographerPerson {
  id: string;
  userId: string;
  canonicalName: string;
  aliases: string[];
  relation: string | null;
  birthYear: number | null;
  deathYear: number | null;
  consentToPublish: ConsentState;
  consentRecordedAt: string | null;
  consentRecordedBy: string | null;
  notes: string | null;
  imageUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePersonInput {
  canonicalName: string;
  aliases?: string[];
  relation?: string | null;
  birthYear?: number | null;
  deathYear?: number | null;
  consentToPublish?: ConsentState;
  consentRecordedAt?: string | null;
  consentRecordedBy?: string | null;
  notes?: string | null;
  imageUrl?: string | null;
  metadata?: Record<string, unknown>;
}

export type UpdatePersonInput = Partial<CreatePersonInput>;

const PERSON_COLUMNS = `id, user_id, canonical_name, aliases, relation,
                        birth_year, death_year,
                        consent_to_publish, consent_recorded_at, consent_recorded_by,
                        notes, image_url, metadata,
                        created_at, updated_at`;

function rowToPerson(row: any): AutobiographerPerson {
  return {
    id: row.id,
    userId: row.user_id,
    canonicalName: row.canonical_name,
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    relation: row.relation ?? null,
    birthYear: row.birth_year === null ? null : Number(row.birth_year),
    deathYear: row.death_year === null ? null : Number(row.death_year),
    consentToPublish: (row.consent_to_publish as ConsentState) ?? 'pending',
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
  };
}

export interface ListPeopleArgs {
  userId: string;
  consentToPublish?: ConsentState;
  relation?: string;
  /** Substring search over canonical_name + aliases. */
  q?: string;
  limit?: number;
  offset?: number;
}

export async function listPeople(
  args: ListPeopleArgs,
): Promise<AutobiographerPerson[]> {
  const pool = getAutobiographerPool();
  const params: any[] = [args.userId];
  const where: string[] = ['user_id = $1'];

  if (args.consentToPublish) {
    if (
      !(CONSENT_STATES as readonly string[]).includes(args.consentToPublish)
    ) {
      throw new Error(`Invalid consent_to_publish: ${args.consentToPublish}`);
    }
    params.push(args.consentToPublish);
    where.push(`consent_to_publish = $${params.length}`);
  }
  if (args.relation && args.relation.trim()) {
    params.push(args.relation.trim());
    where.push(`relation = $${params.length}`);
  }
  if (args.q && args.q.trim()) {
    params.push(`%${args.q.trim().toLowerCase()}%`);
    where.push(
      `(lower(canonical_name) LIKE $${params.length} OR EXISTS (
         SELECT 1 FROM unnest(aliases) a WHERE lower(a) LIKE $${params.length}
       ))`,
    );
  }

  const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
  const offset = Math.max(0, args.offset ?? 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${PERSON_COLUMNS}
       FROM agos_autobiographer_people
      WHERE ${where.join(' AND ')}
      ORDER BY lower(canonical_name) ASC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToPerson);
}

/**
 * Workshop-wide people count for a user. Cheap aggregate used by the
 * hub dashboard widgets (Wave C-3b) so the tile reports a true total
 * rather than a list-cap-limited length.
 */
export async function countPeopleForUser(userId: string): Promise<number> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM agos_autobiographer_people
      WHERE user_id = $1`,
    [userId],
  );
  return Number(r.rows[0]?.n ?? 0);
}

export async function getPerson(
  id: string,
  userId: string,
): Promise<AutobiographerPerson | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${PERSON_COLUMNS}
       FROM agos_autobiographer_people
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToPerson(r.rows[0]);
}

export interface PersonWithMemoryCount extends AutobiographerPerson {
  memoryCount: number;
}

/** Like `getPerson` but joins the count of memories mentioning this person. */
export async function getPersonWithCounts(
  id: string,
  userId: string,
): Promise<PersonWithMemoryCount | null> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT ${PERSON_COLUMNS.split(',')
      .map((c) => `p.${c.trim()}`)
      .join(', ')},
            (SELECT COUNT(*)::int
               FROM agos_autobiographer_memory_people mp
              WHERE mp.person_id = p.id) AS memory_count
       FROM agos_autobiographer_people p
      WHERE p.id = $1 AND p.user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  const row = r.rows[0];
  return {
    ...rowToPerson(row),
    memoryCount: Number(row.memory_count ?? 0),
  };
}

export async function createPerson(
  userId: string,
  data: CreatePersonInput,
): Promise<AutobiographerPerson> {
  const pool = getAutobiographerPool();

  const consent: ConsentState = data.consentToPublish ?? 'pending';
  if (!(CONSENT_STATES as readonly string[]).includes(consent)) {
    throw new Error(`Invalid consent_to_publish: ${consent}`);
  }

  const id = randomUUID();
  const aliases = normalizeAliases(data.aliases ?? []);

  try {
    await pool.query(
      `INSERT INTO agos_autobiographer_people
         (id, user_id, canonical_name, aliases, relation,
          birth_year, death_year,
          consent_to_publish, consent_recorded_at, consent_recorded_by,
          notes, image_url, metadata)
       VALUES ($1,$2,$3,$4::text[],$5,
               $6,$7,
               $8,$9,$10,
               $11,$12,$13::jsonb)`,
      [
        id,
        userId,
        data.canonicalName,
        aliases,
        data.relation ?? null,
        data.birthYear ?? null,
        data.deathYear ?? null,
        consent,
        data.consentRecordedAt ?? null,
        data.consentRecordedBy ?? null,
        data.notes ?? null,
        data.imageUrl ?? null,
        JSON.stringify(data.metadata ?? {}),
      ],
    );
  } catch (err: any) {
    if (err?.code === '23505') {
      const dup = new Error('duplicate_name');
      (dup as any).code = 'duplicate_name';
      throw dup;
    }
    throw err;
  }

  const person = await getPerson(id, userId);
  if (!person) throw new Error('Failed to create person');
  return person;
}

export async function updatePerson(
  id: string,
  userId: string,
  patch: UpdatePersonInput,
): Promise<AutobiographerPerson | null> {
  const pool = getAutobiographerPool();

  if (
    patch.consentToPublish !== undefined &&
    !(CONSENT_STATES as readonly string[]).includes(patch.consentToPublish)
  ) {
    throw new Error(`Invalid consent_to_publish: ${patch.consentToPublish}`);
  }

  const aliases = patch.aliases ? normalizeAliases(patch.aliases) : null;

  try {
    await pool.query(
      `UPDATE agos_autobiographer_people
          SET canonical_name      = COALESCE($3,  canonical_name),
              aliases             = COALESCE($4::text[], aliases),
              relation            = COALESCE($5,  relation),
              birth_year          = COALESCE($6,  birth_year),
              death_year          = COALESCE($7,  death_year),
              consent_to_publish  = COALESCE($8,  consent_to_publish),
              consent_recorded_at = COALESCE($9,  consent_recorded_at),
              consent_recorded_by = COALESCE($10, consent_recorded_by),
              notes               = COALESCE($11, notes),
              image_url           = COALESCE($12, image_url),
              metadata            = COALESCE($13::jsonb, metadata),
              updated_at          = now()
        WHERE id = $1 AND user_id = $2`,
      [
        id,
        userId,
        patch.canonicalName ?? null,
        aliases,
        patch.relation ?? null,
        patch.birthYear ?? null,
        patch.deathYear ?? null,
        patch.consentToPublish ?? null,
        patch.consentRecordedAt ?? null,
        patch.consentRecordedBy ?? null,
        patch.notes ?? null,
        patch.imageUrl ?? null,
        patch.metadata ? JSON.stringify(patch.metadata) : null,
      ],
    );
  } catch (err: any) {
    if (err?.code === '23505') {
      const dup = new Error('duplicate_name');
      (dup as any).code = 'duplicate_name';
      throw dup;
    }
    throw err;
  }

  return getPerson(id, userId);
}

/**
 * Record a consent state flip with timestamp + attribution in a single
 * UPDATE so the timestamp is server-side `now()` and the audit row in the
 * route layer matches the DB write.
 */
export async function recordConsent(
  id: string,
  userId: string,
  state: ConsentState,
  recordedBy: string | null,
): Promise<AutobiographerPerson | null> {
  if (!(CONSENT_STATES as readonly string[]).includes(state)) {
    throw new Error(`Invalid consent_to_publish: ${state}`);
  }
  const pool = getAutobiographerPool();
  await pool.query(
    `UPDATE agos_autobiographer_people
        SET consent_to_publish  = $3,
            consent_recorded_at = now(),
            consent_recorded_by = $4,
            updated_at          = now()
      WHERE id = $1 AND user_id = $2`,
    [id, userId, state, recordedBy],
  );
  return getPerson(id, userId);
}

/**
 * Hard-delete. The N:M join `agos_autobiographer_memory_people` CASCADES
 * via the FK, so memory links disappear with the person row.
 */
export async function deletePerson(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `DELETE FROM agos_autobiographer_people WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

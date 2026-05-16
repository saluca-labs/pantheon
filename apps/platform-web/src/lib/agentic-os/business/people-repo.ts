/**
 * Business OS Phase 1 — people DB repository.
 *
 * Cross-ownership contract: every read / write filters by `user_id`
 * directly. A person id belonging to another user returns null on get /
 * update / archive / restore.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getBusinessPool } from './session';
import {
  normalizeTags,
  type Person,
  type CreatePersonInput,
  type UpdatePersonInput,
  type PeopleListOpts,
} from './people';

const PERSON_COLUMNS = `id, user_id, first_name, last_name, email, phone, role,
                        organization_id, stage, tags, notes, description_md,
                        address, metadata, archived_at, created_at, updated_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function toIsoOrNull(v: unknown): string | null {
  if (v == null) return null;
  return toIso(v);
}

interface RawPersonRow {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  organization_id: string | null;
  stage: string | null;
  tags: string[] | null;
  notes: string | null;
  description_md: string | null;
  address: string | null;
  metadata: Record<string, unknown> | null;
  archived_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function rowToPerson(row: RawPersonRow): Person {
  return {
    id: row.id,
    userId: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    role: row.role ?? null,
    organizationId: row.organization_id ?? null,
    stage: row.stage ?? 'lead',
    tags: Array.isArray(row.tags) ? row.tags : [],
    notes: row.notes ?? null,
    descriptionMd: row.description_md ?? '',
    address: row.address ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    archivedAt: toIsoOrNull(row.archived_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── List ─────────────────────────────────────────────────────────────────

export async function listPeople(
  userId: string,
  opts: PeopleListOpts = {},
): Promise<Person[]> {
  const pool = getBusinessPool();
  const params: unknown[] =[userId];
  const where: string[] = [`user_id = $1`];

  if (opts.archived === true) {
    where.push(`archived_at IS NOT NULL`);
  } else {
    where.push(`archived_at IS NULL`);
  }

  if (opts.organizationId) {
    params.push(opts.organizationId);
    where.push(`organization_id = $${params.length}`);
  }

  if (opts.tag && opts.tag.trim()) {
    params.push(opts.tag.trim().toLowerCase());
    where.push(`$${params.length} = ANY(tags)`);
  }

  if (opts.q && opts.q.trim()) {
    params.push(`%${opts.q.trim().toLowerCase()}%`);
    where.push(
      `(LOWER(first_name) LIKE $${params.length}
        OR LOWER(last_name) LIKE $${params.length}
        OR LOWER(COALESCE(email, '')) LIKE $${params.length}
        OR LOWER(COALESCE(role, '')) LIKE $${params.length}
        OR LOWER(COALESCE(notes, '')) LIKE $${params.length})`,
    );
  }

  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${PERSON_COLUMNS}
       FROM agos_business_people
      WHERE ${where.join(' AND ')}
      ORDER BY last_name ASC, first_name ASC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToPerson);
}

// ─── Get one ─────────────────────────────────────────────────────────────

export async function getPerson(id: string, userId: string): Promise<Person | null> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT ${PERSON_COLUMNS}
       FROM agos_business_people
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToPerson(r.rows[0]);
}

// ─── Create ──────────────────────────────────────────────────────────────

export async function createPerson(
  userId: string,
  data: CreatePersonInput,
): Promise<Person> {
  const pool = getBusinessPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_business_people
       (id, user_id, first_name, last_name, email, phone, role,
        organization_id, stage, tags, notes, description_md, address, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text[],$11,$12,$13,$14::jsonb)`,
    [
      id,
      userId,
      data.firstName,
      data.lastName,
      data.email ?? null,
      data.phone ?? null,
      data.role ?? null,
      data.organizationId ?? null,
      data.stage ?? 'lead',
      normalizeTags(data.tags ?? []),
      data.notes ?? null,
      data.descriptionMd ?? '',
      data.address ?? null,
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const after = await getPerson(id, userId);
  if (!after) throw new Error('Failed to create person');
  return after;
}

// ─── Update ──────────────────────────────────────────────────────────────

export type UpdatePersonOutcome =
  | { kind: 'ok'; person: Person }
  | { kind: 'not_found' };

export async function updatePerson(
  id: string,
  userId: string,
  patch: UpdatePersonInput,
): Promise<UpdatePersonOutcome> {
  const pool = getBusinessPool();
  const set: string[] = [];
  const params: unknown[] =[id, userId];
  let n = 2;

  if (patch.firstName !== undefined) {
    params.push(patch.firstName);
    n += 1;
    set.push(`first_name = $${n}`);
  }
  if (patch.lastName !== undefined) {
    params.push(patch.lastName);
    n += 1;
    set.push(`last_name = $${n}`);
  }
  if (patch.email !== undefined) {
    params.push(patch.email);
    n += 1;
    set.push(`email = $${n}`);
  }
  if (patch.phone !== undefined) {
    params.push(patch.phone);
    n += 1;
    set.push(`phone = $${n}`);
  }
  if (patch.role !== undefined) {
    params.push(patch.role);
    n += 1;
    set.push(`role = $${n}`);
  }
  if (patch.organizationId !== undefined) {
    params.push(patch.organizationId);
    n += 1;
    set.push(`organization_id = $${n}`);
  }
  if (patch.stage !== undefined) {
    params.push(patch.stage);
    n += 1;
    set.push(`stage = $${n}`);
  }
  if (patch.tags !== undefined) {
    params.push(normalizeTags(patch.tags));
    n += 1;
    set.push(`tags = $${n}::text[]`);
  }
  if (patch.notes !== undefined) {
    params.push(patch.notes);
    n += 1;
    set.push(`notes = $${n}`);
  }
  if (patch.descriptionMd !== undefined) {
    params.push(patch.descriptionMd);
    n += 1;
    set.push(`description_md = $${n}`);
  }
  if (patch.address !== undefined) {
    params.push(patch.address);
    n += 1;
    set.push(`address = $${n}`);
  }
  if (patch.metadata !== undefined) {
    params.push(JSON.stringify(patch.metadata));
    n += 1;
    set.push(`metadata = $${n}::jsonb`);
  }

  if (set.length === 0) {
    const current = await getPerson(id, userId);
    return current ? { kind: 'ok', person: current } : { kind: 'not_found' };
  }

  set.push(`updated_at = now()`);

  const r = await pool.query(
    `UPDATE agos_business_people
        SET ${set.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    params,
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };
  const after = await getPerson(id, userId);
  if (!after) return { kind: 'not_found' };
  return { kind: 'ok', person: after };
}

// ─── Archive / restore ──────────────────────────────────────────────────

export async function archivePerson(
  id: string,
  userId: string,
): Promise<Person | null> {
  const pool = getBusinessPool();
  await pool.query(
    `UPDATE agos_business_people
        SET archived_at = now(),
            updated_at  = now()
      WHERE id = $1 AND user_id = $2
        AND archived_at IS NULL`,
    [id, userId],
  );
  return getPerson(id, userId);
}

export async function restorePerson(
  id: string,
  userId: string,
): Promise<
  | { person: Person; alreadyActive: false }
  | { person: Person; alreadyActive: true }
  | null
> {
  const before = await getPerson(id, userId);
  if (!before) return null;
  if (before.archivedAt == null) {
    return { person: before, alreadyActive: true };
  }
  const pool = getBusinessPool();
  await pool.query(
    `UPDATE agos_business_people
        SET archived_at = NULL,
            updated_at  = now()
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  const after = await getPerson(id, userId);
  if (!after) return null;
  return { person: after, alreadyActive: false };
}

// ─── Count active people (for hub) ──────────────────────────────────────

export async function countActivePeople(userId: string): Promise<number> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM agos_business_people
      WHERE user_id = $1
        AND archived_at IS NULL`,
    [userId],
  );
  return Number(r.rows[0]?.n ?? 0);
}

export async function countActiveOrganizations(userId: string): Promise<number> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM agos_business_orgs
      WHERE user_id = $1
        AND archived_at IS NULL`,
    [userId],
  );
  return Number(r.rows[0]?.n ?? 0);
}

/**
 * Business OS Phase 1 — orgs DB repository.
 *
 * Every read / write filters by `user_id` directly (workshop-global per
 * the per-OS UUID contract — no JOINs required).  An org id belonging to
 * another user returns null on get / update / archive / restore.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getBusinessPool } from './session';
import {
  ORG_TYPES,
  normalizeTags,
  type OrgType,
  type Organization,
  type CreateOrgInput,
  type UpdateOrgInput,
  type OrgsListOpts,
} from './orgs';

const ORG_COLUMNS = `id, user_id, name, org_type, website, industry, notes,
                     description_md, address, tags, metadata, archived_at,
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

function rowToOrg(row: any): Organization {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    orgType: row.org_type as OrgType,
    website: row.website ?? null,
    industry: row.industry ?? null,
    notes: row.notes ?? null,
    descriptionMd: row.description_md ?? '',
    address: row.address ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    archivedAt: toIsoOrNull(row.archived_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── List ─────────────────────────────────────────────────────────────────

export async function listOrganizations(
  userId: string,
  opts: OrgsListOpts = {},
): Promise<Organization[]> {
  const pool = getBusinessPool();
  const params: any[] = [userId];
  const where: string[] = [`user_id = $1`];

  if (opts.archived === true) {
    where.push(`archived_at IS NOT NULL`);
  } else {
    where.push(`archived_at IS NULL`);
  }

  if (opts.orgType) {
    if (!(ORG_TYPES as readonly string[]).includes(opts.orgType)) {
      throw new Error(`Invalid org_type filter: ${opts.orgType}`);
    }
    params.push(opts.orgType);
    where.push(`org_type = $${params.length}`);
  }

  if (opts.industry && opts.industry.trim()) {
    params.push(opts.industry.trim().toLowerCase());
    where.push(`LOWER(COALESCE(industry, '')) = $${params.length}`);
  }

  if (opts.tag && opts.tag.trim()) {
    params.push(opts.tag.trim().toLowerCase());
    where.push(`$${params.length} = ANY(tags)`);
  }

  if (opts.q && opts.q.trim()) {
    params.push(`%${opts.q.trim().toLowerCase()}%`);
    where.push(
      `(LOWER(name) LIKE $${params.length}
        OR LOWER(COALESCE(industry, '')) LIKE $${params.length}
        OR LOWER(COALESCE(notes, '')) LIKE $${params.length})`,
    );
  }

  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${ORG_COLUMNS}
       FROM agos_business_orgs
      WHERE ${where.join(' AND ')}
      ORDER BY name ASC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToOrg);
}

// ─── Get one ─────────────────────────────────────────────────────────────

export async function getOrganization(
  id: string,
  userId: string,
): Promise<Organization | null> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT ${ORG_COLUMNS}
       FROM agos_business_orgs
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToOrg(r.rows[0]);
}

// ─── Create ──────────────────────────────────────────────────────────────

export async function createOrganization(
  userId: string,
  data: CreateOrgInput,
): Promise<Organization> {
  const pool = getBusinessPool();
  const id = randomUUID();
  const orgType: OrgType = data.orgType ?? 'company';
  if (!(ORG_TYPES as readonly string[]).includes(orgType)) {
    throw new Error(`Invalid org_type: ${orgType}`);
  }
  await pool.query(
    `INSERT INTO agos_business_orgs
       (id, user_id, name, org_type, website, industry, notes,
        description_md, address, tags, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text[],$11::jsonb)`,
    [
      id,
      userId,
      data.name,
      orgType,
      data.website ?? null,
      data.industry ?? null,
      data.notes ?? null,
      data.descriptionMd ?? '',
      data.address ?? null,
      normalizeTags(data.tags ?? []),
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const after = await getOrganization(id, userId);
  if (!after) throw new Error('Failed to create organization');
  return after;
}

// ─── Update ──────────────────────────────────────────────────────────────

export type UpdateOrgOutcome =
  | { kind: 'ok'; org: Organization }
  | { kind: 'not_found' };

export async function updateOrganization(
  id: string,
  userId: string,
  patch: UpdateOrgInput,
): Promise<UpdateOrgOutcome> {
  const pool = getBusinessPool();
  if (patch.orgType !== undefined && !(ORG_TYPES as readonly string[]).includes(patch.orgType)) {
    throw new Error(`Invalid org_type: ${patch.orgType}`);
  }
  const set: string[] = [];
  const params: any[] = [id, userId];
  let n = 2;

  if (patch.name !== undefined) {
    params.push(patch.name);
    n += 1;
    set.push(`name = $${n}`);
  }
  if (patch.orgType !== undefined) {
    params.push(patch.orgType);
    n += 1;
    set.push(`org_type = $${n}`);
  }
  if (patch.website !== undefined) {
    params.push(patch.website);
    n += 1;
    set.push(`website = $${n}`);
  }
  if (patch.industry !== undefined) {
    params.push(patch.industry);
    n += 1;
    set.push(`industry = $${n}`);
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
  if (patch.tags !== undefined) {
    params.push(normalizeTags(patch.tags));
    n += 1;
    set.push(`tags = $${n}::text[]`);
  }
  if (patch.metadata !== undefined) {
    params.push(JSON.stringify(patch.metadata));
    n += 1;
    set.push(`metadata = $${n}::jsonb`);
  }

  if (set.length === 0) {
    // Nothing to update — return the current row (or not_found).
    const current = await getOrganization(id, userId);
    return current ? { kind: 'ok', org: current } : { kind: 'not_found' };
  }

  set.push(`updated_at = now()`);

  const r = await pool.query(
    `UPDATE agos_business_orgs
        SET ${set.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    params,
  );
  if ((r.rowCount ?? 0) === 0) {
    return { kind: 'not_found' };
  }
  const after = await getOrganization(id, userId);
  if (!after) return { kind: 'not_found' };
  return { kind: 'ok', org: after };
}

// ─── Archive / restore ──────────────────────────────────────────────────

export async function archiveOrganization(
  id: string,
  userId: string,
): Promise<Organization | null> {
  const pool = getBusinessPool();
  await pool.query(
    `UPDATE agos_business_orgs
        SET archived_at = now(),
            updated_at  = now()
      WHERE id = $1 AND user_id = $2
        AND archived_at IS NULL`,
    [id, userId],
  );
  return getOrganization(id, userId);
}

export async function restoreOrganization(
  id: string,
  userId: string,
): Promise<
  | { org: Organization; alreadyActive: false }
  | { org: Organization; alreadyActive: true }
  | null
> {
  const before = await getOrganization(id, userId);
  if (!before) return null;
  if (before.archivedAt == null) {
    return { org: before, alreadyActive: true };
  }
  const pool = getBusinessPool();
  await pool.query(
    `UPDATE agos_business_orgs
        SET archived_at = NULL,
            updated_at  = now()
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  const after = await getOrganization(id, userId);
  if (!after) return null;
  return { org: after, alreadyActive: false };
}

// ─── People in this org count (for the detail page) ─────────────────────

export async function countActivePeopleForOrganization(
  orgId: string,
  userId: string,
): Promise<number> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM agos_business_people
      WHERE user_id = $1
        AND organization_id = $2
        AND archived_at IS NULL`,
    [userId, orgId],
  );
  return Number(r.rows[0]?.n ?? 0);
}

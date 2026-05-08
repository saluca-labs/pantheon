/**
 * Business OS — database CRUD for CRM entities.
 *
 * All queries target the `agos_business_*` tables added in migration
 * 0010_business_os.py.
 *
 * @license MIT — original work for Tiresias platform
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { getBusinessPool } from './session';
import type { Person, Organization, Interaction, OrgType, ContactStage, InteractionType } from './crm';

// ─── Organizations ───────────────────────────────────────────────────────────

export async function listOrganizations(userId: string): Promise<Organization[]> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT id, user_id, name, org_type, website, industry, notes, created_at, updated_at
       FROM agos_business_orgs
      WHERE user_id = $1
      ORDER BY name ASC`,
    [userId],
  );
  return r.rows.map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    orgType: row.org_type as OrgType,
    website: row.website,
    industry: row.industry,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}

export async function createOrganization(userId: string, data: {
  name: string;
  orgType?: OrgType;
  website?: string | null;
  industry?: string | null;
  notes?: string | null;
}): Promise<Organization> {
  const pool = getBusinessPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_business_orgs (id, user_id, name, org_type, website, industry, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, userId, data.name, data.orgType ?? 'company', data.website ?? null, data.industry ?? null, data.notes ?? null],
  );
  const r = await pool.query(
    `SELECT id, user_id, name, org_type, website, industry, notes, created_at, updated_at
       FROM agos_business_orgs WHERE id = $1`,
    [id],
  );
  const row = r.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    orgType: row.org_type as OrgType,
    website: row.website,
    industry: row.industry,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// ─── People ──────────────────────────────────────────────────────────────────

export async function listPeople(userId: string): Promise<Person[]> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT id, user_id, first_name, last_name, email, phone, role,
            organization_id, stage, tags, notes, created_at, updated_at
       FROM agos_business_people
      WHERE user_id = $1
      ORDER BY last_name ASC, first_name ASC`,
    [userId],
  );
  return r.rows.map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    organizationId: row.organization_id,
    stage: row.stage as ContactStage,
    tags: row.tags ?? [],
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}

export interface PersonCreate {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  organizationId?: string | null;
  stage?: ContactStage;
  tags?: string[];
  notes?: string | null;
}

export async function createPerson(userId: string, data: PersonCreate): Promise<Person> {
  const pool = getBusinessPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_business_people
       (id, user_id, first_name, last_name, email, phone, role, organization_id, stage, tags, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
    [
      id, userId,
      data.firstName, data.lastName,
      data.email ?? null, data.phone ?? null, data.role ?? null,
      data.organizationId ?? null, data.stage ?? 'lead',
      JSON.stringify(data.tags ?? []),
      data.notes ?? null,
    ],
  );
  const r = await pool.query(
    `SELECT id, user_id, first_name, last_name, email, phone, role,
            organization_id, stage, tags, notes, created_at, updated_at
       FROM agos_business_people WHERE id = $1`,
    [id],
  );
  const row = r.rows[0];
  return {
    id: row.id, userId: row.user_id,
    firstName: row.first_name, lastName: row.last_name,
    email: row.email, phone: row.phone, role: row.role,
    organizationId: row.organization_id, stage: row.stage as ContactStage,
    tags: row.tags ?? [], notes: row.notes,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
}

// ─── Interactions ─────────────────────────────────────────────────────────────

export async function listInteractions(userId: string, personId?: string): Promise<Interaction[]> {
  const pool = getBusinessPool();
  const where = personId ? 'WHERE user_id = $1 AND person_id = $2' : 'WHERE user_id = $1';
  const params = personId ? [userId, personId] : [userId];
  const r = await pool.query(
    `SELECT id, user_id, person_id, organization_id, interaction_type,
            summary, occurred_at, created_at
       FROM agos_business_interactions
      ${where}
      ORDER BY occurred_at DESC
      LIMIT 50`,
    params,
  );
  return r.rows.map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    personId: row.person_id,
    organizationId: row.organization_id,
    interactionType: row.interaction_type as InteractionType,
    summary: row.summary,
    occurredAt: row.occurred_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  }));
}

export async function createInteraction(data: {
  userId: string;
  personId?: string | null;
  organizationId?: string | null;
  interactionType: InteractionType;
  summary: string;
  occurredAt?: string;
}): Promise<Interaction> {
  const pool = getBusinessPool();
  const id = randomUUID();
  const occurredAt = data.occurredAt ?? new Date().toISOString();
  await pool.query(
    `INSERT INTO agos_business_interactions
       (id, user_id, person_id, organization_id, interaction_type, summary, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, data.userId, data.personId ?? null, data.organizationId ?? null, data.interactionType, data.summary, occurredAt],
  );
  return {
    id, userId: data.userId,
    personId: data.personId ?? null,
    organizationId: data.organizationId ?? null,
    interactionType: data.interactionType,
    summary: data.summary,
    occurredAt,
    createdAt: new Date().toISOString(),
  };
}

// ─── Audit ──────────────────────────────────────────────────────────────────

export async function recordAudit(args: {
  actorId: string;
  action: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const pool = getBusinessPool();
  await pool.query(
    `INSERT INTO agos_audit (id, actor_id, os_slug, action, payload)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [randomUUID(), args.actorId, 'business', args.action, JSON.stringify(args.payload ?? {})],
  );
}

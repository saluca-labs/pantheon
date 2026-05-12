/**
 * Business OS — Contacts CRM domain logic.
 *
 * Phase 1 extension: every entity carries an `archived_at` field for the
 * soft-archive lifecycle.  The legacy stage / interaction-type / org-type
 * constant sets stay as-is and are now also enforced by CHECK constraints
 * at the DB layer (org_type + interaction_type; stage stays free-form).
 *
 * @license MIT — original work for Tiresias Business OS.
 * @see https://www.hubspot.com/crm (HubSpot CRM — stage reference)
 * @see https://www.salesforce.com/crm/what-is-crm/ (Salesforce CRM terminology)
 */

export const ORG_TYPES = [
  'company',
  'non_profit',
  'government',
  'sole_trader',
  'partnership',
  'other',
] as const;

export type OrgType = (typeof ORG_TYPES)[number];

export const INTERACTION_TYPES = [
  'call',
  'email',
  'meeting',
  'demo',
  'proposal',
  'follow_up',
  'note',
  'linkedin',
  'other',
] as const;

export type InteractionType = (typeof INTERACTION_TYPES)[number];

/**
 * Legacy 7-value stage taxonomy.  Preserved for back-compat and as the
 * default dropdown set in the UI, but the DB column is NOT CHECK-
 * constrained per the Phase-1 locked decision — Phase 2's
 * `agos_business_deals` owns the canonical sales-pipeline stage and this
 * column degrades to a free-form contact tier ("active", "VIP",
 * "cold", ...).
 */
export const CONTACT_STAGES = [
  'lead',
  'qualified',
  'proposal',
  'negotiation',
  'won',
  'lost',
  'inactive',
] as const;

export type ContactStage = (typeof CONTACT_STAGES)[number];

/**
 * A Phase-1 person row.  `tags`, `address`, `descriptionMd`, `archivedAt`,
 * and `metadata` are net-new vs the migration-0010 shape.  `stage` is
 * `string` (not `ContactStage`) because the DB column is free-form per
 * the locked Phase-1 decision.
 */
export interface Person {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  organizationId: string | null;
  /** Free-form contact tier; see {@link CONTACT_STAGES} for legacy values. */
  stage: string;
  tags: string[];
  notes: string | null;
  descriptionMd: string;
  address: string | null;
  metadata: Record<string, unknown>;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  userId: string;
  name: string;
  orgType: OrgType;
  website: string | null;
  industry: string | null;
  notes: string | null;
  descriptionMd: string;
  address: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Interaction {
  id: string;
  userId: string;
  personId: string | null;
  organizationId: string | null;
  interactionType: InteractionType;
  summary: string;
  occurredAt: string;
  createdAt: string;
}

/**
 * Validate a Person record before persisting.  Returns an array of
 * human-readable error strings (empty = valid).
 *
 * NOTE — the validator stays strict on `stage` for back-compat with the
 * existing crm.test.ts contract, even though the DB column is free-form
 * per the Phase-1 locked decision.  Library callers should pass one of
 * the seven legacy stages; routes accepting arbitrary tiers must
 * validate independently.
 */
export function validatePerson(
  data: Partial<Pick<Person, 'firstName' | 'lastName' | 'email' | 'stage'>>,
): string[] {
  const errors: string[] = [];
  if (!data.firstName || data.firstName.trim() === '') {
    errors.push('First name is required.');
  }
  if (!data.lastName || data.lastName.trim() === '') {
    errors.push('Last name is required.');
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('Email address format is invalid.');
  }
  if (
    data.stage !== undefined &&
    data.stage !== null &&
    !(CONTACT_STAGES as readonly string[]).includes(data.stage)
  ) {
    errors.push(`Stage "${data.stage}" is not valid.`);
  }
  return errors;
}

/**
 * Format a contact's full name.
 */
export function fullName(person: Pick<Person, 'firstName' | 'lastName'>): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

/**
 * Normalize a tag list — trim, lower-case, drop empties, dedupe, cap
 * length.  Used by the people + orgs repos before INSERT / UPDATE so
 * the DB GIN index works deterministically.
 */
export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const cleaned = raw.trim().toLowerCase();
    if (!cleaned) continue;
    if (cleaned.length > 60) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

/**
 * Type guard for {@link OrgType}.  Used by the orgs route when accepting
 * `?org_type=` filter query strings.
 */
export function asOrgType(value: unknown): OrgType | null {
  if (typeof value !== 'string') return null;
  return (ORG_TYPES as readonly string[]).includes(value) ? (value as OrgType) : null;
}

/**
 * Type guard for {@link InteractionType}.
 */
export function asInteractionType(value: unknown): InteractionType | null {
  if (typeof value !== 'string') return null;
  return (INTERACTION_TYPES as readonly string[]).includes(value)
    ? (value as InteractionType)
    : null;
}

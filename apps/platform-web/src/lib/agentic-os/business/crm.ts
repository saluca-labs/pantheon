/**
 * Business OS — Contacts CRM domain logic.
 *
 * The CRM consists of three interconnected entities:
 *   - Person       — an individual contact
 *   - Organization — a company or group
 *   - Interaction  — a logged touchpoint (call, email, meeting, note)
 *
 * Interaction type taxonomy follows standard B2B sales-process stages common
 * in CRM software (Salesforce, HubSpot, Pipedrive). No proprietary data is
 * used — the taxonomy is publicly documented industry practice.
 *
 * @license MIT — original work for Tiresias platform
 * @see https://www.hubspot.com/crm (HubSpot CRM — interaction type reference)
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

export interface Person {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  organizationId: string | null;
  stage: ContactStage;
  tags: string[];
  notes: string | null;
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
 * Validate a Person record before persisting.
 * Returns an array of human-readable error strings (empty = valid).
 */
export function validatePerson(data: Partial<Pick<Person, 'firstName' | 'lastName' | 'email' | 'stage'>>): string[] {
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
  if (data.stage && !(CONTACT_STAGES as readonly string[]).includes(data.stage)) {
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

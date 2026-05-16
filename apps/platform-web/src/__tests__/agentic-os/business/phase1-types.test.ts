/**
 * Business OS Phase 1 — pure-helper test suite.
 *
 * Exercises the type guards, validators, filter predicates, and tag
 * normalization across crm.ts / orgs.ts / people.ts / interactions.ts /
 * settings.ts.  No DB; no React.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  ORG_TYPES,
  INTERACTION_TYPES,
  CONTACT_STAGES,
  asOrgType,
  asInteractionType,
  normalizeTags,
  fullName,
  validatePerson,
} from '@/lib/agentic-os/business/crm';
import {
  orgMatchesFilter,
  validateOrgName,
  validateOrgType,
  validateOrgWebsite,
} from '@/lib/agentic-os/business/orgs';
import {
  personMatchesFilter,
  validatePersonName,
  validatePersonEmail,
  validatePersonPhone,
} from '@/lib/agentic-os/business/people';
import {
  interactionMatchesFilter,
  validateInteractionType,
  validateInteractionSummary,
} from '@/lib/agentic-os/business/interactions';
import {
  ACCENT_COLORS,
  COMMON_CURRENCIES,
  PAYMENT_TERMS,
  defaultSettings,
  validateBusinessName,
  validateCurrency,
  validateLogoUrl,
  validateHourlyRateCents,
  validateAccentColor,
} from '@/lib/agentic-os/business/settings';

// ─── Constant taxonomies ────────────────────────────────────────────────

describe('ORG_TYPES taxonomy', () => {
  it('has exactly 6 canonical values', () => {
    expect(ORG_TYPES).toHaveLength(6);
  });
  it('includes the documented values', () => {
    for (const v of ['company', 'non_profit', 'government', 'sole_trader', 'partnership', 'other']) {
      expect(ORG_TYPES).toContain(v);
    }
  });
});

describe('INTERACTION_TYPES taxonomy', () => {
  it('has exactly 9 canonical values', () => {
    expect(INTERACTION_TYPES).toHaveLength(9);
  });
  it('includes the documented values', () => {
    for (const v of [
      'call', 'email', 'meeting', 'demo', 'proposal',
      'follow_up', 'note', 'linkedin', 'other',
    ]) {
      expect(INTERACTION_TYPES).toContain(v);
    }
  });
});

describe('CONTACT_STAGES taxonomy', () => {
  it('keeps the legacy 7-value taxonomy as the dropdown default set', () => {
    expect(CONTACT_STAGES).toHaveLength(7);
    expect(CONTACT_STAGES).toContain('lead');
    expect(CONTACT_STAGES).toContain('won');
    expect(CONTACT_STAGES).toContain('lost');
    expect(CONTACT_STAGES).toContain('inactive');
  });
});

// ─── Type guards ────────────────────────────────────────────────────────

describe('asOrgType', () => {
  it('returns the value when valid', () => {
    expect(asOrgType('company')).toBe('company');
    expect(asOrgType('non_profit')).toBe('non_profit');
  });
  it('returns null on unknown values', () => {
    expect(asOrgType('startup')).toBeNull();
    expect(asOrgType('')).toBeNull();
  });
  it('returns null on non-string', () => {
    expect(asOrgType(null)).toBeNull();
    expect(asOrgType(undefined)).toBeNull();
    expect(asOrgType(42)).toBeNull();
  });
});

describe('asInteractionType', () => {
  it('returns the value when valid', () => {
    expect(asInteractionType('call')).toBe('call');
    expect(asInteractionType('linkedin')).toBe('linkedin');
  });
  it('returns null on unknown values', () => {
    expect(asInteractionType('phonecall')).toBeNull();
  });
});

// ─── normalizeTags ──────────────────────────────────────────────────────

describe('normalizeTags', () => {
  it('trims whitespace and lowercases', () => {
    expect(normalizeTags(['  FOO ', 'Bar'])).toEqual(['foo', 'bar']);
  });
  it('drops empty strings', () => {
    expect(normalizeTags(['', '   ', 'x'])).toEqual(['x']);
  });
  it('dedupes (case-insensitive)', () => {
    expect(normalizeTags(['Foo', 'FOO', 'foo'])).toEqual(['foo']);
  });
  it('caps individual tag length at 60 chars', () => {
    const long = 'a'.repeat(61);
    expect(normalizeTags([long, 'ok'])).toEqual(['ok']);
  });
  it('returns [] on non-array', () => {
    expect(normalizeTags(null)).toEqual([]);
    expect(normalizeTags('foo')).toEqual([]);
    expect(normalizeTags(42)).toEqual([]);
  });
  it('skips non-string entries', () => {
    expect(normalizeTags(['foo', 42 as never, null as never, 'bar'])).toEqual(['foo', 'bar']);
  });
});

// ─── validatePerson (legacy contract preserved) ─────────────────────────

describe('validatePerson', () => {
  it('passes for a fully-valid record', () => {
    expect(validatePerson({
      firstName: 'Jane', lastName: 'Smith', email: 'j@x.com', stage: 'lead',
    })).toEqual([]);
  });
  it('flags missing firstName', () => {
    expect(validatePerson({ firstName: '', lastName: 'S' }).some((e) => /First name/i.test(e))).toBe(true);
  });
  it('flags missing lastName', () => {
    expect(validatePerson({ firstName: 'J', lastName: '' }).some((e) => /Last name/i.test(e))).toBe(true);
  });
  it('flags bad email', () => {
    expect(validatePerson({ firstName: 'J', lastName: 'S', email: 'nope' }).some((e) => /Email/i.test(e))).toBe(true);
  });
  it('allows null/undefined email', () => {
    expect(validatePerson({ firstName: 'J', lastName: 'S', email: undefined }).filter((e) => /Email/i.test(e))).toEqual([]);
  });
  it('flags a stage outside the legacy taxonomy', () => {
    expect(validatePerson({ firstName: 'J', lastName: 'S', stage: 'prospect' as never }).some((e) => /Stage/i.test(e))).toBe(true);
  });
});

// ─── fullName ───────────────────────────────────────────────────────────

describe('fullName', () => {
  it('joins first and last', () => {
    expect(fullName({ firstName: 'Jane', lastName: 'Smith' })).toBe('Jane Smith');
  });
});

// ─── orgs validators ────────────────────────────────────────────────────

describe('validateOrgName', () => {
  it('passes a normal name', () => {
    expect(validateOrgName('Acme')).toBeNull();
  });
  it('flags non-string', () => {
    expect(validateOrgName(null)).toMatch(/string/);
  });
  it('flags empty', () => {
    expect(validateOrgName('   ')).toMatch(/empty/);
  });
  it('flags too long', () => {
    expect(validateOrgName('x'.repeat(201))).toMatch(/too long/);
  });
});

describe('validateOrgType', () => {
  it('passes a known type', () => {
    expect(validateOrgType('company')).toBeNull();
  });
  it('passes null/undefined', () => {
    expect(validateOrgType(null)).toBeNull();
    expect(validateOrgType(undefined)).toBeNull();
  });
  it('flags unknown', () => {
    expect(validateOrgType('startup')).toMatch(/must be one of/);
  });
});

describe('validateOrgWebsite', () => {
  it('passes a https URL', () => {
    expect(validateOrgWebsite('https://acme.com')).toBeNull();
  });
  it('passes a http URL', () => {
    expect(validateOrgWebsite('http://acme.com')).toBeNull();
  });
  it('passes null', () => {
    expect(validateOrgWebsite(null)).toBeNull();
  });
  it('flags missing scheme', () => {
    expect(validateOrgWebsite('acme.com')).toMatch(/URL/);
  });
});

// ─── orgMatchesFilter ───────────────────────────────────────────────────

const baseOrg = {
  orgType: 'company' as const,
  industry: 'saas',
  tags: ['enterprise', 'usa'],
  archivedAt: null,
  name: 'Acme',
  notes: 'a good account',
};

describe('orgMatchesFilter', () => {
  it('matches when no opts are given', () => {
    expect(orgMatchesFilter(baseOrg, {})).toBe(true);
  });
  it('hides archived by default', () => {
    expect(orgMatchesFilter({ ...baseOrg, archivedAt: '2024-01-01' }, {})).toBe(false);
  });
  it('shows archived when archived=true', () => {
    expect(orgMatchesFilter({ ...baseOrg, archivedAt: '2024-01-01' }, { archived: true })).toBe(true);
  });
  it('filters by orgType', () => {
    expect(orgMatchesFilter(baseOrg, { orgType: 'non_profit' })).toBe(false);
    expect(orgMatchesFilter(baseOrg, { orgType: 'company' })).toBe(true);
  });
  it('filters by industry (case-insensitive)', () => {
    expect(orgMatchesFilter(baseOrg, { industry: 'SAAS' })).toBe(true);
    expect(orgMatchesFilter(baseOrg, { industry: 'fintech' })).toBe(false);
  });
  it('filters by tag (case-insensitive)', () => {
    expect(orgMatchesFilter(baseOrg, { tag: 'Enterprise' })).toBe(true);
    expect(orgMatchesFilter(baseOrg, { tag: 'smb' })).toBe(false);
  });
  it('filters by q across name+industry+notes', () => {
    expect(orgMatchesFilter(baseOrg, { q: 'ACME' })).toBe(true);
    expect(orgMatchesFilter(baseOrg, { q: 'good' })).toBe(true);
    expect(orgMatchesFilter(baseOrg, { q: 'missing' })).toBe(false);
  });
});

// ─── people validators ──────────────────────────────────────────────────

describe('validatePersonName', () => {
  it('passes a normal name', () => {
    expect(validatePersonName('Jane')).toBeNull();
  });
  it('flags empty', () => {
    expect(validatePersonName('  ')).toMatch(/empty/);
  });
  it('flags too long', () => {
    expect(validatePersonName('x'.repeat(101))).toMatch(/too long/);
  });
});

describe('validatePersonEmail', () => {
  it('passes a real-looking email', () => {
    expect(validatePersonEmail('jane@example.com')).toBeNull();
  });
  it('passes null', () => {
    expect(validatePersonEmail(null)).toBeNull();
  });
  it('flags malformed', () => {
    expect(validatePersonEmail('jane@@')).toMatch(/email/i);
  });
});

describe('validatePersonPhone', () => {
  it('passes a normal phone', () => {
    expect(validatePersonPhone('+1 555-0123')).toBeNull();
  });
  it('flags too long', () => {
    expect(validatePersonPhone('x'.repeat(31))).toMatch(/too long/);
  });
});

// ─── personMatchesFilter ────────────────────────────────────────────────

const basePerson = {
  tags: ['warm'],
  archivedAt: null,
  organizationId: 'org-1',
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'jane@acme.com',
  role: 'CTO',
  notes: 'introduced at Strange Loop',
};

describe('personMatchesFilter', () => {
  it('matches when no opts are given', () => {
    expect(personMatchesFilter(basePerson, {})).toBe(true);
  });
  it('hides archived by default', () => {
    expect(personMatchesFilter({ ...basePerson, archivedAt: '2024-01-01' }, {})).toBe(false);
  });
  it('shows archived when archived=true', () => {
    expect(personMatchesFilter({ ...basePerson, archivedAt: '2024-01-01' }, { archived: true })).toBe(true);
  });
  it('filters by organizationId', () => {
    expect(personMatchesFilter(basePerson, { organizationId: 'org-2' })).toBe(false);
    expect(personMatchesFilter(basePerson, { organizationId: 'org-1' })).toBe(true);
  });
  it('filters by tag (case-insensitive)', () => {
    expect(personMatchesFilter(basePerson, { tag: 'WARM' })).toBe(true);
    expect(personMatchesFilter(basePerson, { tag: 'cold' })).toBe(false);
  });
  it('q across name+email+role+notes', () => {
    expect(personMatchesFilter(basePerson, { q: 'jane' })).toBe(true);
    expect(personMatchesFilter(basePerson, { q: 'CTO' })).toBe(true);
    expect(personMatchesFilter(basePerson, { q: 'Strange' })).toBe(true);
    expect(personMatchesFilter(basePerson, { q: 'nope' })).toBe(false);
  });
});

// ─── interaction validators ─────────────────────────────────────────────

describe('validateInteractionType', () => {
  it('passes a canonical value', () => {
    expect(validateInteractionType('call')).toBeNull();
  });
  it('flags unknown', () => {
    expect(validateInteractionType('phonecall')).toMatch(/must be one of/);
  });
});

describe('validateInteractionSummary', () => {
  it('passes', () => {
    expect(validateInteractionSummary('quick chat')).toBeNull();
  });
  it('flags empty', () => {
    expect(validateInteractionSummary('   ')).toMatch(/empty/);
  });
  it('flags too long', () => {
    expect(validateInteractionSummary('x'.repeat(2001))).toMatch(/too long/);
  });
});

const baseInteraction = {
  personId: 'p-1' as string | null,
  organizationId: 'org-1' as string | null,
  interactionType: 'call' as const,
  occurredAt: '2026-05-01T10:00:00Z',
};

describe('interactionMatchesFilter', () => {
  it('matches when no opts', () => {
    expect(interactionMatchesFilter(baseInteraction, {})).toBe(true);
  });
  it('filters by personId', () => {
    expect(interactionMatchesFilter(baseInteraction, { personId: 'p-2' })).toBe(false);
    expect(interactionMatchesFilter(baseInteraction, { personId: 'p-1' })).toBe(true);
  });
  it('filters by interactionType', () => {
    expect(interactionMatchesFilter(baseInteraction, { interactionType: 'email' })).toBe(false);
    expect(interactionMatchesFilter(baseInteraction, { interactionType: 'call' })).toBe(true);
  });
  it('filters by from window (inclusive)', () => {
    expect(interactionMatchesFilter(baseInteraction, { from: '2026-05-01' })).toBe(true);
    expect(interactionMatchesFilter(baseInteraction, { from: '2026-06-01' })).toBe(false);
  });
  it('filters by to window (inclusive)', () => {
    expect(interactionMatchesFilter(baseInteraction, { to: '2026-05-10' })).toBe(true);
    expect(interactionMatchesFilter(baseInteraction, { to: '2026-04-01' })).toBe(false);
  });
});

// ─── settings ───────────────────────────────────────────────────────────

describe('settings constants', () => {
  it('ACCENT_COLORS includes teal (default)', () => {
    expect(ACCENT_COLORS).toContain('teal');
  });
  it('COMMON_CURRENCIES includes USD/EUR/GBP', () => {
    expect(COMMON_CURRENCIES).toEqual(expect.arrayContaining(['USD', 'EUR', 'GBP']));
  });
  it('PAYMENT_TERMS includes the standard NET-N values', () => {
    expect(PAYMENT_TERMS).toEqual(
      expect.arrayContaining(['due_on_receipt', 'net_7', 'net_30', 'net_60']),
    );
  });
});

describe('defaultSettings', () => {
  it('seeds canonical defaults', () => {
    const d = defaultSettings('u-1', 'id-1');
    expect(d.userId).toBe('u-1');
    expect(d.id).toBe('id-1');
    expect(d.defaultCurrency).toBe('USD');
    expect(d.invoiceNumberPrefix).toBe('INV');
    expect(d.quoteNumberPrefix).toBe('Q');
    expect(d.defaultPaymentTerms).toBe('net_30');
    expect(d.accentColor).toBe('teal');
    expect(d.defaultHourlyRateCents).toBeNull();
    expect(d.logoUrl).toBeNull();
  });
});

describe('validateBusinessName', () => {
  it('passes empty (default)', () => {
    expect(validateBusinessName('')).toBeNull();
  });
  it('passes a normal name', () => {
    expect(validateBusinessName('Acme LLC')).toBeNull();
  });
  it('flags too long', () => {
    expect(validateBusinessName('x'.repeat(201))).toMatch(/too long/);
  });
});

describe('validateCurrency', () => {
  it('passes USD/EUR', () => {
    expect(validateCurrency('USD')).toBeNull();
    expect(validateCurrency('EUR')).toBeNull();
  });
  it('flags empty', () => {
    expect(validateCurrency('   ')).toMatch(/empty/);
  });
  it('flags too long', () => {
    expect(validateCurrency('LONG-CURRENCY')).toMatch(/too long/);
  });
});

describe('validateLogoUrl', () => {
  it('passes a https URL', () => {
    expect(validateLogoUrl('https://logo.example.com/x.png')).toBeNull();
  });
  it('passes null', () => {
    expect(validateLogoUrl(null)).toBeNull();
  });
  it('flags missing scheme', () => {
    expect(validateLogoUrl('logo.example.com')).toMatch(/URL/);
  });
});

describe('validateHourlyRateCents', () => {
  it('passes null', () => {
    expect(validateHourlyRateCents(null)).toBeNull();
  });
  it('passes a positive integer', () => {
    expect(validateHourlyRateCents(15000)).toBeNull();
  });
  it('flags non-integer', () => {
    expect(validateHourlyRateCents(1.5)).toMatch(/integer/);
  });
  it('flags negative', () => {
    expect(validateHourlyRateCents(-1)).toMatch(/>= 0/);
  });
  it('flags too large', () => {
    expect(validateHourlyRateCents(100_000_001)).toMatch(/too large/);
  });
});

describe('validateAccentColor', () => {
  it('passes a known accent', () => {
    expect(validateAccentColor('teal')).toBeNull();
  });
  it('passes free-form (no allowlist enforcement at validator)', () => {
    expect(validateAccentColor('cobalt')).toBeNull();
  });
  it('flags too long', () => {
    expect(validateAccentColor('x'.repeat(31))).toMatch(/too long/);
  });
});

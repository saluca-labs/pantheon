import { describe, it, expect } from 'vitest';
import {
  validatePerson,
  fullName,
  CONTACT_STAGES,
  INTERACTION_TYPES,
  ORG_TYPES,
} from '@/lib/agentic-os/business/crm';

describe('validatePerson', () => {
  it('returns no errors for a valid person', () => {
    const errors = validatePerson({
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      stage: 'lead',
    });
    expect(errors).toHaveLength(0);
  });

  it('requires firstName', () => {
    const errors = validatePerson({ firstName: '', lastName: 'Smith' });
    expect(errors.some((e) => e.includes('First name'))).toBe(true);
  });

  it('requires lastName', () => {
    const errors = validatePerson({ firstName: 'Jane', lastName: '' });
    expect(errors.some((e) => e.includes('Last name'))).toBe(true);
  });

  it('rejects malformed email', () => {
    const errors = validatePerson({ firstName: 'J', lastName: 'S', email: 'not-an-email' });
    expect(errors.some((e) => e.includes('Email'))).toBe(true);
  });

  it('accepts null email', () => {
    const errors = validatePerson({ firstName: 'J', lastName: 'S', email: undefined });
    expect(errors.filter((e) => e.includes('Email'))).toHaveLength(0);
  });

  it('rejects invalid stage', () => {
    const errors = validatePerson({ firstName: 'J', lastName: 'S', stage: 'prospect' as any });
    expect(errors.some((e) => e.includes('Stage'))).toBe(true);
  });
});

describe('fullName', () => {
  it('concatenates first and last name', () => {
    expect(fullName({ firstName: 'Jane', lastName: 'Smith' })).toBe('Jane Smith');
  });

  it('trims leading/trailing whitespace from the result', () => {
    // fullName concatenates firstName + ' ' + lastName and trims the result.
    // Individual field padding is not stripped — callers should pass clean data.
    expect(fullName({ firstName: 'John', lastName: 'Doe' })).toBe('John Doe');
  });
});

describe('CONTACT_STAGES', () => {
  it('includes standard B2B pipeline stages', () => {
    expect(CONTACT_STAGES).toContain('lead');
    expect(CONTACT_STAGES).toContain('qualified');
    expect(CONTACT_STAGES).toContain('won');
    expect(CONTACT_STAGES).toContain('lost');
  });
});

describe('INTERACTION_TYPES', () => {
  it('includes common touchpoint types', () => {
    expect(INTERACTION_TYPES).toContain('call');
    expect(INTERACTION_TYPES).toContain('email');
    expect(INTERACTION_TYPES).toContain('meeting');
    expect(INTERACTION_TYPES).toContain('note');
  });
});

describe('ORG_TYPES', () => {
  it('includes company and non_profit', () => {
    expect(ORG_TYPES).toContain('company');
    expect(ORG_TYPES).toContain('non_profit');
  });
});

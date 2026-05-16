/**
 * Maker OS — unit tests for dependencies.ts (Phase 6 graph helpers).
 *
 * Covers:
 *   - DEPENDENCY_KIND_VALUES + DEPENDENCY_STATUS_VALUES enumerations.
 *   - Validators: kind, status, project UUID format.
 *   - Edge validator: self-loop + UUID format.
 *
 * @license MIT — Tiresias Maker OS Phase 6 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  DEPENDENCY_KIND_VALUES,
  DEPENDENCY_KIND_LABELS,
  DEPENDENCY_STATUS_VALUES,
  DEPENDENCY_STATUS_LABELS,
  validateDependencyKind,
  validateDependencyStatus,
  validateProjectUuid,
  validateDependencyEdge,
} from '@/lib/agentic-os/maker/dependencies';

const VALID_UUID_A = '00000000-0000-4000-8000-000000000001';
const VALID_UUID_B = '00000000-0000-4000-8000-000000000002';

describe('DEPENDENCY_KIND_VALUES + labels', () => {
  it('contains the 4 locked values', () => {
    expect(DEPENDENCY_KIND_VALUES).toEqual([
      'blocks',
      'informs',
      'consumes',
      'related',
    ]);
  });

  it('every kind has a label', () => {
    for (const k of DEPENDENCY_KIND_VALUES) {
      expect(DEPENDENCY_KIND_LABELS[k]).toBeTruthy();
    }
  });
});

describe('DEPENDENCY_STATUS_VALUES + labels', () => {
  it('contains the 2 locked values', () => {
    expect(DEPENDENCY_STATUS_VALUES).toEqual(['open', 'cleared']);
  });

  it('every status has a label', () => {
    for (const s of DEPENDENCY_STATUS_VALUES) {
      expect(DEPENDENCY_STATUS_LABELS[s]).toBeTruthy();
    }
  });
});

describe('validateDependencyKind', () => {
  it('accepts each locked value', () => {
    for (const k of DEPENDENCY_KIND_VALUES) {
      expect(validateDependencyKind(k)).toBeNull();
    }
  });
  it('rejects unknown value', () => {
    expect(validateDependencyKind('bogus')).toMatch(/kind must be one of/);
  });
  it('rejects non-string', () => {
    expect(validateDependencyKind(0 as never)).toMatch(/kind must be one of/);
    expect(validateDependencyKind(null as never)).toMatch(/kind must be one of/);
  });
});

describe('validateDependencyStatus', () => {
  it('accepts each locked value', () => {
    for (const s of DEPENDENCY_STATUS_VALUES) {
      expect(validateDependencyStatus(s)).toBeNull();
    }
  });
  it('rejects unknown value', () => {
    expect(validateDependencyStatus('done')).toMatch(/status must be one of/);
  });
});

describe('validateProjectUuid', () => {
  it('accepts a valid UUID v4', () => {
    expect(validateProjectUuid(VALID_UUID_A)).toBeNull();
  });
  it('rejects malformed', () => {
    expect(validateProjectUuid('not-a-uuid')).toMatch(/UUID/);
    expect(validateProjectUuid('')).toMatch(/UUID/);
  });
  it('rejects non-string', () => {
    expect(validateProjectUuid(0 as never)).toMatch(/string UUID/);
  });
});

describe('validateDependencyEdge', () => {
  it('accepts two distinct valid UUIDs', () => {
    expect(validateDependencyEdge(VALID_UUID_A, VALID_UUID_B)).toBeNull();
  });

  it('rejects self-loop on same case', () => {
    expect(validateDependencyEdge(VALID_UUID_A, VALID_UUID_A)).toMatch(
      /cannot depend on itself/,
    );
  });

  it('rejects self-loop case-insensitively', () => {
    const upper = VALID_UUID_A.toUpperCase();
    expect(validateDependencyEdge(VALID_UUID_A, upper)).toMatch(
      /cannot depend on itself/,
    );
  });

  it('reports from-side validation errors first', () => {
    expect(validateDependencyEdge('bad', VALID_UUID_B)).toMatch(/from:/);
  });

  it('reports to-side validation errors when from is OK', () => {
    expect(validateDependencyEdge(VALID_UUID_A, 'bad')).toMatch(/to:/);
  });
});

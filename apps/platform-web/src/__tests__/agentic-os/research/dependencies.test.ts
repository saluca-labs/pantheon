/**
 * Research OS Phase 6 — dependency domain pure-helper tests.
 *
 * Locks the kind taxonomy (feeds/blocks/informs/replicates), status
 * taxonomy, and edge validators (self-loop, UUID format).
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  DEPENDENCY_KIND_VALUES,
  DEPENDENCY_STATUS_VALUES,
  validateDependencyKind,
  validateDependencyStatus,
  validateExperimentUuid,
  validateDependencyEdge,
} from '@/lib/agentic-os/research/dependencies';

describe('DEPENDENCY_KIND_VALUES', () => {
  it('locks the 4 kind values (feeds/blocks/informs/replicates)', () => {
    expect([...DEPENDENCY_KIND_VALUES]).toEqual([
      'feeds',
      'blocks',
      'informs',
      'replicates',
    ]);
  });
});

describe('DEPENDENCY_STATUS_VALUES', () => {
  it('locks status as open + cleared', () => {
    expect([...DEPENDENCY_STATUS_VALUES]).toEqual(['open', 'cleared']);
  });
});

describe('validateDependencyKind()', () => {
  it('accepts every taxonomy value', () => {
    for (const k of DEPENDENCY_KIND_VALUES) {
      expect(validateDependencyKind(k)).toBeNull();
    }
  });
  it('rejects unknown values', () => {
    expect(validateDependencyKind('hard_dep')).toMatch(/kind must be one of/);
  });
});

describe('validateDependencyStatus()', () => {
  it('accepts open + cleared', () => {
    expect(validateDependencyStatus('open')).toBeNull();
    expect(validateDependencyStatus('cleared')).toBeNull();
  });
  it('rejects unknown values', () => {
    expect(validateDependencyStatus('pending')).toMatch(/status must be one of/);
  });
});

describe('validateExperimentUuid()', () => {
  it('accepts a valid UUID', () => {
    expect(validateExperimentUuid('11111111-2222-3333-4444-555555555555')).toBeNull();
  });
  it('rejects non-UUID', () => {
    expect(validateExperimentUuid('not-a-uuid')).toMatch(/UUID/);
    expect(validateExperimentUuid(42)).toMatch(/string/);
  });
});

describe('validateDependencyEdge()', () => {
  it('rejects self-loop on identical UUID', () => {
    const u = '11111111-2222-3333-4444-555555555555';
    expect(validateDependencyEdge(u, u)).toMatch(/cannot depend on itself/);
  });
  it('rejects self-loop case-insensitively', () => {
    const lower = '11111111-2222-3333-4444-555555555555';
    const upper = '11111111-2222-3333-4444-555555555555'.toUpperCase();
    expect(validateDependencyEdge(lower, upper)).toMatch(/cannot depend on itself/);
  });
  it('accepts two distinct UUIDs', () => {
    expect(
      validateDependencyEdge(
        '11111111-2222-3333-4444-555555555555',
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      ),
    ).toBeNull();
  });
  it('rejects malformed left side', () => {
    expect(
      validateDependencyEdge('bad', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
    ).toMatch(/^from:/);
  });
  it('rejects malformed right side', () => {
    expect(
      validateDependencyEdge('11111111-2222-3333-4444-555555555555', 'bad'),
    ).toMatch(/^to:/);
  });
});

/**
 * Autobiographer OS Phase 7 — coach safety helper tests.
 *
 * Pure unit tests over:
 *   - PROFESSIONAL_READER_KINDS — exactly { sexual, abuse, mental_health }
 *   - shouldAppendSensitiveFooter
 *   - shouldRecommendProfessionalReader
 *   - buildSensitiveFooter (per-mode copy + escalation)
 *   - unionSensitiveKinds (camelCase + snake_case keys, dedup, invalid drop)
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  PROFESSIONAL_READER_KINDS,
  buildSensitiveFooter,
  shouldAppendSensitiveFooter,
  shouldRecommendProfessionalReader,
  unionSensitiveKinds,
} from '@/lib/agentic-os/autobiographer/coach/safety';

describe('PROFESSIONAL_READER_KINDS', () => {
  it('contains exactly sexual / abuse / mental_health', () => {
    expect([...PROFESSIONAL_READER_KINDS].sort()).toEqual([
      'abuse',
      'mental_health',
      'sexual',
    ]);
  });

  it('does NOT include legal / financial / death / medical / other', () => {
    for (const k of ['legal', 'financial', 'death', 'medical', 'other']) {
      expect(
        (PROFESSIONAL_READER_KINDS as readonly string[]).includes(k),
      ).toBe(false);
    }
  });
});

describe('shouldAppendSensitiveFooter', () => {
  it('returns false for an empty list', () => {
    expect(shouldAppendSensitiveFooter([])).toBe(false);
  });

  it('returns false for a list of invalid tokens', () => {
    expect(shouldAppendSensitiveFooter(['foo', 'bar', null as never, 42 as never])).toBe(
      false,
    );
  });

  it('returns true for any valid sensitive kind', () => {
    for (const k of [
      'sexual',
      'abuse',
      'mental_health',
      'legal',
      'financial',
      'death',
      'medical',
      'other',
    ]) {
      expect(shouldAppendSensitiveFooter([k])).toBe(true);
    }
  });

  it('returns true when valid kinds are mixed with invalid ones', () => {
    expect(shouldAppendSensitiveFooter(['nonsense', 'sexual'])).toBe(true);
  });
});

describe('shouldRecommendProfessionalReader', () => {
  it('returns true for any single trauma-facing kind', () => {
    expect(shouldRecommendProfessionalReader(['sexual'])).toBe(true);
    expect(shouldRecommendProfessionalReader(['abuse'])).toBe(true);
    expect(shouldRecommendProfessionalReader(['mental_health'])).toBe(true);
  });

  it('returns false for non-trauma sensitive kinds alone', () => {
    expect(shouldRecommendProfessionalReader(['legal'])).toBe(false);
    expect(shouldRecommendProfessionalReader(['financial'])).toBe(false);
    expect(shouldRecommendProfessionalReader(['death'])).toBe(false);
    expect(shouldRecommendProfessionalReader(['medical'])).toBe(false);
    expect(shouldRecommendProfessionalReader(['other'])).toBe(false);
  });

  it('returns true when ANY trauma kind is in a mixed set', () => {
    expect(
      shouldRecommendProfessionalReader(['legal', 'death', 'mental_health']),
    ).toBe(true);
  });

  it('returns false for an empty list', () => {
    expect(shouldRecommendProfessionalReader([])).toBe(false);
  });
});

describe('buildSensitiveFooter', () => {
  it('returns null when no sensitive kinds are present', () => {
    expect(buildSensitiveFooter([])).toBeNull();
    expect(buildSensitiveFooter(['nonsense' as never])).toBeNull();
  });

  it('returns the generic footer for non-trauma sensitive kinds', () => {
    const f = buildSensitiveFooter(['legal', 'financial']);
    expect(f).toBeTruthy();
    expect(f).toMatch(/trusted reader/i);
    expect(f).not.toMatch(/licensed professional/i);
    expect(f).toMatch(/financial, legal/);
  });

  it('returns the professional-reader footer for trauma-facing kinds', () => {
    const f = buildSensitiveFooter(['sexual']);
    expect(f).toMatch(/licensed professional/i);
    expect(f).toMatch(/therapist|trauma-informed/i);
  });

  it('escalates the footer when ANY trauma kind is in a mixed set', () => {
    const f = buildSensitiveFooter(['legal', 'mental_health']);
    expect(f).toMatch(/licensed professional/i);
    // Both kinds appear in the listing, sorted alphabetically.
    expect(f).toMatch(/legal, mental_health/);
  });

  it('dedupes the kind listing', () => {
    const f = buildSensitiveFooter(['legal', 'legal', 'death']);
    expect(f).toMatch(/death, legal/);
    expect(f!.match(/legal/g)?.length).toBe(1);
  });

  it('contains the magic anchor phrase the messages route checks for', () => {
    const f = buildSensitiveFooter(['sexual']);
    expect(f).toMatch(/Sensitive material/);
  });
});

describe('unionSensitiveKinds', () => {
  it('returns an empty array for an empty source list', () => {
    expect(unionSensitiveKinds([])).toEqual([]);
  });

  it('handles camelCase keys (sensitiveKinds)', () => {
    expect(
      unionSensitiveKinds([
        { sensitiveKinds: ['legal'] },
        { sensitiveKinds: ['death'] },
      ]),
    ).toEqual(['death', 'legal']);
  });

  it('handles snake_case keys (sensitive_kinds)', () => {
    expect(
      unionSensitiveKinds([
        { sensitive_kinds: ['mental_health'] },
        { sensitive_kinds: ['legal'] },
      ]),
    ).toEqual(['legal', 'mental_health']);
  });

  it('handles a mix of both key conventions', () => {
    expect(
      unionSensitiveKinds([
        { sensitiveKinds: ['legal'] },
        { sensitive_kinds: ['abuse'] },
      ]),
    ).toEqual(['abuse', 'legal']);
  });

  it('drops invalid tokens silently', () => {
    expect(
      unionSensitiveKinds([
        { sensitive_kinds: ['nonsense', 'legal', 42 as never, null as never] },
      ]),
    ).toEqual(['legal']);
  });

  it('dedupes across multiple sources', () => {
    expect(
      unionSensitiveKinds([
        { sensitive_kinds: ['legal', 'death'] },
        { sensitive_kinds: ['death', 'death'] },
      ]),
    ).toEqual(['death', 'legal']);
  });

  it('returns kinds in sorted order', () => {
    expect(
      unionSensitiveKinds([
        { sensitive_kinds: ['sexual', 'abuse', 'mental_health', 'legal'] },
      ]),
    ).toEqual(['abuse', 'legal', 'mental_health', 'sexual']);
  });

  it('treats null sensitive_kinds field as empty', () => {
    expect(
      unionSensitiveKinds([{ sensitive_kinds: null }, { sensitiveKinds: null }]),
    ).toEqual([]);
  });
});

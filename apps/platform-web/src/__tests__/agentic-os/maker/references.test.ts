/**
 * Maker OS — reference domain helpers tests.
 *
 * Pure functions in `lib/agentic-os/maker/references.ts`. No DB / fetch.
 *
 * @license MIT — Tiresias Maker OS Phase 5 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  REFERENCE_KIND_VALUES,
  REFERENCE_KIND_LABELS,
  REFERENCE_KINDS,
  validateReferenceKind,
  validateReferenceTitle,
  validateReferenceUrl,
  validatePublishedAt,
  summarizeReferences,
  type Reference,
} from '@/lib/agentic-os/maker/references';

function ref(over: Partial<Reference> = {}): Reference {
  return {
    id: 'r-1',
    userId: 'u-1',
    title: 'Some paper',
    kind: 'paper',
    url: 'https://example.com/paper.pdf',
    authors: null,
    publisher: null,
    publishedAt: null,
    notes: null,
    tags: [],
    metadata: {},
    createdAt: '2026-05-11T00:00:00Z',
    updatedAt: '2026-05-11T00:00:00Z',
    ...over,
  };
}

describe('REFERENCE_KIND_VALUES', () => {
  it('locks the 8 kinds in canonical order', () => {
    expect(REFERENCE_KIND_VALUES).toEqual([
      'paper',
      'tutorial',
      'standard',
      'article',
      'video',
      'book',
      'link',
      'other',
    ]);
  });

  it('every kind has a human label', () => {
    for (const k of REFERENCE_KIND_VALUES) {
      expect(typeof REFERENCE_KIND_LABELS[k]).toBe('string');
      expect(REFERENCE_KIND_LABELS[k].length).toBeGreaterThan(0);
    }
  });

  it('REFERENCE_KINDS metadata covers every kind with an icon', () => {
    const kinds = REFERENCE_KINDS.map((k) => k.value);
    expect(kinds).toEqual([...REFERENCE_KIND_VALUES]);
    for (const info of REFERENCE_KINDS) {
      expect(info.icon.length).toBeGreaterThan(0);
    }
  });
});

describe('validateReferenceKind', () => {
  it('accepts the 8 locked values', () => {
    for (const k of REFERENCE_KIND_VALUES) {
      expect(validateReferenceKind(k)).toBeNull();
    }
  });

  it('rejects an unknown kind', () => {
    expect(validateReferenceKind('zine')).toMatch(/one of/);
  });

  it('rejects non-string', () => {
    expect(validateReferenceKind(7)).toMatch(/one of/);
  });
});

describe('validateReferenceTitle', () => {
  it('accepts a normal title', () => {
    expect(validateReferenceTitle('Attention is all you need')).toBeNull();
  });

  it('rejects empty', () => {
    expect(validateReferenceTitle('')).toMatch(/required/);
    expect(validateReferenceTitle('   ')).toMatch(/required/);
  });

  it('rejects oversize (>300)', () => {
    expect(validateReferenceTitle('x'.repeat(301))).toMatch(/300/);
  });
});

describe('validateReferenceUrl', () => {
  it('accepts a normal URL', () => {
    expect(validateReferenceUrl('https://x.com')).toBeNull();
  });

  it('rejects empty', () => {
    expect(validateReferenceUrl('')).toMatch(/required/);
  });

  it('rejects oversize (>2000)', () => {
    expect(validateReferenceUrl('x'.repeat(2001))).toMatch(/2000/);
  });
});

describe('validatePublishedAt', () => {
  it('accepts null', () => {
    expect(validatePublishedAt(null)).toBeNull();
  });

  it('accepts YYYY-MM-DD', () => {
    expect(validatePublishedAt('2017-12-06')).toBeNull();
  });

  it('rejects malformed', () => {
    expect(validatePublishedAt('Dec 2017')).toMatch(/YYYY-MM-DD/);
  });
});

describe('summarizeReferences', () => {
  it('counts an empty list as zeros', () => {
    const s = summarizeReferences([]);
    expect(s.total).toBe(0);
    for (const k of REFERENCE_KIND_VALUES) {
      expect(s.byKind[k]).toBe(0);
    }
  });

  it('counts a mixed list correctly', () => {
    const refs = [
      ref({ id: '1', kind: 'paper' }),
      ref({ id: '2', kind: 'paper' }),
      ref({ id: '3', kind: 'tutorial' }),
      ref({ id: '4', kind: 'standard' }),
      ref({ id: '5', kind: 'link' }),
      ref({ id: '6', kind: 'link' }),
      ref({ id: '7', kind: 'link' }),
    ];
    const s = summarizeReferences(refs);
    expect(s.total).toBe(7);
    expect(s.byKind.paper).toBe(2);
    expect(s.byKind.tutorial).toBe(1);
    expect(s.byKind.standard).toBe(1);
    expect(s.byKind.link).toBe(3);
    expect(s.byKind.video).toBe(0);
  });
});

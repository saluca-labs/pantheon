/**
 * Research OS Phase 2 — pure-helper tests for the notebook-entries lib.
 *
 * Locks the filter predicate, URL/tag normalizers, body-preview rules,
 * and the entry_at validator. No DB; no React.
 *
 * @license MIT — Tiresias Research OS Phase 2 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  notebookEntryMatchesFilter,
  validateAttachedUrl,
  validateEntryAt,
  bodyMdPreview,
  sortEntriesByEntryAt,
  normalizeTags,
  normalizeAttachedUrls,
  type NotebookEntry,
} from '@/lib/agentic-os/research/notebook-entries';

function mkEntry(overrides: Partial<NotebookEntry> = {}): NotebookEntry {
  return {
    id: 'e-1',
    userId: 'u-1',
    experimentId: 'exp-1',
    entryKind: 'note',
    title: 'Test',
    bodyMd: '',
    attachedUrls: [],
    tags: [],
    entryAt: '2026-05-12T10:00:00.000Z',
    archivedAt: null,
    metadata: {},
    createdAt: '2026-05-12T10:00:00.000Z',
    updatedAt: '2026-05-12T10:00:00.000Z',
    ...overrides,
  };
}

describe('notebookEntryMatchesFilter()', () => {
  it('hides archived entries by default', () => {
    const archived = mkEntry({ archivedAt: '2026-05-12T11:00:00.000Z' });
    expect(notebookEntryMatchesFilter(archived, {})).toBe(false);
  });

  it('shows archived entries when archived=true', () => {
    const archived = mkEntry({ archivedAt: '2026-05-12T11:00:00.000Z' });
    expect(notebookEntryMatchesFilter(archived, { archived: true })).toBe(true);
  });

  it('hides ACTIVE entries when archived=true (mode is exclusive)', () => {
    const active = mkEntry();
    expect(notebookEntryMatchesFilter(active, { archived: true })).toBe(false);
  });

  it('shows active entries by default', () => {
    const active = mkEntry();
    expect(notebookEntryMatchesFilter(active, {})).toBe(true);
  });

  it('filters by entryKind exact match', () => {
    const observation = mkEntry({ entryKind: 'observation' });
    expect(notebookEntryMatchesFilter(observation, { entryKind: 'observation' })).toBe(true);
    expect(notebookEntryMatchesFilter(observation, { entryKind: 'result' })).toBe(false);
  });

  it('filters by tag (case-insensitive)', () => {
    const entry = mkEntry({ tags: ['enzyme', 'kinetics'] });
    expect(notebookEntryMatchesFilter(entry, { tag: 'enzyme' })).toBe(true);
    expect(notebookEntryMatchesFilter(entry, { tag: 'ENZYME' })).toBe(true);
    expect(notebookEntryMatchesFilter(entry, { tag: 'enzymee' })).toBe(false);
  });

  it('combines tag + entryKind filters with AND semantics', () => {
    const entry = mkEntry({ entryKind: 'todo', tags: ['urgent'] });
    expect(
      notebookEntryMatchesFilter(entry, { entryKind: 'todo', tag: 'urgent' }),
    ).toBe(true);
    expect(
      notebookEntryMatchesFilter(entry, { entryKind: 'note', tag: 'urgent' }),
    ).toBe(false);
    expect(
      notebookEntryMatchesFilter(entry, { entryKind: 'todo', tag: 'maybe-later' }),
    ).toBe(false);
  });

  it('ignores whitespace-only tag filter', () => {
    const entry = mkEntry({ tags: ['enzyme'] });
    expect(notebookEntryMatchesFilter(entry, { tag: '   ' })).toBe(true);
  });
});

describe('validateAttachedUrl()', () => {
  it('accepts http(s) URLs', () => {
    expect(validateAttachedUrl('https://example.com')).toBeNull();
    expect(validateAttachedUrl('http://example.com/path?q=1')).toBeNull();
  });

  it('rejects non-string', () => {
    expect(validateAttachedUrl(42)).toMatch(/string/);
    expect(validateAttachedUrl(null)).toMatch(/string/);
    expect(validateAttachedUrl(undefined)).toMatch(/string/);
  });

  it('rejects empty string', () => {
    expect(validateAttachedUrl('')).toMatch(/empty/);
  });

  it('rejects non-http(s) schemes', () => {
    expect(validateAttachedUrl('javascript:alert(1)')).toMatch(/valid http/);
    expect(validateAttachedUrl('ftp://example.com')).toMatch(/valid http/);
    expect(validateAttachedUrl('mailto:test@example.com')).toMatch(/valid http/);
  });

  it('rejects naked text without a scheme', () => {
    expect(validateAttachedUrl('example.com')).toMatch(/valid http/);
  });

  it('rejects too-long URLs', () => {
    const long = 'https://example.com/' + 'a'.repeat(4100);
    expect(validateAttachedUrl(long)).toMatch(/too long/);
  });
});

describe('validateEntryAt()', () => {
  it('accepts a parseable ISO-8601 UTC string', () => {
    expect(validateEntryAt('2026-05-12T10:00:00.000Z')).toBeNull();
    expect(validateEntryAt('2024-01-01T00:00:00Z')).toBeNull();
  });

  it('rejects unparseable strings', () => {
    expect(validateEntryAt('not-a-date')).toMatch(/ISO-8601/);
  });

  it('rejects non-strings', () => {
    expect(validateEntryAt(42)).toMatch(/string/);
    expect(validateEntryAt(null)).toMatch(/string/);
  });
});

describe('bodyMdPreview()', () => {
  it('returns "" for empty input', () => {
    expect(bodyMdPreview('')).toBe('');
  });

  it('passes through short bodies unchanged', () => {
    expect(bodyMdPreview('A quick note.')).toBe('A quick note.');
  });

  it('strips code fences', () => {
    const out = bodyMdPreview('Before\n```python\nprint("hi")\n```\nAfter');
    expect(out).not.toMatch(/```/);
    expect(out).toMatch(/Before/);
    expect(out).toMatch(/After/);
  });

  it('strips leading heading hashes but keeps the text', () => {
    expect(bodyMdPreview('# Heading text\nbody.')).toBe('Heading text body.');
  });

  it('collapses repeated whitespace', () => {
    expect(bodyMdPreview('a\n\n\n\nb')).toBe('a b');
  });

  it('truncates word-aware with an ellipsis when over max', () => {
    const long = 'word '.repeat(120).trim();
    const preview = bodyMdPreview(long, 60);
    expect(preview.length).toBeLessThanOrEqual(61); // +1 for the ellipsis
    expect(preview.endsWith('…')).toBe(true);
    expect(preview).not.toMatch(/\s$/);
  });
});

describe('sortEntriesByEntryAt()', () => {
  it('orders most recent first', () => {
    const a = mkEntry({ id: 'a', entryAt: '2026-01-01T00:00:00.000Z' });
    const b = mkEntry({ id: 'b', entryAt: '2026-03-01T00:00:00.000Z' });
    const c = mkEntry({ id: 'c', entryAt: '2026-02-01T00:00:00.000Z' });
    const out = sortEntriesByEntryAt([a, b, c]);
    expect(out.map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate the input array', () => {
    const a = mkEntry({ id: 'a', entryAt: '2026-01-01T00:00:00.000Z' });
    const b = mkEntry({ id: 'b', entryAt: '2026-02-01T00:00:00.000Z' });
    const input = [a, b];
    sortEntriesByEntryAt(input);
    expect(input.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('handles empty input', () => {
    expect(sortEntriesByEntryAt([])).toEqual([]);
  });
});

describe('normalizeTags()', () => {
  it('lower-cases and trims', () => {
    expect(normalizeTags(['  Enzyme  ', 'KINETICS'])).toEqual(['enzyme', 'kinetics']);
  });

  it('drops empty strings + whitespace-only', () => {
    expect(normalizeTags(['', '   ', 'real'])).toEqual(['real']);
  });

  it('dedupes after normalization', () => {
    expect(normalizeTags(['Enzyme', 'enzyme', 'ENZYME'])).toEqual(['enzyme']);
  });

  it('drops non-strings', () => {
    expect(normalizeTags(['a', 42, null, undefined, 'b'] as unknown[])).toEqual(['a', 'b']);
  });

  it('drops tags longer than 60 chars', () => {
    const long = 'a'.repeat(61);
    expect(normalizeTags([long, 'ok'])).toEqual(['ok']);
  });

  it('returns [] for non-array input', () => {
    expect(normalizeTags('not-an-array' as unknown)).toEqual([]);
    expect(normalizeTags(null as unknown)).toEqual([]);
    expect(normalizeTags(undefined as unknown)).toEqual([]);
  });
});

describe('normalizeAttachedUrls()', () => {
  it('keeps valid http(s) URLs in order', () => {
    expect(normalizeAttachedUrls(['https://a.com', 'http://b.com'])).toEqual([
      'https://a.com',
      'http://b.com',
    ]);
  });

  it('drops invalid URLs', () => {
    expect(
      normalizeAttachedUrls(['https://ok.com', 'javascript:alert(1)', 'not-a-url']),
    ).toEqual(['https://ok.com']);
  });

  it('caps at 50 entries', () => {
    const big = Array.from({ length: 80 }, (_, i) => `https://x-${i}.com`);
    expect(normalizeAttachedUrls(big).length).toBe(50);
  });

  it('returns [] for non-array', () => {
    expect(normalizeAttachedUrls('http://x.com' as unknown)).toEqual([]);
  });

  it('trims whitespace before validating', () => {
    expect(normalizeAttachedUrls(['  https://ok.com  '])).toEqual(['https://ok.com']);
  });
});

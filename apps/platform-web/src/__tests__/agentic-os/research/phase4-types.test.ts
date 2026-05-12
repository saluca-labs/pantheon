/**
 * Research OS Phase 4 — pure-helper / type-guard tests.
 *
 * Covers paper-kinds.ts, papers.ts (validators + filter predicate +
 * abstract preview + citation line + tag normalizer), authors.ts
 * (ORCID + display-name validators + family-name bucket), and
 * experiment-references.ts (relevance type guard + label lookup).
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  PAPER_KINDS,
  PAPER_KIND_LABELS,
  PAPER_KIND_DESCRIPTIONS,
  asPaperKind,
} from '@/lib/agentic-os/research/paper-kinds';
import {
  validatePaperTitle,
  validateDoi,
  validateArxivId,
  validatePaperUrl,
  validatePaperYear,
  paperMatchesFilter,
  normalizeTags,
  abstractMdPreview,
  buildCitationLine,
} from '@/lib/agentic-os/research/papers';
import {
  validateDisplayName,
  validateOrcid,
  familyNameBucket,
} from '@/lib/agentic-os/research/authors';
import {
  REFERENCE_RELEVANCES,
  REFERENCE_RELEVANCE_LABELS,
  REFERENCE_RELEVANCE_DESCRIPTIONS,
  asReferenceRelevance,
} from '@/lib/agentic-os/research/experiment-references';

describe('paper-kinds', () => {
  it('PAPER_KINDS lists exactly the 9 documented values', () => {
    expect([...PAPER_KINDS]).toEqual([
      'paper',
      'preprint',
      'thesis',
      'book',
      'chapter',
      'dataset_paper',
      'report',
      'blog',
      'other',
    ]);
  });

  it('PAPER_KIND_LABELS has one label per kind', () => {
    for (const k of PAPER_KINDS) {
      expect(PAPER_KIND_LABELS[k]).toBeTruthy();
      expect(typeof PAPER_KIND_LABELS[k]).toBe('string');
    }
  });

  it('PAPER_KIND_DESCRIPTIONS has one description per kind', () => {
    for (const k of PAPER_KINDS) {
      expect(PAPER_KIND_DESCRIPTIONS[k]).toBeTruthy();
    }
  });

  it('asPaperKind narrows known values', () => {
    expect(asPaperKind('paper')).toBe('paper');
    expect(asPaperKind('blog')).toBe('blog');
    expect(asPaperKind('dataset_paper')).toBe('dataset_paper');
  });

  it('asPaperKind returns null for unknown / wrong type', () => {
    expect(asPaperKind('article')).toBeNull();
    expect(asPaperKind('')).toBeNull();
    expect(asPaperKind(42)).toBeNull();
    expect(asPaperKind(null)).toBeNull();
    expect(asPaperKind(undefined)).toBeNull();
  });
});

describe('validatePaperTitle', () => {
  it('accepts a normal title', () => {
    expect(validatePaperTitle('A study of X')).toBeNull();
  });
  it('rejects empty / whitespace-only', () => {
    expect(validatePaperTitle('')).not.toBeNull();
    expect(validatePaperTitle('   ')).not.toBeNull();
  });
  it('rejects > 500 chars', () => {
    expect(validatePaperTitle('a'.repeat(501))).not.toBeNull();
  });
  it('rejects non-string', () => {
    expect(validatePaperTitle(42)).not.toBeNull();
    expect(validatePaperTitle(null)).not.toBeNull();
  });
});

describe('validateDoi', () => {
  it('accepts a well-formed DOI', () => {
    expect(validateDoi('10.1234/abcd.5678')).toBeNull();
    expect(validateDoi('10.1038/s41586-022-04567-9')).toBeNull();
  });
  it('accepts null / empty (optional column)', () => {
    expect(validateDoi(null)).toBeNull();
    expect(validateDoi('')).toBeNull();
    expect(validateDoi('   ')).toBeNull();
  });
  it('rejects malformed values', () => {
    expect(validateDoi('not-a-doi')).not.toBeNull();
    expect(validateDoi('10.1234')).not.toBeNull();
    expect(validateDoi('https://doi.org/10.1234/abcd')).not.toBeNull();
  });
});

describe('validateArxivId', () => {
  it('accepts a well-formed arXiv ID', () => {
    expect(validateArxivId('2401.12345')).toBeNull();
    expect(validateArxivId('2403.0001')).toBeNull();
    expect(validateArxivId('2401.12345v2')).toBeNull();
    expect(validateArxivId('arXiv:2401.12345')).toBeNull();
  });
  it('accepts null / empty', () => {
    expect(validateArxivId(null)).toBeNull();
    expect(validateArxivId('')).toBeNull();
  });
  it('rejects malformed values', () => {
    expect(validateArxivId('not-an-arxiv')).not.toBeNull();
    expect(validateArxivId('1234')).not.toBeNull();
  });
});

describe('validatePaperUrl', () => {
  it('accepts http(s) URLs', () => {
    expect(validatePaperUrl('https://example.com/paper.pdf')).toBeNull();
    expect(validatePaperUrl('http://example.com/paper')).toBeNull();
  });
  it('accepts null / empty', () => {
    expect(validatePaperUrl(null)).toBeNull();
    expect(validatePaperUrl('')).toBeNull();
  });
  it('rejects non-http schemes / malformed', () => {
    expect(validatePaperUrl('ftp://example.com/paper')).not.toBeNull();
    expect(validatePaperUrl('paper.pdf')).not.toBeNull();
  });
  it('rejects > 4000 chars', () => {
    expect(validatePaperUrl('https://x/' + 'a'.repeat(4000))).not.toBeNull();
  });
});

describe('validatePaperYear', () => {
  it('accepts plausible years', () => {
    expect(validatePaperYear(2024)).toBeNull();
    expect(validatePaperYear(1500)).toBeNull();
    expect(validatePaperYear(2200)).toBeNull();
  });
  it('accepts null', () => {
    expect(validatePaperYear(null)).toBeNull();
  });
  it('rejects out-of-range', () => {
    expect(validatePaperYear(1499)).not.toBeNull();
    expect(validatePaperYear(2201)).not.toBeNull();
  });
  it('rejects non-integer / NaN / string', () => {
    expect(validatePaperYear(2024.5)).not.toBeNull();
    expect(validatePaperYear(Number.NaN)).not.toBeNull();
    expect(validatePaperYear('2024')).not.toBeNull();
  });
});

describe('paperMatchesFilter', () => {
  const base = {
    title: 'Topology and Robotics',
    authorsText: 'Smith J. & Doe A.',
    kind: 'paper' as const,
    tags: ['robotics', 'benchmark'],
    year: 2024,
    archivedAt: null as string | null,
  };

  it('default scope hides archived', () => {
    expect(paperMatchesFilter({ ...base, archivedAt: '2026-01-01T00:00:00Z' }, {})).toBe(false);
  });
  it('archived=true exposes archived only', () => {
    expect(paperMatchesFilter(base, { archived: true })).toBe(false);
    expect(
      paperMatchesFilter(
        { ...base, archivedAt: '2026-01-01T00:00:00Z' },
        { archived: true },
      ),
    ).toBe(true);
  });
  it('kind filter narrows', () => {
    expect(paperMatchesFilter(base, { kind: 'paper' })).toBe(true);
    expect(paperMatchesFilter(base, { kind: 'preprint' })).toBe(false);
  });
  it('tag filter is case-insensitive', () => {
    expect(paperMatchesFilter(base, { tag: 'Robotics' })).toBe(true);
    expect(paperMatchesFilter(base, { tag: 'BENCHMARK' })).toBe(true);
    expect(paperMatchesFilter(base, { tag: 'missing' })).toBe(false);
  });
  it('year filter requires exact match', () => {
    expect(paperMatchesFilter(base, { year: 2024 })).toBe(true);
    expect(paperMatchesFilter(base, { year: 2023 })).toBe(false);
  });
  it('free-text search hits title', () => {
    expect(paperMatchesFilter(base, { q: 'topology' })).toBe(true);
    expect(paperMatchesFilter(base, { q: 'TOPOLOGY' })).toBe(true);
    expect(paperMatchesFilter(base, { q: 'unrelated' })).toBe(false);
  });
  it('free-text search hits authors_text', () => {
    expect(paperMatchesFilter(base, { q: 'smith' })).toBe(true);
    expect(paperMatchesFilter(base, { q: 'doe' })).toBe(true);
  });
  it('combining filters AND-s correctly', () => {
    expect(paperMatchesFilter(base, { kind: 'paper', tag: 'robotics', year: 2024 })).toBe(true);
    expect(paperMatchesFilter(base, { kind: 'preprint', tag: 'robotics' })).toBe(false);
  });
});

describe('normalizeTags', () => {
  it('trims, lowercases, dedupes, drops empty', () => {
    expect(normalizeTags(['  Robotics ', 'ROBOTICS', 'benchmark', ''])).toEqual([
      'robotics',
      'benchmark',
    ]);
  });
  it('drops > 60-char tags', () => {
    expect(normalizeTags(['a'.repeat(61), 'short'])).toEqual(['short']);
  });
  it('returns [] for non-array', () => {
    expect(normalizeTags('robotics')).toEqual([]);
    expect(normalizeTags(null)).toEqual([]);
    expect(normalizeTags(undefined)).toEqual([]);
  });
  it('drops non-string entries', () => {
    expect(normalizeTags([42, 'ok', null, 'two'])).toEqual(['ok', 'two']);
  });
});

describe('abstractMdPreview', () => {
  it('returns empty string for null / empty', () => {
    expect(abstractMdPreview(null)).toBe('');
    expect(abstractMdPreview('')).toBe('');
  });
  it('strips code fences', () => {
    expect(abstractMdPreview('```py\ncode\n```after').includes('code')).toBe(false);
  });
  it('strips heading markers', () => {
    expect(abstractMdPreview('# Heading\nbody').startsWith('#')).toBe(false);
  });
  it('returns full body when shorter than max', () => {
    expect(abstractMdPreview('short')).toBe('short');
  });
  it('truncates with ellipsis when longer', () => {
    const long = 'word '.repeat(100);
    const preview = abstractMdPreview(long, 40);
    expect(preview.length).toBeLessThanOrEqual(45);
    expect(preview.endsWith('…')).toBe(true);
  });
});

describe('buildCitationLine', () => {
  it('joins authors_text, year, title, venue', () => {
    const line = buildCitationLine({
      authorsText: 'Smith, J.',
      year: 2024,
      title: 'A study',
      venue: 'Nature',
    });
    expect(line).toContain('Smith, J.');
    expect(line).toContain('(2024)');
    expect(line).toContain('A study');
    expect(line).toContain('Nature');
  });
  it('omits absent fields gracefully', () => {
    expect(buildCitationLine({ authorsText: null, year: null, title: 'T', venue: null })).toBe(
      'T',
    );
  });
});

describe('validateDisplayName', () => {
  it('accepts a normal name', () => {
    expect(validateDisplayName('Alice Smith')).toBeNull();
  });
  it('rejects empty / whitespace / > 300 chars', () => {
    expect(validateDisplayName('')).not.toBeNull();
    expect(validateDisplayName('  ')).not.toBeNull();
    expect(validateDisplayName('a'.repeat(301))).not.toBeNull();
  });
});

describe('validateOrcid', () => {
  it('accepts canonical ORCID with checksum X', () => {
    expect(validateOrcid('0000-0001-2345-678X')).toBeNull();
  });
  it('accepts canonical ORCID with digit checksum', () => {
    expect(validateOrcid('0000-0001-2345-6789')).toBeNull();
  });
  it('accepts null / empty', () => {
    expect(validateOrcid(null)).toBeNull();
    expect(validateOrcid('')).toBeNull();
  });
  it('rejects malformed ORCID', () => {
    expect(validateOrcid('00000-0001-2345-6789')).not.toBeNull();
    expect(validateOrcid('not-an-orcid')).not.toBeNull();
    expect(validateOrcid('0000000012345678')).not.toBeNull();
  });
});

describe('familyNameBucket', () => {
  it('returns first letter uppercased for normal name', () => {
    expect(familyNameBucket('Smith')).toBe('S');
    expect(familyNameBucket('jones')).toBe('J');
  });
  it('returns # for empty / null / non-letter', () => {
    expect(familyNameBucket(null)).toBe('#');
    expect(familyNameBucket('')).toBe('#');
    expect(familyNameBucket('123')).toBe('#');
    expect(familyNameBucket('—Doe')).toBe('#');
  });
});

describe('experiment-references types', () => {
  it('REFERENCE_RELEVANCES has the 5 documented values', () => {
    expect([...REFERENCE_RELEVANCES]).toEqual([
      'cites',
      'methods',
      'prior_art',
      'contradicts',
      'builds_on',
    ]);
  });
  it('every relevance has a label + description', () => {
    for (const r of REFERENCE_RELEVANCES) {
      expect(REFERENCE_RELEVANCE_LABELS[r]).toBeTruthy();
      expect(REFERENCE_RELEVANCE_DESCRIPTIONS[r]).toBeTruthy();
    }
  });
  it('asReferenceRelevance narrows known values', () => {
    expect(asReferenceRelevance('cites')).toBe('cites');
    expect(asReferenceRelevance('builds_on')).toBe('builds_on');
  });
  it('asReferenceRelevance returns null for unknown', () => {
    expect(asReferenceRelevance('CITES')).toBeNull();
    expect(asReferenceRelevance('foo')).toBeNull();
    expect(asReferenceRelevance(null)).toBeNull();
    expect(asReferenceRelevance(42)).toBeNull();
  });
});

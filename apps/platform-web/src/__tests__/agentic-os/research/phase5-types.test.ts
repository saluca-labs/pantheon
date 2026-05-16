/**
 * Research OS Phase 5 — type + validator + walker tests.
 *
 * Covers:
 *   - 6-value dataset kind enum + type guard
 *   - 5-value protocol kind enum + type guard
 *   - datasetMatchesFilter predicate (kind/tag/archived combinations)
 *   - protocolMatchesFilter predicate (kind/tag/q + rootsOnly)
 *   - tag normalizer (trim/lowercase/dedupe/cap)
 *   - URL validators
 *   - resolvePinnedVersion walker — exact match + fallback to root
 *   - buildVersionChain ordering (oldest-first by created_at)
 *   - bumpParentFor normalization (children re-anchor to root)
 *   - hasAnyExportContent predicate
 *   - PDF helpers: truncateForPdf + groupReferencesByRelevance
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  DATASET_KINDS,
  DATASET_KIND_LABELS,
  asDatasetKind,
  type DatasetKind,
} from '@/lib/agentic-os/research/dataset-kinds';
import {
  PROTOCOL_KINDS,
  PROTOCOL_KIND_LABELS,
  asProtocolKind,
} from '@/lib/agentic-os/research/protocol-kinds';
import {
  datasetMatchesFilter,
  normalizeDatasetTags,
  isValidDatasetUrl,
  validateDatasetName,
  validateDatasetKind,
} from '@/lib/agentic-os/research/datasets';
import {
  protocolMatchesFilter,
  normalizeProtocolTags,
  normalizeAttachedUrls,
  validateProtocolTitle,
  validateProtocolVersion,
  validateProtocolKind,
  buildVersionChain,
  resolvePinnedVersion,
  bumpParentFor,
  type Protocol,
} from '@/lib/agentic-os/research/protocols';
import { hasAnyExportContent } from '@/lib/agentic-os/research/experiments';
import {
  truncateForPdf,
  groupReferencesByRelevance,
  type ExperimentPdfReferenceRow,
} from '@/lib/agentic-os/research/pdf/experiment-export';

// ─── Dataset enum ─────────────────────────────────────────────────────────

describe('DATASET_KINDS', () => {
  it('has 6 values', () => {
    expect(DATASET_KINDS).toHaveLength(6);
  });

  it.each(['tabular', 'image', 'timeseries', 'sequence', 'sim', 'other'])(
    'includes %s',
    (k) => {
      expect(DATASET_KINDS).toContain(k);
    },
  );

  it('has labels for every kind', () => {
    for (const k of DATASET_KINDS) {
      expect(DATASET_KIND_LABELS[k]).toBeTruthy();
    }
  });

  it('asDatasetKind returns null on unknown', () => {
    expect(asDatasetKind('xyzzy')).toBeNull();
    expect(asDatasetKind(null)).toBeNull();
    expect(asDatasetKind(42)).toBeNull();
  });

  it('asDatasetKind accepts known kinds', () => {
    expect(asDatasetKind('tabular')).toBe('tabular');
    expect(asDatasetKind('sim')).toBe('sim');
  });
});

// ─── Protocol enum ────────────────────────────────────────────────────────

describe('PROTOCOL_KINDS', () => {
  it('has 5 values', () => {
    expect(PROTOCOL_KINDS).toHaveLength(5);
  });

  it.each(['method', 'sop', 'analysis', 'code_pipeline', 'other'])(
    'includes %s',
    (k) => {
      expect(PROTOCOL_KINDS).toContain(k);
    },
  );

  it('has labels for every kind', () => {
    for (const k of PROTOCOL_KINDS) {
      expect(PROTOCOL_KIND_LABELS[k]).toBeTruthy();
    }
  });

  it('asProtocolKind type guard works', () => {
    expect(asProtocolKind('sop')).toBe('sop');
    expect(asProtocolKind('xxx')).toBeNull();
    expect(asProtocolKind(undefined)).toBeNull();
  });
});

// ─── datasetMatchesFilter ────────────────────────────────────────────────

describe('datasetMatchesFilter', () => {
  const base = { kind: 'tabular' as DatasetKind, tags: ['rna', 'mouse'], archived: false };

  it('matches when no opts supplied', () => {
    expect(datasetMatchesFilter(base, {})).toBe(true);
  });

  it('rejects on kind mismatch', () => {
    expect(datasetMatchesFilter(base, { kind: 'image' })).toBe(false);
  });

  it('accepts on kind match', () => {
    expect(datasetMatchesFilter(base, { kind: 'tabular' })).toBe(true);
  });

  it('accepts on tag match (case-insensitive)', () => {
    expect(datasetMatchesFilter(base, { tag: 'RNA' })).toBe(true);
  });

  it('rejects on tag miss', () => {
    expect(datasetMatchesFilter(base, { tag: 'human' })).toBe(false);
  });

  it('rejects when archived filter mismatches', () => {
    expect(datasetMatchesFilter(base, { archived: true })).toBe(false);
    expect(datasetMatchesFilter({ ...base, archived: true }, { archived: false })).toBe(false);
  });

  it('passes when archived filter undefined (returns rows of either flag)', () => {
    expect(datasetMatchesFilter(base, {})).toBe(true);
    expect(datasetMatchesFilter({ ...base, archived: true }, {})).toBe(true);
  });
});

// ─── protocolMatchesFilter ───────────────────────────────────────────────

describe('protocolMatchesFilter', () => {
  const base = {
    kind: 'method' as const,
    tags: ['flow-cyto'],
    title: 'Flow cytometry SOP',
    parentProtocolId: null,
  };

  it('matches when no opts supplied (default rootsOnly true)', () => {
    expect(protocolMatchesFilter(base, {})).toBe(true);
  });

  it('rejects a non-root when rootsOnly is on by default', () => {
    expect(
      protocolMatchesFilter({ ...base, parentProtocolId: 'parent-x' }, {}),
    ).toBe(false);
  });

  it('accepts non-root when rootsOnly false explicitly', () => {
    expect(
      protocolMatchesFilter(
        { ...base, parentProtocolId: 'parent-x' },
        { rootsOnly: false },
      ),
    ).toBe(true);
  });

  it('matches q on title (case-insensitive)', () => {
    expect(protocolMatchesFilter(base, { q: 'CYTOMETRY' })).toBe(true);
    expect(protocolMatchesFilter(base, { q: 'unrelated' })).toBe(false);
  });

  it('matches on tag (case-insensitive)', () => {
    expect(protocolMatchesFilter(base, { tag: 'FLOW-CYTO' })).toBe(true);
  });
});

// ─── normalizers ─────────────────────────────────────────────────────────

describe('normalizeDatasetTags', () => {
  it('trims / lowercases / dedupes / drops empties', () => {
    const out = normalizeDatasetTags([' RNA ', 'rna', 'mouse', '', '  ', 'MOUSE']);
    expect(out).toEqual(['rna', 'mouse']);
  });

  it('caps at 32 entries', () => {
    const input = Array.from({ length: 50 }, (_, i) => `tag${i}`);
    expect(normalizeDatasetTags(input)).toHaveLength(32);
  });

  it('returns empty array for non-array input', () => {
    expect(normalizeDatasetTags('not array' as never)).toEqual([]);
    expect(normalizeDatasetTags(null)).toEqual([]);
  });
});

describe('normalizeProtocolTags', () => {
  it('mirrors the dataset shape (trim/lowercase/dedupe)', () => {
    const out = normalizeProtocolTags(['Method', '  method ', 'SOP']);
    expect(out).toEqual(['method', 'sop']);
  });
});

describe('normalizeAttachedUrls', () => {
  it('drops invalid + duplicates + non-http', () => {
    const out = normalizeAttachedUrls([
      'https://example.com',
      'http://other.com',
      'ftp://nope',
      'not a url',
      'https://example.com',
    ]);
    expect(out).toEqual(['https://example.com', 'http://other.com']);
  });

  it('returns empty for non-array', () => {
    expect(normalizeAttachedUrls(undefined as never)).toEqual([]);
  });
});

// ─── URL validators ──────────────────────────────────────────────────────

describe('isValidDatasetUrl', () => {
  it('accepts http(s)', () => {
    expect(isValidDatasetUrl('https://example.com/path')).toBe(true);
    expect(isValidDatasetUrl('http://example.com')).toBe(true);
  });

  it('rejects empty / non-string', () => {
    expect(isValidDatasetUrl('')).toBe(false);
    expect(isValidDatasetUrl(null)).toBe(false);
  });

  it('rejects non-http schemes', () => {
    expect(isValidDatasetUrl('ftp://example.com')).toBe(false);
    expect(isValidDatasetUrl('file:///tmp/x')).toBe(false);
  });
});

// ─── Name / title / version / kind validators ───────────────────────────

describe('validateDatasetName', () => {
  it('rejects empty', () => {
    expect(validateDatasetName('')).toBeTruthy();
    expect(validateDatasetName('   ')).toBeTruthy();
  });
  it('rejects > 200 chars', () => {
    expect(validateDatasetName('a'.repeat(201))).toBeTruthy();
  });
  it('passes a valid name', () => {
    expect(validateDatasetName('Sample dataset')).toBeNull();
  });
  it('rejects non-string', () => {
    expect(validateDatasetName(42 as never)).toBeTruthy();
  });
});

describe('validateDatasetKind', () => {
  it('passes known kinds', () => {
    expect(validateDatasetKind('image')).toBeNull();
  });
  it('rejects unknown', () => {
    expect(validateDatasetKind('xxx')).toBeTruthy();
  });
});

describe('validateProtocolTitle', () => {
  it('rejects empty / oversize', () => {
    expect(validateProtocolTitle('')).toBeTruthy();
    expect(validateProtocolTitle('x'.repeat(201))).toBeTruthy();
  });
  it('passes valid', () => {
    expect(validateProtocolTitle('Lab SOP')).toBeNull();
  });
});

describe('validateProtocolVersion', () => {
  it('rejects empty / oversize', () => {
    expect(validateProtocolVersion('')).toBeTruthy();
    expect(validateProtocolVersion('v'.repeat(61))).toBeTruthy();
  });
  it('passes valid', () => {
    expect(validateProtocolVersion('1.2.0')).toBeNull();
    expect(validateProtocolVersion('2024-05-12')).toBeNull();
  });
});

describe('validateProtocolKind', () => {
  it('passes known', () => {
    expect(validateProtocolKind('analysis')).toBeNull();
  });
  it('rejects unknown', () => {
    expect(validateProtocolKind('zzz')).toBeTruthy();
  });
});

// ─── Version-tree walker ─────────────────────────────────────────────────

function makeProto(o: Partial<Protocol>): Protocol {
  return {
    id: 'p',
    userId: 'u',
    title: 't',
    version: '1.0',
    bodyMd: '',
    kind: 'method',
    attachedUrls: [],
    tags: [],
    parentProtocolId: null,
    metadata: {},
    createdAt: '2026-05-12T00:00:00.000Z',
    updatedAt: '2026-05-12T00:00:00.000Z',
    ...o,
  };
}

describe('buildVersionChain', () => {
  it('returns the whole chain oldest-first when root passed', () => {
    const root = makeProto({ id: 'r', version: '1.0', createdAt: '2026-01-01T00:00:00Z' });
    const v2 = makeProto({
      id: 'v2',
      version: '2.0',
      parentProtocolId: 'r',
      createdAt: '2026-02-01T00:00:00Z',
    });
    const v3 = makeProto({
      id: 'v3',
      version: '3.0',
      parentProtocolId: 'r',
      createdAt: '2026-03-01T00:00:00Z',
    });
    const chain = buildVersionChain([root, v3, v2], 'r');
    expect(chain.map((p) => p.id)).toEqual(['r', 'v2', 'v3']);
  });

  it('returns the chain when a child id is the start', () => {
    const root = makeProto({ id: 'r', version: '1.0', createdAt: '2026-01-01T00:00:00Z' });
    const v2 = makeProto({
      id: 'v2',
      version: '2.0',
      parentProtocolId: 'r',
      createdAt: '2026-02-01T00:00:00Z',
    });
    const chain = buildVersionChain([root, v2], 'v2');
    expect(chain[0].id).toBe('r');
    expect(chain[chain.length - 1].id).toBe('v2');
  });

  it('returns empty when startId not in rows', () => {
    expect(buildVersionChain([], 'missing')).toEqual([]);
  });

  it('handles orphan parent pointers without infinite loop', () => {
    const orphan = makeProto({
      id: 'orphan',
      version: '5.0',
      parentProtocolId: 'gone',
    });
    const chain = buildVersionChain([orphan], 'orphan');
    expect(chain.map((p) => p.id)).toEqual(['orphan']);
  });
});

describe('resolvePinnedVersion', () => {
  const root = makeProto({ id: 'r', version: '1.0' });
  const v2 = makeProto({ id: 'v2', version: '2.0', parentProtocolId: 'r' });
  const chain = [root, v2];

  it('returns the exact-match row', () => {
    expect(resolvePinnedVersion(chain, '2.0')?.id).toBe('v2');
    expect(resolvePinnedVersion(chain, '1.0')?.id).toBe('r');
  });

  it('falls back to the root when version not in tree', () => {
    expect(resolvePinnedVersion(chain, '9.9')?.id).toBe('r');
  });

  it('returns null for empty chain', () => {
    expect(resolvePinnedVersion([], '1.0')).toBeNull();
  });
});

describe('bumpParentFor', () => {
  it('returns the source id for a root', () => {
    expect(bumpParentFor({ id: 'r', parentProtocolId: null })).toBe('r');
  });
  it('returns the existing parent for a child (chain stays flat)', () => {
    expect(bumpParentFor({ id: 'v2', parentProtocolId: 'r' })).toBe('r');
  });
});

// ─── hasAnyExportContent ─────────────────────────────────────────────────

describe('hasAnyExportContent', () => {
  it('returns false on all-zero counts', () => {
    expect(
      hasAnyExportContent({
        notebookEntries: 0,
        hypotheses: 0,
        papers: 0,
        datasets: 0,
        protocols: 0,
      }),
    ).toBe(false);
  });

  it.each([
    ['notebookEntries'],
    ['hypotheses'],
    ['papers'],
    ['datasets'],
    ['protocols'],
  ])('returns true when only %s is non-zero', (key) => {
    const base = {
      notebookEntries: 0,
      hypotheses: 0,
      papers: 0,
      datasets: 0,
      protocols: 0,
    };
    (base as unknown as Record<string, number>)[key] = 1;
    expect(hasAnyExportContent(base)).toBe(true);
  });
});

// ─── PDF helpers ─────────────────────────────────────────────────────────

describe('truncateForPdf', () => {
  it('returns short text unchanged', () => {
    expect(truncateForPdf('short', 100)).toBe('short');
  });

  it('truncates with ellipsis on overlong text', () => {
    const text = 'a '.repeat(500);
    const out = truncateForPdf(text, 50);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out.endsWith('…')).toBe(true);
  });

  it('returns empty for non-string', () => {
    expect(truncateForPdf(null as never, 100)).toBe('');
  });
});

describe('groupReferencesByRelevance', () => {
  it('groups by relevance in the canonical order', () => {
    const rows: ExperimentPdfReferenceRow[] = [
      { paperTitle: 'A', authors: '', venueYear: '', identifier: '', relevance: 'builds_on' },
      { paperTitle: 'B', authors: '', venueYear: '', identifier: '', relevance: 'cites' },
      { paperTitle: 'C', authors: '', venueYear: '', identifier: '', relevance: 'methods' },
      { paperTitle: 'D', authors: '', venueYear: '', identifier: '', relevance: 'cites' },
    ];
    const grouped = groupReferencesByRelevance(rows);
    expect(grouped.map((g) => g.relevance)).toEqual([
      'cites',
      'methods',
      'builds_on',
    ]);
    expect(grouped[0].rows).toHaveLength(2);
  });

  it('returns empty array when no references', () => {
    expect(groupReferencesByRelevance([])).toEqual([]);
  });
});

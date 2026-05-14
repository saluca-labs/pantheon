/**
 * Research OS Wave D — hypothesis-workspace pure-helper tests.
 *
 * Locks the grouping / ordering / filtering logic under the Hypothesis
 * Ledger workspace: status-lane ordering, the open-work subset, the
 * two-axis (status chip + text query) filter, status grouping, and the
 * per-status count map.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { describe, it, expect } from 'vitest';
import type { Hypothesis } from '@/lib/agentic-os/research/hypotheses';
import {
  HYPOTHESIS_STATUS_ORDER,
  OPEN_HYPOTHESIS_STATUSES,
  isOpenHypothesis,
  hypothesisMatchesQuery,
  filterHypotheses,
  groupHypothesesByStatus,
  countHypothesesByStatus,
  hypothesisStatusLabel,
} from '@/lib/agentic-os/research/hypothesis-workspace';

function mkHyp(overrides: Partial<Hypothesis> = {}): Hypothesis {
  return {
    id: 'hyp-1',
    userId: 'u-1',
    title: 'Temperature affects yield',
    ifClause: 'temperature exceeds 37C',
    thenClause: 'yield drops by 20 percent',
    becauseClause: 'denaturation of the active site',
    status: 'active',
    confidence: 'medium',
    tags: ['biochem', 'enzymes'],
    experimentIds: [],
    descriptionMd: '',
    archivedAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('HYPOTHESIS_STATUS_ORDER', () => {
  it('puts in-flight lanes (active/testing/draft) before resolved + archived', () => {
    expect(HYPOTHESIS_STATUS_ORDER).toEqual([
      'active',
      'testing',
      'draft',
      'supported',
      'refuted',
      'inconclusive',
      'archived',
    ]);
  });
});

describe('isOpenHypothesis() / OPEN_HYPOTHESIS_STATUSES', () => {
  it('treats draft / active / testing as open', () => {
    for (const status of ['draft', 'active', 'testing'] as const) {
      expect(OPEN_HYPOTHESIS_STATUSES.has(status)).toBe(true);
      expect(isOpenHypothesis(mkHyp({ status }))).toBe(true);
    }
  });
  it('treats supported / refuted / inconclusive / archived as not open', () => {
    for (const status of [
      'supported',
      'refuted',
      'inconclusive',
      'archived',
    ] as const) {
      expect(isOpenHypothesis(mkHyp({ status }))).toBe(false);
    }
  });
});

describe('hypothesisStatusLabel()', () => {
  it('returns the canonical label', () => {
    expect(hypothesisStatusLabel('inconclusive')).toBe('Inconclusive');
    expect(hypothesisStatusLabel('draft')).toBe('Draft');
  });
});

describe('hypothesisMatchesQuery()', () => {
  it('matches on title, clauses, and tags case-insensitively', () => {
    const h = mkHyp();
    expect(hypothesisMatchesQuery(h, 'TEMPERATURE')).toBe(true);
    expect(hypothesisMatchesQuery(h, 'denaturation')).toBe(true);
    expect(hypothesisMatchesQuery(h, 'yield drops')).toBe(true);
    expect(hypothesisMatchesQuery(h, 'enzymes')).toBe(true);
  });
  it('empty query matches everything', () => {
    expect(hypothesisMatchesQuery(mkHyp(), '   ')).toBe(true);
  });
  it('non-matching query returns false', () => {
    expect(hypothesisMatchesQuery(mkHyp(), 'quantum chromodynamics')).toBe(false);
  });
});

describe('filterHypotheses()', () => {
  const list = [
    mkHyp({ id: 'a', status: 'active', title: 'Alpha' }),
    mkHyp({ id: 'b', status: 'testing', title: 'Beta' }),
    mkHyp({ id: 'c', status: 'archived', title: 'Gamma' }),
  ];

  it('status=all + empty query returns everything', () => {
    expect(filterHypotheses(list, 'all', '').map((h) => h.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
  it('narrows by status chip', () => {
    expect(filterHypotheses(list, 'testing', '').map((h) => h.id)).toEqual(['b']);
  });
  it('narrows by text query', () => {
    expect(filterHypotheses(list, 'all', 'gamma').map((h) => h.id)).toEqual(['c']);
  });
  it('applies both axes together', () => {
    expect(filterHypotheses(list, 'active', 'beta')).toEqual([]);
  });
});

describe('groupHypothesesByStatus()', () => {
  it('groups into lanes in HYPOTHESIS_STATUS_ORDER and drops empty lanes', () => {
    const groups = groupHypothesesByStatus([
      mkHyp({ id: 'a', status: 'archived' }),
      mkHyp({ id: 'b', status: 'active' }),
      mkHyp({ id: 'c', status: 'active' }),
    ]);
    expect(groups.map((g) => g.status)).toEqual(['active', 'archived']);
    expect(groups[0]!.hypotheses.map((h) => h.id)).toEqual(['b', 'c']);
    expect(groups[1]!.hypotheses.map((h) => h.id)).toEqual(['a']);
  });
  it('returns [] for an empty list', () => {
    expect(groupHypothesesByStatus([])).toEqual([]);
  });
});

describe('countHypothesesByStatus()', () => {
  it('counts each status, zero-filling absent ones', () => {
    const counts = countHypothesesByStatus([
      mkHyp({ status: 'active' }),
      mkHyp({ status: 'active' }),
      mkHyp({ status: 'testing' }),
    ]);
    expect(counts.active).toBe(2);
    expect(counts.testing).toBe(1);
    expect(counts.draft).toBe(0);
    expect(counts.archived).toBe(0);
  });
});

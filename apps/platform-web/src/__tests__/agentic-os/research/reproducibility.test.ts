/**
 * Research OS Phase 6 — reproducibility domain pure-helper tests.
 *
 * Locks the 5-state taxonomy, the 7 canonical item_keys, the score
 * computation (done / scored-total with not_applicable + waived
 * excluded), the null-when-empty edge case, and the item_key
 * regex/length validation.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  REPRO_STATE_VALUES,
  CANONICAL_REPRO_ITEM_KEYS,
  validateReproItemKey,
  validateReproState,
  asReproState,
  computeReproRollup,
  blockingReproItems,
  reproItemKeyLabel,
  type ReproCheck,
  type ReproState,
} from '@/lib/agentic-os/research/reproducibility';

function mkItem(state: ReproState, itemKey = 'item_x'): ReproCheck {
  return {
    id: `id-${itemKey}-${state}`,
    experimentId: 'exp-1',
    userId: 'u-1',
    itemKey,
    state,
    evidenceUrl: null,
    notes: null,
    completedAt: state === 'done' ? '2026-05-12T10:00:00.000Z' : null,
    metadata: {},
    createdAt: '2026-05-12T10:00:00.000Z',
    updatedAt: '2026-05-12T10:00:00.000Z',
  };
}

describe('REPRO_STATE_VALUES', () => {
  it('locks the 5 states', () => {
    expect([...REPRO_STATE_VALUES]).toEqual([
      'pending',
      'in_progress',
      'done',
      'not_applicable',
      'waived',
    ]);
  });
});

describe('CANONICAL_REPRO_ITEM_KEYS', () => {
  it('locks the 7 canonical keys', () => {
    expect([...CANONICAL_REPRO_ITEM_KEYS]).toEqual([
      'raw_data_archived',
      'methods_pinned',
      'code_published',
      'preregistration_filed',
      'ethics_filed',
      'data_dictionary_written',
      'analysis_reproducible',
    ]);
  });
});

describe('validateReproItemKey()', () => {
  it('accepts canonical keys', () => {
    for (const k of CANONICAL_REPRO_ITEM_KEYS) {
      expect(validateReproItemKey(k)).toBeNull();
    }
  });
  it('accepts custom keys matching the regex', () => {
    expect(validateReproItemKey('custom_item_42')).toBeNull();
    expect(validateReproItemKey('only_lowercase')).toBeNull();
    expect(validateReproItemKey('with_99_digits')).toBeNull();
  });
  it('rejects uppercase letters', () => {
    expect(validateReproItemKey('bad-Key')).toMatch(/\^\[a-z0-9_\]\+\$/);
    expect(validateReproItemKey('PascalCase')).toMatch(/\^\[a-z0-9_\]\+\$/);
  });
  it('rejects dashes / spaces / dots', () => {
    expect(validateReproItemKey('with-dashes')).toMatch(/\^\[a-z0-9_\]\+\$/);
    expect(validateReproItemKey('with space')).toMatch(/\^\[a-z0-9_\]\+\$/);
    expect(validateReproItemKey('with.dots')).toMatch(/\^\[a-z0-9_\]\+\$/);
  });
  it('rejects empty string', () => {
    expect(validateReproItemKey('')).toMatch(/required/);
  });
  it('rejects > 60 chars', () => {
    expect(validateReproItemKey('a'.repeat(61))).toMatch(/60/);
  });
  it('rejects non-string', () => {
    expect(validateReproItemKey(42)).toMatch(/string/);
  });
});

describe('validateReproState() / asReproState()', () => {
  it('accepts each state', () => {
    for (const s of REPRO_STATE_VALUES) {
      expect(validateReproState(s)).toBeNull();
      expect(asReproState(s)).toBe(s);
    }
  });
  it('rejects unknown values', () => {
    expect(validateReproState('garbage')).toMatch(/state must be one of/);
    expect(asReproState('garbage')).toBeNull();
  });
});

describe('reproItemKeyLabel()', () => {
  it('returns locked label for canonical keys', () => {
    expect(reproItemKeyLabel('raw_data_archived')).toBe('Raw data archived');
    expect(reproItemKeyLabel('analysis_reproducible')).toBe('Analysis reproducible');
  });
  it('humanizes custom keys (replace _ with space, capitalize)', () => {
    expect(reproItemKeyLabel('my_custom_thing')).toBe('My custom thing');
  });
});

describe('computeReproRollup()', () => {
  it('returns null score when the denominator is zero (empty list)', () => {
    const r = computeReproRollup([]);
    expect(r.score).toBeNull();
    expect(r.scoredTotal).toBe(0);
  });

  it('returns null score when every row is excluded', () => {
    const r = computeReproRollup([
      mkItem('not_applicable', 'a'),
      mkItem('waived', 'b'),
    ]);
    expect(r.score).toBeNull();
    expect(r.scoredTotal).toBe(0);
    expect(r.notApplicable).toBe(1);
    expect(r.waived).toBe(1);
  });

  it('computes 2 done + 1 in_progress + 1 pending → 2/4 = 0.50', () => {
    const r = computeReproRollup([
      mkItem('done', 'a'),
      mkItem('done', 'b'),
      mkItem('in_progress', 'c'),
      mkItem('pending', 'd'),
    ]);
    expect(r.score).toBe(0.5);
    expect(r.done).toBe(2);
    expect(r.inProgress).toBe(1);
    expect(r.pending).toBe(1);
    expect(r.scoredTotal).toBe(4);
  });

  it('excludes not_applicable + waived from numerator + denominator', () => {
    const r = computeReproRollup([
      mkItem('done', 'a'),
      mkItem('done', 'b'),
      mkItem('pending', 'c'),
      mkItem('not_applicable', 'd'),
      mkItem('waived', 'e'),
    ]);
    // 2 done out of (2 done + 1 pending) = 2/3
    expect(r.score).toBeCloseTo(2 / 3, 6);
    expect(r.scoredTotal).toBe(3);
    expect(r.notApplicable).toBe(1);
    expect(r.waived).toBe(1);
  });

  it('returns 1.0 when every scored row is done', () => {
    const r = computeReproRollup([
      mkItem('done', 'a'),
      mkItem('done', 'b'),
      mkItem('not_applicable', 'c'),
    ]);
    expect(r.score).toBe(1);
  });

  it('returns 0.0 when nothing is done but scored is non-empty', () => {
    const r = computeReproRollup([
      mkItem('pending', 'a'),
      mkItem('in_progress', 'b'),
    ]);
    expect(r.score).toBe(0);
  });
});

describe('blockingReproItems()', () => {
  it('returns only pending + in_progress entries (not done/not_applicable/waived)', () => {
    const list = [
      mkItem('done', 'a'),
      mkItem('pending', 'b'),
      mkItem('in_progress', 'c'),
      mkItem('not_applicable', 'd'),
      mkItem('waived', 'e'),
    ];
    const blocking = blockingReproItems(list);
    expect(blocking.map((i) => i.itemKey).sort()).toEqual(['b', 'c']);
  });

  it('is sorted by itemKey ascending', () => {
    const list = [
      mkItem('pending', 'zzz'),
      mkItem('in_progress', 'aaa'),
      mkItem('pending', 'mmm'),
    ];
    expect(blockingReproItems(list).map((i) => i.itemKey)).toEqual([
      'aaa',
      'mmm',
      'zzz',
    ]);
  });
});

/**
 * Research OS Wave D — reproducibility checklist-view helper tests.
 *
 * Locks the sectioning + progress logic under the reproducibility
 * checklist UI: state→section mapping, the three-section build (with
 * empty sections retained + label sort), and the progress fraction
 * (done / scored, zero-safe).
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { describe, it, expect } from 'vitest';
import type { ReproCheck, ReproState } from '@/lib/agentic-os/research/reproducibility';
import {
  reproSectionForState,
  buildReproChecklistSections,
  reproChecklistProgress,
} from '@/lib/agentic-os/research/reproducibility-checklist-view';

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

describe('reproSectionForState()', () => {
  it('maps pending + in_progress to outstanding', () => {
    expect(reproSectionForState('pending')).toBe('outstanding');
    expect(reproSectionForState('in_progress')).toBe('outstanding');
  });
  it('maps done to done', () => {
    expect(reproSectionForState('done')).toBe('done');
  });
  it('maps not_applicable + waived to excluded', () => {
    expect(reproSectionForState('not_applicable')).toBe('excluded');
    expect(reproSectionForState('waived')).toBe('excluded');
  });
});

describe('buildReproChecklistSections()', () => {
  it('always returns the three sections in order, even when empty', () => {
    const sections = buildReproChecklistSections([]);
    expect(sections.map((s) => s.key)).toEqual([
      'outstanding',
      'done',
      'excluded',
    ]);
    expect(sections.every((s) => s.items.length === 0)).toBe(true);
  });

  it('routes items into the right sections', () => {
    const sections = buildReproChecklistSections([
      mkItem('pending', 'a'),
      mkItem('in_progress', 'b'),
      mkItem('done', 'c'),
      mkItem('not_applicable', 'd'),
      mkItem('waived', 'e'),
    ]);
    const byKey = Object.fromEntries(sections.map((s) => [s.key, s.items]));
    expect(byKey.outstanding!.map((i) => i.itemKey).sort()).toEqual(['a', 'b']);
    expect(byKey.done!.map((i) => i.itemKey)).toEqual(['c']);
    expect(byKey.excluded!.map((i) => i.itemKey).sort()).toEqual(['d', 'e']);
  });

  it('sorts within a section by humanized label', () => {
    const sections = buildReproChecklistSections([
      mkItem('pending', 'raw_data_archived'), // "Raw data archived"
      mkItem('pending', 'analysis_reproducible'), // "Analysis reproducible"
    ]);
    const outstanding = sections.find((s) => s.key === 'outstanding')!;
    expect(outstanding.items.map((i) => i.itemKey)).toEqual([
      'analysis_reproducible',
      'raw_data_archived',
    ]);
  });
});

describe('reproChecklistProgress()', () => {
  it('returns zero progress for an empty list', () => {
    expect(reproChecklistProgress([])).toEqual({
      done: 0,
      scoredTotal: 0,
      fraction: 0,
    });
  });

  it('counts done / scored, excluding not_applicable + waived', () => {
    const p = reproChecklistProgress([
      mkItem('done', 'a'),
      mkItem('done', 'b'),
      mkItem('in_progress', 'c'),
      mkItem('pending', 'd'),
      mkItem('not_applicable', 'e'),
      mkItem('waived', 'f'),
    ]);
    expect(p.done).toBe(2);
    expect(p.scoredTotal).toBe(4);
    expect(p.fraction).toBe(0.5);
  });

  it('is zero-safe when every row is excluded', () => {
    const p = reproChecklistProgress([
      mkItem('not_applicable', 'a'),
      mkItem('waived', 'b'),
    ]);
    expect(p.scoredTotal).toBe(0);
    expect(p.fraction).toBe(0);
  });
});

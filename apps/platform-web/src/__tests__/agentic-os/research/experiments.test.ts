/**
 * Research OS — unit tests for experiments.ts (status taxonomy + phase
 * helpers + filter helpers).
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  EXPERIMENT_STATUSES,
  EXPERIMENT_STATUS_LABELS,
  EXPERIMENT_PHASES,
  EXPERIMENT_PHASE_LABELS,
  coercePhaseProgress,
  phaseProgressDefault,
  experimentPhaseAvg,
  experimentSlug,
  validateExperimentStatus,
  validatePhaseProgress,
  applyExperimentFilters,
} from '@/lib/agentic-os/research/experiments';
import type {
  ExperimentPhase,
  ExperimentStatus,
  PhaseProgress,
  ResearchExperimentForFilter,
} from '@/lib/agentic-os/research/experiments';

// ─── EXPERIMENT_STATUSES ─────────────────────────────────────────────────────

describe('EXPERIMENT_STATUSES', () => {
  it('contains exactly the 6 locked values', () => {
    expect(EXPERIMENT_STATUSES).toHaveLength(6);
    for (const s of [
      'planning',
      'running',
      'analysis',
      'writeup',
      'published',
      'archived',
    ]) {
      expect(EXPERIMENT_STATUSES).toContain(s as ExperimentStatus);
    }
  });

  it('does not contain the legacy planned/done values', () => {
    expect(EXPERIMENT_STATUSES).not.toContain('planned' as any);
    expect(EXPERIMENT_STATUSES).not.toContain('done' as any);
  });

  it('has a label for every status', () => {
    for (const s of EXPERIMENT_STATUSES) {
      expect(EXPERIMENT_STATUS_LABELS[s]).toBeTruthy();
    }
  });

  it('label map keys match the status list exactly', () => {
    const keys = Object.keys(EXPERIMENT_STATUS_LABELS).sort();
    expect(keys).toEqual([...EXPERIMENT_STATUSES].sort());
  });
});

// ─── validateExperimentStatus ────────────────────────────────────────────────

describe('validateExperimentStatus', () => {
  it('returns null for every valid status', () => {
    for (const s of EXPERIMENT_STATUSES) {
      expect(validateExperimentStatus(s)).toBeNull();
    }
  });

  it('returns an error for legacy values (planned / done)', () => {
    expect(validateExperimentStatus('planned')).not.toBeNull();
    expect(validateExperimentStatus('done')).not.toBeNull();
  });

  it('error message lists the new taxonomy', () => {
    const err = validateExperimentStatus('shipping');
    expect(err).toContain('planning');
    expect(err).toContain('published');
  });

  it('rejects non-string input', () => {
    expect(validateExperimentStatus(42)).not.toBeNull();
    expect(validateExperimentStatus(null)).not.toBeNull();
    expect(validateExperimentStatus(undefined)).not.toBeNull();
    expect(validateExperimentStatus({})).not.toBeNull();
  });
});

// ─── EXPERIMENT_PHASES ───────────────────────────────────────────────────────

describe('EXPERIMENT_PHASES', () => {
  it('contains the 5 non-archived phases', () => {
    expect(EXPERIMENT_PHASES).toHaveLength(5);
    expect(EXPERIMENT_PHASES).not.toContain('archived' as any);
    for (const k of ['planning', 'running', 'analysis', 'writeup', 'published']) {
      expect(EXPERIMENT_PHASES).toContain(k as ExperimentPhase);
    }
  });

  it('has a human label for every phase', () => {
    for (const k of EXPERIMENT_PHASES) {
      expect(EXPERIMENT_PHASE_LABELS[k]).toBeTruthy();
    }
  });
});

// ─── phaseProgressDefault / coercePhaseProgress ─────────────────────────────

describe('phaseProgressDefault', () => {
  it('returns all zeros for every phase', () => {
    const p = phaseProgressDefault();
    for (const k of EXPERIMENT_PHASES) {
      expect(p[k]).toBe(0);
    }
  });
});

describe('coercePhaseProgress', () => {
  it('fills missing keys with 0', () => {
    const p = coercePhaseProgress({ planning: 25 });
    expect(p.planning).toBe(25);
    expect(p.analysis).toBe(0);
    expect(p.published).toBe(0);
  });

  it('clamps to 0..100', () => {
    const p = coercePhaseProgress({ planning: -10, published: 150 });
    expect(p.planning).toBe(0);
    expect(p.published).toBe(100);
  });

  it('rounds floats to integers', () => {
    const p = coercePhaseProgress({ analysis: 42.7 });
    expect(p.analysis).toBe(43);
  });

  it('ignores non-numeric values', () => {
    const p = coercePhaseProgress({ analysis: 'high' as any, writeup: NaN });
    expect(p.analysis).toBe(0);
    expect(p.writeup).toBe(0);
  });

  it('handles non-object input', () => {
    expect(coercePhaseProgress(null)).toEqual(phaseProgressDefault());
    expect(coercePhaseProgress(undefined)).toEqual(phaseProgressDefault());
    expect(coercePhaseProgress('nope')).toEqual(phaseProgressDefault());
    expect(coercePhaseProgress(42)).toEqual(phaseProgressDefault());
  });

  it('roundtrips a full object unchanged', () => {
    const full: PhaseProgress = {
      planning: 100,
      running: 80,
      analysis: 60,
      writeup: 40,
      published: 20,
    };
    expect(coercePhaseProgress(full)).toEqual(full);
  });

  it('ignores unknown keys silently', () => {
    const p = coercePhaseProgress({ planning: 10, archived: 99 } as any);
    expect(p.planning).toBe(10);
    expect((p as any).archived).toBeUndefined();
  });
});

// ─── validatePhaseProgress ───────────────────────────────────────────────────

describe('validatePhaseProgress', () => {
  it('accepts an empty object (all phases default to 0)', () => {
    const r = validatePhaseProgress({});
    expect(r.ok).toBe(true);
    if (r.ok) {
      for (const k of EXPERIMENT_PHASES) expect(r.value[k]).toBe(0);
    }
  });

  it('accepts a partial object and fills missing keys with 0', () => {
    const r = validatePhaseProgress({ planning: 30, analysis: 10 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.planning).toBe(30);
      expect(r.value.analysis).toBe(10);
      expect(r.value.published).toBe(0);
    }
  });

  it('rejects null', () => {
    expect(validatePhaseProgress(null).ok).toBe(false);
  });

  it('rejects a non-object (string, number, array)', () => {
    expect(validatePhaseProgress('hello').ok).toBe(false);
    expect(validatePhaseProgress(42).ok).toBe(false);
    expect(validatePhaseProgress([1, 2, 3]).ok).toBe(false);
  });

  it('rejects unknown phase keys', () => {
    const r = validatePhaseProgress({ archived: 50 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('archived');
  });

  it('rejects non-integer values', () => {
    const r = validatePhaseProgress({ planning: 42.5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('integer');
  });

  it('rejects out-of-range values (negative)', () => {
    expect(validatePhaseProgress({ planning: -5 }).ok).toBe(false);
  });

  it('rejects out-of-range values (>100)', () => {
    expect(validatePhaseProgress({ planning: 200 }).ok).toBe(false);
  });

  it('rejects non-numeric values', () => {
    expect(validatePhaseProgress({ planning: 'high' }).ok).toBe(false);
  });

  it('rejects NaN', () => {
    expect(validatePhaseProgress({ planning: Number.NaN }).ok).toBe(false);
  });

  it('accepts boundary values 0 and 100', () => {
    expect(validatePhaseProgress({ planning: 0 }).ok).toBe(true);
    expect(validatePhaseProgress({ planning: 100 }).ok).toBe(true);
  });
});

// ─── experimentPhaseAvg ──────────────────────────────────────────────────────

describe('experimentPhaseAvg', () => {
  it('returns 0 for an empty/default progress', () => {
    expect(experimentPhaseAvg(phaseProgressDefault())).toBe(0);
    expect(experimentPhaseAvg({})).toBe(0);
  });

  it('returns 100 when every phase is 100', () => {
    const full: PhaseProgress = {
      planning: 100,
      running: 100,
      analysis: 100,
      writeup: 100,
      published: 100,
    };
    expect(experimentPhaseAvg(full)).toBe(100);
  });

  it('averages partial progress across all 5 phases', () => {
    // Phase sum = 100+50+50+0+0 = 200 / 5 = 40
    const partial: PhaseProgress = {
      planning: 100,
      running: 50,
      analysis: 50,
      writeup: 0,
      published: 0,
    };
    expect(experimentPhaseAvg(partial)).toBe(40);
  });

  it('coerces raw JSONB-ish input before averaging', () => {
    // missing analysis etc, plus a float — coerces then averages
    // 70 + 15 = 85 / 5 = 17
    expect(experimentPhaseAvg({ planning: 70.4, running: 14.5 })).toBe(
      Math.round((70 + 15) / 5),
    );
  });
});

// ─── experimentSlug ──────────────────────────────────────────────────────────

describe('experimentSlug', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(experimentSlug('Enzyme Activity Sweep v2')).toBe('enzyme-activity-sweep-v2');
  });

  it('collapses multiple non-alphanumeric chars', () => {
    expect(experimentSlug('My  Experiment -- 2024')).toBe('my-experiment-2024');
  });

  it('strips leading/trailing hyphens', () => {
    expect(experimentSlug(' test ')).toBe('test');
  });

  it('handles numeric-only names', () => {
    expect(experimentSlug('007')).toBe('007');
  });
});

// ─── applyExperimentFilters ──────────────────────────────────────────────────

function makeExp(
  overrides: Partial<ResearchExperimentForFilter> = {},
): ResearchExperimentForFilter {
  return {
    name: 'Untitled',
    status: 'planning',
    tags: [],
    archivedAt: null,
    targetCompletionDate: null,
    createdAt: '2026-05-11T00:00:00Z',
    ...overrides,
  };
}

describe('applyExperimentFilters', () => {
  it('hides archived rows by default', () => {
    const rows = [
      makeExp({ name: 'A', archivedAt: null }),
      makeExp({ name: 'B', archivedAt: '2026-05-01T00:00:00Z' }),
    ];
    const r = applyExperimentFilters(rows, { status: 'all', sort: 'created' });
    expect(r.map((x) => x.name)).toEqual(['A']);
  });

  it('shows only archived rows when archived=true', () => {
    const rows = [
      makeExp({ name: 'A', archivedAt: null }),
      makeExp({ name: 'B', archivedAt: '2026-05-01T00:00:00Z' }),
    ];
    const r = applyExperimentFilters(rows, { status: 'all', sort: 'created', archived: true });
    expect(r.map((x) => x.name)).toEqual(['B']);
  });

  it('shows only active rows when archived=false', () => {
    const rows = [
      makeExp({ name: 'A', archivedAt: null }),
      makeExp({ name: 'B', archivedAt: '2026-05-01T00:00:00Z' }),
    ];
    const r = applyExperimentFilters(rows, { status: 'all', sort: 'created', archived: false });
    expect(r.map((x) => x.name)).toEqual(['A']);
  });

  it('filters by status', () => {
    const rows = [
      makeExp({ name: 'A', status: 'planning' }),
      makeExp({ name: 'B', status: 'running' }),
      makeExp({ name: 'C', status: 'analysis' }),
    ];
    const r = applyExperimentFilters(rows, { status: 'running', sort: 'created' });
    expect(r.map((x) => x.name)).toEqual(['B']);
  });

  it('filters by tag (case-insensitive)', () => {
    const rows = [
      makeExp({ name: 'A', tags: ['biology'] }),
      makeExp({ name: 'B', tags: ['CHEMISTRY'] }),
    ];
    const r = applyExperimentFilters(rows, { status: 'all', sort: 'created', tag: 'chemistry' });
    expect(r.map((x) => x.name)).toEqual(['B']);
  });

  it('sorts by name', () => {
    const rows = [
      makeExp({ name: 'Charlie' }),
      makeExp({ name: 'Alpha' }),
      makeExp({ name: 'Bravo' }),
    ];
    const r = applyExperimentFilters(rows, { status: 'all', sort: 'name' });
    expect(r.map((x) => x.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('sorts by created (DESC)', () => {
    const rows = [
      makeExp({ name: 'A', createdAt: '2026-05-01T00:00:00Z' }),
      makeExp({ name: 'B', createdAt: '2026-05-10T00:00:00Z' }),
      makeExp({ name: 'C', createdAt: '2026-05-05T00:00:00Z' }),
    ];
    const r = applyExperimentFilters(rows, { status: 'all', sort: 'created' });
    expect(r.map((x) => x.name)).toEqual(['B', 'C', 'A']);
  });

  it('sorts by target date (nulls last)', () => {
    const rows = [
      makeExp({ name: 'no-date' }),
      makeExp({ name: 'late', targetCompletionDate: '2026-12-31' }),
      makeExp({ name: 'early', targetCompletionDate: '2026-06-01' }),
    ];
    const r = applyExperimentFilters(rows, { status: 'all', sort: 'target' });
    expect(r.map((x) => x.name)).toEqual(['early', 'late', 'no-date']);
  });

  it('returns a new array (does not mutate input)', () => {
    const rows = [makeExp({ name: 'A' }), makeExp({ name: 'B' })];
    const r = applyExperimentFilters(rows, { status: 'all', sort: 'name' });
    expect(r).not.toBe(rows);
  });
});

// ─── Status / phase round-trip ───────────────────────────────────────────────

describe('status / phase round-trip', () => {
  it('every status has a non-empty human label', () => {
    for (const s of EXPERIMENT_STATUSES) {
      expect(EXPERIMENT_STATUS_LABELS[s].length).toBeGreaterThan(0);
    }
  });

  it('every phase appears in the status list (archived is the one extra)', () => {
    for (const p of EXPERIMENT_PHASES) {
      expect(EXPERIMENT_STATUSES).toContain(p as ExperimentStatus);
    }
    const extras = EXPERIMENT_STATUSES.filter(
      (s) => !(EXPERIMENT_PHASES as readonly string[]).includes(s),
    );
    expect(extras).toEqual(['archived']);
  });
});

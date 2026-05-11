/**
 * Maker OS — unit tests for projects.ts (status taxonomy + phase helpers).
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  MAKER_PHASES,
  MAKER_PHASE_LABELS,
  coercePhaseProgress,
  phaseProgressDefault,
  projectPhaseAvg,
  projectSlug,
  validateProjectStatus,
  validatePhaseProgress,
} from '@/lib/agentic-os/maker/projects';
import type {
  MakerPhase,
  PhaseProgress,
  ProjectStatus,
} from '@/lib/agentic-os/maker/projects';

// ─── PROJECT_STATUSES ────────────────────────────────────────────────────────

describe('PROJECT_STATUSES', () => {
  it('contains exactly the 8 locked values', () => {
    expect(PROJECT_STATUSES).toHaveLength(8);
    for (const s of [
      'concept',
      'design',
      'procurement',
      'fabrication',
      'assembly',
      'commissioning',
      'done',
      'archived',
    ]) {
      expect(PROJECT_STATUSES).toContain(s as ProjectStatus);
    }
  });

  it('has a label for every status', () => {
    for (const s of PROJECT_STATUSES) {
      expect(PROJECT_STATUS_LABELS[s]).toBeTruthy();
    }
  });
});

describe('validateProjectStatus', () => {
  it('returns null for every valid status', () => {
    for (const s of PROJECT_STATUSES) {
      expect(validateProjectStatus(s)).toBeNull();
    }
  });

  it('returns an error for legacy values (planning / in_progress)', () => {
    expect(validateProjectStatus('planning')).not.toBeNull();
    expect(validateProjectStatus('in_progress')).not.toBeNull();
  });

  it('error message lists the new taxonomy', () => {
    const err = validateProjectStatus('shipping');
    expect(err).toContain('concept');
    expect(err).toContain('fabrication');
  });

  it('rejects non-string input', () => {
    expect(validateProjectStatus(42)).not.toBeNull();
    expect(validateProjectStatus(null)).not.toBeNull();
    expect(validateProjectStatus(undefined)).not.toBeNull();
  });
});

// ─── MAKER_PHASES ────────────────────────────────────────────────────────────

describe('MAKER_PHASES', () => {
  it('contains the 7 non-archived phases', () => {
    expect(MAKER_PHASES).toHaveLength(7);
    expect(MAKER_PHASES).not.toContain('archived' as any);
    for (const k of [
      'concept',
      'design',
      'procurement',
      'fabrication',
      'assembly',
      'commissioning',
      'done',
    ]) {
      expect(MAKER_PHASES).toContain(k as MakerPhase);
    }
  });

  it('has a human label for every phase', () => {
    for (const k of MAKER_PHASES) {
      expect(MAKER_PHASE_LABELS[k]).toBeTruthy();
    }
  });
});

// ─── phaseProgressDefault / coercePhaseProgress ─────────────────────────────

describe('phaseProgressDefault', () => {
  it('returns all zeros for every phase', () => {
    const p = phaseProgressDefault();
    for (const k of MAKER_PHASES) {
      expect(p[k]).toBe(0);
    }
  });
});

describe('coercePhaseProgress', () => {
  it('fills missing keys with 0', () => {
    const p = coercePhaseProgress({ concept: 25 });
    expect(p.concept).toBe(25);
    expect(p.fabrication).toBe(0);
    expect(p.done).toBe(0);
  });

  it('clamps to 0..100', () => {
    const p = coercePhaseProgress({ concept: -10, fabrication: 150 });
    expect(p.concept).toBe(0);
    expect(p.fabrication).toBe(100);
  });

  it('rounds floats to integers', () => {
    const p = coercePhaseProgress({ design: 42.7 });
    expect(p.design).toBe(43);
  });

  it('ignores non-numeric values', () => {
    const p = coercePhaseProgress({ design: 'high' as any, fabrication: NaN });
    expect(p.design).toBe(0);
    expect(p.fabrication).toBe(0);
  });

  it('handles non-object input', () => {
    expect(coercePhaseProgress(null)).toEqual(phaseProgressDefault());
    expect(coercePhaseProgress(undefined)).toEqual(phaseProgressDefault());
    expect(coercePhaseProgress('nope')).toEqual(phaseProgressDefault());
    expect(coercePhaseProgress(42)).toEqual(phaseProgressDefault());
  });

  it('roundtrips a full object unchanged', () => {
    const full: PhaseProgress = {
      concept: 100,
      design: 80,
      procurement: 60,
      fabrication: 40,
      assembly: 20,
      commissioning: 10,
      done: 0,
    };
    expect(coercePhaseProgress(full)).toEqual(full);
  });
});

// ─── validatePhaseProgress ───────────────────────────────────────────────────

describe('validatePhaseProgress', () => {
  it('accepts an empty object (all phases default to 0)', () => {
    const r = validatePhaseProgress({});
    expect(r.ok).toBe(true);
    if (r.ok) {
      for (const k of MAKER_PHASES) expect(r.value[k]).toBe(0);
    }
  });

  it('accepts a partial object and fills missing keys with 0', () => {
    const r = validatePhaseProgress({ concept: 30, design: 10 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.concept).toBe(30);
      expect(r.value.design).toBe(10);
      expect(r.value.done).toBe(0);
    }
  });

  it('rejects null', () => {
    const r = validatePhaseProgress(null);
    expect(r.ok).toBe(false);
  });

  it('rejects a non-object (string, number, array)', () => {
    expect(validatePhaseProgress('hello').ok).toBe(false);
    expect(validatePhaseProgress(42).ok).toBe(false);
    expect(validatePhaseProgress([1, 2, 3]).ok).toBe(false);
  });

  it('rejects unknown phase keys', () => {
    const r = validatePhaseProgress({ planning: 50 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('planning');
  });

  it('rejects non-integer values', () => {
    const r = validatePhaseProgress({ concept: 42.5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('integer');
  });

  it('rejects out-of-range values (negative)', () => {
    const r = validatePhaseProgress({ concept: -5 });
    expect(r.ok).toBe(false);
  });

  it('rejects out-of-range values (>100)', () => {
    const r = validatePhaseProgress({ concept: 200 });
    expect(r.ok).toBe(false);
  });

  it('rejects non-numeric values', () => {
    const r = validatePhaseProgress({ concept: 'high' });
    expect(r.ok).toBe(false);
  });

  it('accepts boundary values 0 and 100', () => {
    expect(validatePhaseProgress({ concept: 0 }).ok).toBe(true);
    expect(validatePhaseProgress({ concept: 100 }).ok).toBe(true);
  });
});

// ─── projectPhaseAvg ─────────────────────────────────────────────────────────

describe('projectPhaseAvg', () => {
  it('returns 0 for an empty/default progress', () => {
    expect(projectPhaseAvg(phaseProgressDefault())).toBe(0);
    expect(projectPhaseAvg({})).toBe(0);
  });

  it('returns 100 when every phase is 100', () => {
    const full: PhaseProgress = {
      concept: 100,
      design: 100,
      procurement: 100,
      fabrication: 100,
      assembly: 100,
      commissioning: 100,
      done: 100,
    };
    expect(projectPhaseAvg(full)).toBe(100);
  });

  it('averages partial progress across all 7 phases', () => {
    // Phase sum = 100+50+50+0+0+0+0 = 200 / 7 = 28.57 -> 29
    const partial: PhaseProgress = {
      concept: 100,
      design: 50,
      procurement: 50,
      fabrication: 0,
      assembly: 0,
      commissioning: 0,
      done: 0,
    };
    expect(projectPhaseAvg(partial)).toBe(29);
  });

  it('coerces raw JSONB-ish input before averaging', () => {
    // missing fabrication etc, plus a float — coerces then averages
    expect(projectPhaseAvg({ concept: 70.4, design: 14.5 })).toBe(Math.round((70 + 15) / 7));
  });
});

// ─── projectSlug ─────────────────────────────────────────────────────────────

describe('projectSlug', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(projectSlug('CNC Router v2')).toBe('cnc-router-v2');
  });

  it('collapses multiple non-alphanumeric chars', () => {
    expect(projectSlug('My  Build -- 2024')).toBe('my-build-2024');
  });

  it('strips leading/trailing hyphens', () => {
    expect(projectSlug(' test ')).toBe('test');
  });

  it('handles numeric-only names', () => {
    expect(projectSlug('007')).toBe('007');
  });
});

// ─── Status taxonomy round-trip ──────────────────────────────────────────────

describe('status round-trip via label map', () => {
  it('every status has a non-empty human label', () => {
    for (const s of PROJECT_STATUSES) {
      expect(PROJECT_STATUS_LABELS[s].length).toBeGreaterThan(0);
    }
  });

  it('the label map has exactly the keys of PROJECT_STATUSES', () => {
    const labelKeys = Object.keys(PROJECT_STATUS_LABELS).sort();
    expect(labelKeys).toEqual([...PROJECT_STATUSES].sort());
  });
});

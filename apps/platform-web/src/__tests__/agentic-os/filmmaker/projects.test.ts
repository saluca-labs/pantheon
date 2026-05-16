/**
 * Filmmaker OS — unit tests for projects.ts type exports and pure helpers.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  FORMATS,
  FORMAT_LABELS,
  PHASE_KEYS,
  PHASE_LABELS,
  validateProjectStatus,
  validateProjectFormat,
  projectSlug,
  phaseProgressDefault,
  coercePhaseProgress,
} from '@/lib/agentic-os/filmmaker/projects';
import type { FilmmakerProject, ProjectStatus, ProjectFormat } from '@/lib/agentic-os/filmmaker/projects';
import { applyProjectFilters } from '@/components/agentic-os/filmmaker/projects-manager';

// ─── PROJECT_STATUSES ────────────────────────────────────────────────────────

describe('PROJECT_STATUSES', () => {
  it('contains all five production phases', () => {
    expect(PROJECT_STATUSES).toContain('pre_production');
    expect(PROJECT_STATUSES).toContain('production');
    expect(PROJECT_STATUSES).toContain('post_production');
    expect(PROJECT_STATUSES).toContain('wrapped');
    expect(PROJECT_STATUSES).toContain('archived');
  });

  it('has exactly 5 entries', () => {
    expect(PROJECT_STATUSES).toHaveLength(5);
  });
});

describe('PROJECT_STATUS_LABELS', () => {
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

  it('returns an error string for an unknown status', () => {
    expect(validateProjectStatus('shooting')).not.toBeNull();
  });

  it('error message lists the valid statuses', () => {
    const err = validateProjectStatus('invalid');
    expect(err).toContain('pre_production');
  });
});

// ─── FORMATS ─────────────────────────────────────────────────────────────────

describe('FORMATS', () => {
  it('contains the eight canonical production formats', () => {
    expect(FORMATS).toHaveLength(8);
    for (const f of ['feature', 'short', 'tv', 'pilot', 'webseries', 'documentary', 'music_video', 'commercial']) {
      expect(FORMATS).toContain(f as ProjectFormat);
    }
  });

  it('has a label for every format', () => {
    for (const f of FORMATS) {
      expect(FORMAT_LABELS[f]).toBeTruthy();
    }
  });
});

describe('validateProjectFormat', () => {
  it('returns null for every valid format', () => {
    for (const f of FORMATS) {
      expect(validateProjectFormat(f)).toBeNull();
    }
  });

  it('returns an error for unknown formats', () => {
    expect(validateProjectFormat('miniseries')).not.toBeNull();
    expect(validateProjectFormat(42)).not.toBeNull();
  });
});

// ─── Phase progress ──────────────────────────────────────────────────────────

describe('PHASE_KEYS', () => {
  it('has five lifecycle phases', () => {
    expect(PHASE_KEYS).toHaveLength(5);
    for (const k of ['development', 'pre_production', 'production', 'post_production', 'distribution']) {
      expect(PHASE_KEYS).toContain(k as never);
    }
  });

  it('has a human label for every phase', () => {
    for (const k of PHASE_KEYS) {
      expect(PHASE_LABELS[k]).toBeTruthy();
    }
  });
});

describe('phaseProgressDefault', () => {
  it('returns all zeros', () => {
    const p = phaseProgressDefault();
    for (const k of PHASE_KEYS) {
      expect(p[k]).toBe(0);
    }
  });
});

describe('coercePhaseProgress', () => {
  it('fills missing keys with 0', () => {
    const p = coercePhaseProgress({ development: 25 });
    expect(p.development).toBe(25);
    expect(p.production).toBe(0);
    expect(p.distribution).toBe(0);
  });

  it('clamps to 0..100', () => {
    const p = coercePhaseProgress({ development: -10, production: 150 });
    expect(p.development).toBe(0);
    expect(p.production).toBe(100);
  });

  it('rounds floats to integers', () => {
    const p = coercePhaseProgress({ development: 42.7 });
    expect(p.development).toBe(43);
  });

  it('ignores non-numeric values', () => {
    const p = coercePhaseProgress({ development: 'high' as never, production: NaN });
    expect(p.development).toBe(0);
    expect(p.production).toBe(0);
  });

  it('handles non-object input', () => {
    expect(coercePhaseProgress(null)).toEqual(phaseProgressDefault());
    expect(coercePhaseProgress(undefined)).toEqual(phaseProgressDefault());
    expect(coercePhaseProgress('nope')).toEqual(phaseProgressDefault());
  });

  it('roundtrips a full object unchanged', () => {
    const full = {
      development: 30,
      pre_production: 50,
      production: 80,
      post_production: 20,
      distribution: 10,
    };
    expect(coercePhaseProgress(full)).toEqual(full);
  });
});

// ─── projectSlug ─────────────────────────────────────────────────────────────

describe('projectSlug', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(projectSlug('My First Film')).toBe('my-first-film');
  });

  it('removes leading and trailing hyphens', () => {
    expect(projectSlug('  Noir Classic  ')).toBe('noir-classic');
  });

  it('collapses consecutive special characters into one hyphen', () => {
    expect(projectSlug('Short Film 2025!')).toBe('short-film-2025');
  });

  it('handles numeric-only names', () => {
    expect(projectSlug('007')).toBe('007');
  });
});

// ─── FilmmakerProject interface shape ────────────────────────────────────────

function makeProject(overrides: Partial<FilmmakerProject> = {}): FilmmakerProject {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    userId: 'user',
    name: 'Test Project',
    description: null,
    status: 'pre_production',
    tags: [],
    format: 'feature',
    logline: null,
    coverImageUrl: null,
    phaseProgress: phaseProgressDefault(),
    targetCompletionDate: null,
    teamSize: null,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('FilmmakerProject interface', () => {
  it('can construct an object with all new fields', () => {
    const p = makeProject({
      logline: 'A drone-delivery startup must save Christmas.',
      format: 'feature',
      coverImageUrl: 'https://example.com/cover.jpg',
      phaseProgress: { ...phaseProgressDefault(), development: 50 },
      targetCompletionDate: '2027-01-15',
      teamSize: 12,
      metadata: { festival: 'Sundance' },
    });
    expect(p.logline).toBe('A drone-delivery startup must save Christmas.');
    expect(p.phaseProgress.development).toBe(50);
    expect(p.targetCompletionDate).toBe('2027-01-15');
    expect(p.teamSize).toBe(12);
  });
});

// ─── applyProjectFilters ─────────────────────────────────────────────────────

describe('applyProjectFilters', () => {
  const a = makeProject({
    id: 'a',
    name: 'Alpha',
    status: 'pre_production',
    format: 'feature',
    createdAt: '2026-01-01T00:00:00.000Z',
    targetCompletionDate: '2026-12-01',
  });
  const b = makeProject({
    id: 'b',
    name: 'Bravo',
    status: 'production',
    format: 'short',
    createdAt: '2026-02-01T00:00:00.000Z',
    targetCompletionDate: '2026-06-01',
  });
  const c = makeProject({
    id: 'c',
    name: 'Charlie',
    status: 'wrapped',
    format: 'feature',
    createdAt: '2026-03-01T00:00:00.000Z',
    targetCompletionDate: null,
  });

  const all = [a, b, c];

  it('filters by status', () => {
    const r = applyProjectFilters(all, { status: 'production', format: 'all', sort: 'name' });
    expect(r.map((p) => p.id)).toEqual(['b']);
  });

  it('filters by format', () => {
    const r = applyProjectFilters(all, { status: 'all', format: 'feature', sort: 'name' });
    expect(r.map((p) => p.id)).toEqual(['a', 'c']);
  });

  it('sorts by name', () => {
    const r = applyProjectFilters(all, { status: 'all', format: 'all', sort: 'name' });
    expect(r.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by created (newest first)', () => {
    const r = applyProjectFilters(all, { status: 'all', format: 'all', sort: 'created' });
    expect(r.map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });

  it('sorts by target completion, nulls last', () => {
    const r = applyProjectFilters(all, { status: 'all', format: 'all', sort: 'target' });
    expect(r.map((p) => p.id)).toEqual(['b', 'a', 'c']);
  });

  it('combines filter + sort', () => {
    const r = applyProjectFilters(all, { status: 'all', format: 'feature', sort: 'name' });
    expect(r.map((p) => p.id)).toEqual(['a', 'c']);
  });
});

// ─── ProjectStatus type sanity ───────────────────────────────────────────────

describe('ProjectStatus type', () => {
  it('accepts all valid values', () => {
    const statuses: ProjectStatus[] = [
      'pre_production',
      'production',
      'post_production',
      'wrapped',
      'archived',
    ];
    expect(statuses).toHaveLength(5);
  });
});

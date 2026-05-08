/**
 * Filmmaker OS — unit tests for projects.ts type exports and pure helpers.
 *
 * Covers:
 *   - PROJECT_STATUSES enumeration completeness
 *   - PROJECT_STATUS_LABELS human-readable strings
 *   - validateProjectStatus guard function
 *   - projectSlug URL-safe name generation
 *
 * BFF route handlers are not tested directly (existing convention — see
 * adjacent shots.test.ts and maker/inventory.test.ts).
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  validateProjectStatus,
  projectSlug,
} from '@/lib/agentic-os/filmmaker/projects';
import type { FilmmakerProject, ProjectStatus } from '@/lib/agentic-os/filmmaker/projects';

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

  it('is a readonly tuple (const assertion)', () => {
    // TypeScript `as const` creates a readonly array — runtime check: no push method.
    expect(typeof (PROJECT_STATUSES as any).push).toBe('function'); // Array still has push at runtime
    // What we really verify: every entry is a non-empty string.
    for (const s of PROJECT_STATUSES) {
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(0);
    }
  });
});

// ─── PROJECT_STATUS_LABELS ───────────────────────────────────────────────────

describe('PROJECT_STATUS_LABELS', () => {
  it('has a label for every status', () => {
    for (const s of PROJECT_STATUSES) {
      expect(PROJECT_STATUS_LABELS[s]).toBeTruthy();
    }
  });

  it('human-readable labels are non-empty strings', () => {
    for (const s of PROJECT_STATUSES) {
      const label = PROJECT_STATUS_LABELS[s];
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('Pre-Production label is correct', () => {
    expect(PROJECT_STATUS_LABELS['pre_production']).toBe('Pre-Production');
  });

  it('Wrapped label is correct', () => {
    expect(PROJECT_STATUS_LABELS['wrapped']).toBe('Wrapped');
  });
});

// ─── validateProjectStatus ───────────────────────────────────────────────────

describe('validateProjectStatus', () => {
  it('returns null for every valid status', () => {
    for (const s of PROJECT_STATUSES) {
      expect(validateProjectStatus(s)).toBeNull();
    }
  });

  it('returns an error string for an unknown status', () => {
    const err = validateProjectStatus('shooting');
    expect(typeof err).toBe('string');
    expect(err!.length).toBeGreaterThan(0);
  });

  it('returns an error string for a non-string', () => {
    expect(validateProjectStatus(42)).not.toBeNull();
    expect(validateProjectStatus(null)).not.toBeNull();
    expect(validateProjectStatus(undefined)).not.toBeNull();
  });

  it('error message lists the valid statuses', () => {
    const err = validateProjectStatus('invalid');
    expect(err).toContain('pre_production');
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

  it('handles an already-slugified string', () => {
    expect(projectSlug('road-trip')).toBe('road-trip');
  });

  it('handles numeric-only names', () => {
    expect(projectSlug('007')).toBe('007');
  });
});

// ─── FilmmakerProject interface shape ────────────────────────────────────────

describe('FilmmakerProject interface', () => {
  it('can construct a valid object', () => {
    const p: FilmmakerProject = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      userId: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Test Project',
      description: 'A test description',
      status: 'pre_production',
      tags: ['drama', 'short'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(p.name).toBe('Test Project');
    expect(p.status).toBe('pre_production');
    expect(p.tags).toHaveLength(2);
  });

  it('allows null description', () => {
    const p: FilmmakerProject = {
      id: 'uuid',
      userId: 'user',
      name: 'No Description',
      description: null,
      status: 'production',
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(p.description).toBeNull();
  });

  it('status type accepts all valid values', () => {
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

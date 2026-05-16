/**
 * Filmmaker OS — Characters + relationships test suite.
 *
 * Two suites:
 *
 * 1. Pure helpers (validateCharacter, dedupeMutualRelationships,
 *    summarizeCharacter, taxonomy constants).
 *
 * 2. Repo plumbing against a mocked pg Pool (same harness as the
 *    story-documents tests). Verifies:
 *      - character create/update/delete roundtrip
 *      - relationship create rejects from_id == to_id
 *      - relationship create rejects cross-project links
 *      - cross-user access denied (returns null / false)
 *      - cascade behaviour relies on FK ON DELETE CASCADE (asserted at
 *        the DDL level in 0023; we verify delete just issues the DELETE
 *        and trusts the FK to clean up)
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CHARACTER_ROLES,
  CHARACTER_ROLE_VALUES,
  RELATIONSHIP_KINDS,
  RELATIONSHIP_KIND_VALUES,
  RELATIONSHIP_DIRECTIONS,
  validateCharacter,
  dedupeMutualRelationships,
  summarizeCharacter,
  type Character,
  type CharacterRelationship,
} from '@/lib/agentic-os/filmmaker/characters';

// ─── Pure helpers ────────────────────────────────────────────────────────────

describe('CHARACTER_ROLES', () => {
  it('contains the six spec roles in spec order', () => {
    expect(CHARACTER_ROLES.map((r) => r.role)).toEqual([
      'protagonist',
      'antagonist',
      'deuteragonist',
      'supporting',
      'minor',
      'ensemble',
    ]);
  });

  it('every role has a label and description', () => {
    for (const r of CHARACTER_ROLES) {
      expect(r.label).toBeTruthy();
      expect(r.description).toBeTruthy();
    }
  });

  it('CHARACTER_ROLE_VALUES is consistent with CHARACTER_ROLES', () => {
    expect([...CHARACTER_ROLE_VALUES]).toEqual(CHARACTER_ROLES.map((r) => r.role));
  });
});

describe('RELATIONSHIP_KINDS', () => {
  it('contains the ten spec kinds', () => {
    expect(RELATIONSHIP_KINDS.map((k) => k.kind)).toEqual([
      'ally',
      'rival',
      'family',
      'romantic',
      'mentor_to',
      'student_of',
      'colleague',
      'enemy',
      'estranged',
      'other',
    ]);
  });

  it('mentor_to and student_of are marked asymmetric', () => {
    const asym = RELATIONSHIP_KINDS.filter((k) => k.asymmetric).map((k) => k.kind);
    expect(asym).toEqual(['mentor_to', 'student_of']);
  });

  it('RELATIONSHIP_KIND_VALUES matches RELATIONSHIP_KINDS', () => {
    expect([...RELATIONSHIP_KIND_VALUES]).toEqual(
      RELATIONSHIP_KINDS.map((k) => k.kind),
    );
  });
});

describe('RELATIONSHIP_DIRECTIONS', () => {
  it('contains mutual and directional', () => {
    const dirs = RELATIONSHIP_DIRECTIONS.map((d) => d.direction).sort();
    expect(dirs).toEqual(['directional', 'mutual']);
  });
});

describe('validateCharacter', () => {
  it('requires name', () => {
    expect(validateCharacter({})).toEqual([
      { field: 'name', message: 'Name is required.' },
    ]);
    expect(validateCharacter({ name: '' })).toHaveLength(1);
    expect(validateCharacter({ name: '   ' })).toHaveLength(1);
  });

  it('accepts a valid character', () => {
    expect(validateCharacter({ name: 'Sara', role: 'protagonist' })).toEqual([]);
  });

  it('rejects unknown role', () => {
    const errs = validateCharacter({ name: 'Sara', role: 'antihero' as never });
    expect(errs.some((e) => e.field === 'role')).toBe(true);
  });
});

function character(over: Partial<Character> = {}): Character {
  return {
    id: 'c-1',
    projectId: 'p-1',
    name: 'Sara Chen',
    role: 'protagonist',
    archetype: null,
    logline: null,
    age: null,
    pronouns: null,
    gender: null,
    occupation: null,
    backstory: null,
    goals: null,
    needs: null,
    fears: null,
    wounds: null,
    arc: null,
    voiceNotes: null,
    physicalDescription: null,
    portraitUrl: null,
    tags: [],
    metadata: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function relationship(over: Partial<CharacterRelationship> = {}): CharacterRelationship {
  return {
    id: 'r-1',
    projectId: 'p-1',
    fromId: 'c-1',
    toId: 'c-2',
    kind: 'ally',
    direction: 'mutual',
    description: null,
    tension: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('dedupeMutualRelationships', () => {
  it('passes through directional relationships unchanged', () => {
    const rels = [
      relationship({ id: 'r-1', direction: 'directional', kind: 'mentor_to' }),
      relationship({ id: 'r-2', direction: 'directional', fromId: 'c-2', toId: 'c-1', kind: 'student_of' }),
    ];
    expect(dedupeMutualRelationships(rels)).toHaveLength(2);
  });

  it('collapses two rows that describe the same mutual pair', () => {
    const rels = [
      relationship({ id: 'r-a', fromId: 'c-1', toId: 'c-2', kind: 'ally' }),
      relationship({ id: 'r-b', fromId: 'c-2', toId: 'c-1', kind: 'ally' }),
    ];
    const out = dedupeMutualRelationships(rels);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('r-a');
  });

  it('does not collapse pairs that differ by kind', () => {
    const rels = [
      relationship({ id: 'r-a', fromId: 'c-1', toId: 'c-2', kind: 'ally' }),
      relationship({ id: 'r-b', fromId: 'c-2', toId: 'c-1', kind: 'rival' }),
    ];
    expect(dedupeMutualRelationships(rels)).toHaveLength(2);
  });

  it('keeps the first occurrence stable', () => {
    const rels = [
      relationship({ id: 'first', fromId: 'a', toId: 'b' }),
      relationship({ id: 'second', fromId: 'b', toId: 'a' }),
    ];
    expect(dedupeMutualRelationships(rels)[0].id).toBe('first');
  });
});

describe('summarizeCharacter', () => {
  it('starts with name and role', () => {
    expect(summarizeCharacter(character())).toMatch(/^Sara Chen — protagonist/);
  });

  it('includes age and occupation in parentheses', () => {
    const s = summarizeCharacter(
      character({ age: '30s', occupation: 'journalist' }),
    );
    expect(s).toContain('(30s, journalist)');
  });

  it('includes goal and need when present', () => {
    const s = summarizeCharacter(
      character({ goals: 'expose the cult', needs: 'forgive her sister' }),
    );
    expect(s).toContain('Goal: expose the cult');
    expect(s).toContain('Need: forgive her sister');
  });

  it('skips missing fields', () => {
    const s = summarizeCharacter(character());
    expect(s).toBe('Sara Chen — protagonist.');
  });
});

// ─── Repo plumbing (mocked pg) ───────────────────────────────────────────────

interface PgResult {
  rows: unknown[];
  rowCount: number;
}

const queue: PgResult[] = [];
const calls: { sql: string; params: unknown[] }[] = [];

function pushResult(r: Partial<PgResult>): void {
  queue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) });
}

vi.mock('@/lib/agentic-os/filmmaker/session', () => ({
  getFilmmakerPool: () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return queue.shift() ?? { rows: [], rowCount: 0 };
    }),
  }),
}));

import {
  listCharacters,
  getCharacter,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  listCharacterRelationships,
  createCharacterRelationship,
  updateCharacterRelationship,
  deleteCharacterRelationship,
  getCharacterRelationship,
} from '@/lib/agentic-os/filmmaker/repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function characterRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'c-1',
    project_id: 'p-1',
    name: 'Sara Chen',
    role: 'protagonist',
    archetype: null,
    logline: null,
    age: null,
    pronouns: null,
    gender: null,
    occupation: null,
    backstory: null,
    goals: null,
    needs: null,
    fears: null,
    wounds: null,
    arc: null,
    voice_notes: null,
    physical_description: null,
    portrait_url: null,
    tags: [],
    metadata: {},
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

function projectRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'p-1',
    user_id: 'u-1',
    name: 'My Film',
    description: null,
    status: 'pre_production',
    tags: [],
    format: 'feature',
    logline: null,
    cover_image_url: null,
    phase_progress: {
      development: 0,
      pre_production: 0,
      production: 0,
      post_production: 0,
      distribution: 0,
    },
    target_completion_date: null,
    team_size: null,
    metadata: {},
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

function relationshipRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'r-1',
    project_id: 'p-1',
    from_id: 'c-1',
    to_id: 'c-2',
    kind: 'ally',
    direction: 'mutual',
    description: null,
    tension: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

// ─── listCharacters ──────────────────────────────────────────────────────────

describe('listCharacters', () => {
  it('joins through projects table', async () => {
    pushResult({ rows: [characterRow()] });
    const cs = await listCharacters({ projectId: 'p-1', tenantId: 't-1', userId: 'u-1' });
    expect(cs).toHaveLength(1);
    expect(calls[0].sql).toContain('agos_filmmaker_projects');
    expect(calls[0].sql).toContain('p.user_id = $2');
  });

  it('returns [] when project is not owned', async () => {
    pushResult({ rows: [] });
    expect(
      await listCharacters({ projectId: 'p-1', tenantId: 't-1', userId: 'other' }),
    ).toEqual([]);
  });

  it('applies role filter', async () => {
    pushResult({ rows: [] });
    await listCharacters({
      projectId: 'p-1',
      tenantId: 't-1',
      userId: 'u-1',
      role: 'protagonist',
    });
    expect(calls[0].sql).toContain('c.role = $3');
    expect(calls[0].params).toContain('protagonist');
  });
});

// ─── createCharacter ─────────────────────────────────────────────────────────

describe('createCharacter', () => {
  it('refuses empty name', async () => {
    await expect(
      createCharacter({
        projectId: 'p-1',
        tenantId: 't-1',
        userId: 'u-1',
        data: { name: '' },
      }),
    ).rejects.toThrow(/name is required/i);
  });

  it('refuses unknown role', async () => {
    await expect(
      createCharacter({
        projectId: 'p-1',
        tenantId: 't-1',
        userId: 'u-1',
        data: { name: 'Sara', role: 'antihero' as never },
      }),
    ).rejects.toThrow(/Invalid character role/);
  });

  it('rejects when project is not owned by user', async () => {
    pushResult({ rows: [] }); // getProject -> empty
    await expect(
      createCharacter({
        projectId: 'p-missing',
        tenantId: 't-1',
        userId: 'u-1',
        data: { name: 'Sara' },
      }),
    ).rejects.toThrow(/Project not found/);
  });

  it('inserts a row + returns the created character', async () => {
    pushResult({ rows: [projectRow()] }); // getProject
    pushResult({ rows: [] }); // INSERT
    pushResult({ rows: [characterRow({ name: 'Sara Chen' })] }); // getCharacter
    const created = await createCharacter({
      projectId: 'p-1',
      tenantId: 't-1',
      userId: 'u-1',
      data: { name: 'Sara Chen', role: 'protagonist' },
    });
    expect(created.name).toBe('Sara Chen');
    expect(calls[1].sql).toContain('INSERT INTO agos_filmmaker_characters');
  });
});

// ─── updateCharacter ─────────────────────────────────────────────────────────

describe('updateCharacter', () => {
  it('returns null when not owned', async () => {
    pushResult({ rows: [] }); // getCharacter -> empty
    const r = await updateCharacter({
      id: 'c-1',
      tenantId: 't-1',
      userId: 'other',
      patch: { name: 'Hacked' },
    });
    expect(r).toBeNull();
  });

  it('issues an UPDATE when owned', async () => {
    pushResult({ rows: [characterRow()] }); // getCharacter
    pushResult({ rows: [] }); // UPDATE
    pushResult({ rows: [characterRow({ name: 'Sara Updated' })] }); // refetch
    const r = await updateCharacter({
      id: 'c-1',
      tenantId: 't-1',
      userId: 'u-1',
      patch: { name: 'Sara Updated' },
    });
    expect(r?.name).toBe('Sara Updated');
    expect(calls[1].sql).toContain('UPDATE agos_filmmaker_characters');
  });
});

// ─── deleteCharacter ─────────────────────────────────────────────────────────

describe('deleteCharacter', () => {
  it('refuses to delete when not owned', async () => {
    pushResult({ rows: [] });
    const ok = await deleteCharacter('c-1', 'other');
    expect(ok).toBe(false);
    expect(calls.length).toBe(1); // no DELETE issued
  });

  it('issues a DELETE when owned; FK cascade cleans relationships', async () => {
    pushResult({ rows: [characterRow()] });
    pushResult({ rowCount: 1, rows: [] });
    const ok = await deleteCharacter('c-1', 'u-1');
    expect(ok).toBe(true);
    expect(calls[1].sql).toContain('DELETE FROM agos_filmmaker_characters');
    // The relationships table has FK ON DELETE CASCADE on from_id and
    // to_id, so the FK clean-up is asserted at the migration level
    // (0023) — no separate DELETE is issued here.
  });
});

// ─── listCharacterRelationships ──────────────────────────────────────────────

describe('listCharacterRelationships', () => {
  it('joins through projects table', async () => {
    pushResult({ rows: [relationshipRow()] });
    const rs = await listCharacterRelationships({
      projectId: 'p-1',
      tenantId: 't-1',
      userId: 'u-1',
    });
    expect(rs).toHaveLength(1);
    expect(calls[0].sql).toContain('p.user_id = $2');
  });

  it('applies characterId filter', async () => {
    pushResult({ rows: [] });
    await listCharacterRelationships({
      projectId: 'p-1',
      tenantId: 't-1',
      userId: 'u-1',
      characterId: 'c-1',
    });
    expect(calls[0].sql).toContain('r.from_id = $3');
    expect(calls[0].sql).toContain('r.to_id = $3');
  });

  it('returns [] when project is not owned by user', async () => {
    pushResult({ rows: [] });
    expect(
      await listCharacterRelationships({
        projectId: 'p-1',
        tenantId: 't-1',
        userId: 'other',
      }),
    ).toEqual([]);
  });
});

// ─── createCharacterRelationship ─────────────────────────────────────────────

describe('createCharacterRelationship', () => {
  it('rejects from_id == to_id', async () => {
    await expect(
      createCharacterRelationship({
        tenantId: 't-1',
        userId: 'u-1',
        data: { fromId: 'c-1', toId: 'c-1' },
      }),
    ).rejects.toThrow(/cannot have a relationship with themselves/);
  });

  it('rejects characters from different projects', async () => {
    // from getCharacter
    pushResult({ rows: [characterRow({ id: 'c-1', project_id: 'p-1' })] });
    // to getCharacter
    pushResult({ rows: [characterRow({ id: 'c-2', project_id: 'p-OTHER' })] });
    await expect(
      createCharacterRelationship({
        tenantId: 't-1',
        userId: 'u-1',
        data: { fromId: 'c-1', toId: 'c-2', kind: 'ally' },
      }),
    ).rejects.toThrow(/same project/);
  });

  it('rejects unknown kind', async () => {
    await expect(
      createCharacterRelationship({
        tenantId: 't-1',
        userId: 'u-1',
        data: { fromId: 'c-1', toId: 'c-2', kind: 'frenemy' as never },
      }),
    ).rejects.toThrow(/Invalid relationship kind/);
  });

  it('rejects out-of-range tension', async () => {
    await expect(
      createCharacterRelationship({
        tenantId: 't-1',
        userId: 'u-1',
        data: { fromId: 'c-1', toId: 'c-2', tension: 99 },
      }),
    ).rejects.toThrow(/0 and 10/);
  });

  it('rejects when either character is not owned by user', async () => {
    pushResult({ rows: [] }); // from -> empty
    pushResult({ rows: [characterRow({ id: 'c-2', project_id: 'p-1' })] }); // to
    await expect(
      createCharacterRelationship({
        tenantId: 't-1',
        userId: 'u-1',
        data: { fromId: 'c-missing', toId: 'c-2', kind: 'ally' },
      }),
    ).rejects.toThrow(/Character not found/);
  });

  it('inserts and returns the relationship', async () => {
    pushResult({ rows: [characterRow({ id: 'c-1', project_id: 'p-1' })] });
    pushResult({ rows: [characterRow({ id: 'c-2', project_id: 'p-1' })] });
    pushResult({ rows: [] }); // INSERT
    pushResult({ rows: [relationshipRow({ kind: 'ally' })] }); // getCharacterRelationship
    const rel = await createCharacterRelationship({
      tenantId: 't-1',
      userId: 'u-1',
      data: { fromId: 'c-1', toId: 'c-2', kind: 'ally' },
    });
    expect(rel.kind).toBe('ally');
    // INSERT call is at index 2.
    expect(calls[2].sql).toContain(
      'INSERT INTO agos_filmmaker_character_relationships',
    );
  });
});

// ─── updateCharacterRelationship ─────────────────────────────────────────────

describe('updateCharacterRelationship', () => {
  it('returns null when relationship is not owned', async () => {
    pushResult({ rows: [] });
    const r = await updateCharacterRelationship({
      id: 'r-1',
      tenantId: 't-1',
      userId: 'other',
      patch: { tension: 5 },
    });
    expect(r).toBeNull();
  });

  it('issues an UPDATE when owned', async () => {
    pushResult({ rows: [relationshipRow()] });
    pushResult({ rows: [] });
    pushResult({ rows: [relationshipRow({ tension: 7 })] });
    const r = await updateCharacterRelationship({
      id: 'r-1',
      tenantId: 't-1',
      userId: 'u-1',
      patch: { tension: 7 },
    });
    expect(r?.tension).toBe(7);
    expect(calls[1].sql).toContain('UPDATE agos_filmmaker_character_relationships');
  });
});

// ─── deleteCharacterRelationship ─────────────────────────────────────────────

describe('deleteCharacterRelationship', () => {
  it('refuses to delete when not owned', async () => {
    pushResult({ rows: [] });
    const ok = await deleteCharacterRelationship('r-1', 'other');
    expect(ok).toBe(false);
    expect(calls.length).toBe(1);
  });

  it('deletes when owned', async () => {
    pushResult({ rows: [relationshipRow()] });
    pushResult({ rowCount: 1, rows: [] });
    const ok = await deleteCharacterRelationship('r-1', 'u-1');
    expect(ok).toBe(true);
    expect(calls[1].sql).toContain('DELETE FROM agos_filmmaker_character_relationships');
  });
});

// ─── getCharacterRelationship cross-user guard ───────────────────────────────

describe('getCharacterRelationship', () => {
  it('returns null when not owned', async () => {
    pushResult({ rows: [] });
    const r = await getCharacterRelationship('r-1', 'other');
    expect(r).toBeNull();
  });

  it('returns row when owned', async () => {
    pushResult({ rows: [relationshipRow({ kind: 'rival' })] });
    const r = await getCharacterRelationship('r-1', 'u-1');
    expect(r?.kind).toBe('rival');
  });
});

// ─── getCharacter cross-user guard ───────────────────────────────────────────

describe('getCharacter', () => {
  it('returns null when not owned', async () => {
    pushResult({ rows: [] });
    expect(await getCharacter('c-1', 'other')).toBeNull();
  });

  it('returns the row when owned', async () => {
    pushResult({ rows: [characterRow()] });
    const c = await getCharacter('c-1', 'u-1');
    expect(c?.name).toBe('Sara Chen');
  });
});

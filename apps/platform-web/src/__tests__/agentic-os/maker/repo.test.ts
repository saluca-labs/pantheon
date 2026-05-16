/**
 * Maker OS — repo regression tests.
 *
 * Exercises the new Project Hub plumbing against a mocked pg Pool:
 *   - listProjects / getProject hit the renamed table `agos_maker_projects`.
 *   - createProject serialises tags/phaseProgress/metadata as JSONB strings
 *     and round-trips the new columns.
 *   - updateProject keeps untouched columns via COALESCE-style nulls.
 *   - updatePhaseProgress merges over existing phases.
 *   - deleteProject issues a single DELETE (parts cascade via FK).
 *   - recordAudit writes through to `agos_audit` with osSlug='maker'.
 *
 * Pattern mirrors the filmmaker repo test harness.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PgResult {
  rows: unknown[];
  rowCount: number;
}

const queue: PgResult[] = [];
const calls: { sql: string; params: unknown[] }[] = [];

function pushResult(r: Partial<PgResult>): void {
  queue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) });
}

vi.mock('@/lib/agentic-os/maker/session', () => ({
  getMakerPool: () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return queue.shift() ?? { rows: [], rowCount: 0 };
    }),
  }),
}));

import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  updatePhaseProgress,
  deleteProject,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function projectRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'p-1',
    user_id: 'u-1',
    name: 'CNC Router v2',
    description: null,
    status: 'concept',
    tags: [],
    cover_image_url: null,
    target_completion_date: null,
    team_size: null,
    phase_progress: {
      concept: 0,
      design: 0,
      procurement: 0,
      fabrication: 0,
      assembly: 0,
      commissioning: 0,
      done: 0,
    },
    metadata: {},
    created_at: new Date('2026-05-10T00:00:00Z'),
    updated_at: new Date('2026-05-10T01:00:00Z'),
    ...overrides,
  };
}

// ─── Listing / fetch ─────────────────────────────────────────────────────────

describe('listProjects', () => {
  it('queries agos_maker_projects ordered by updated_at DESC', async () => {
    pushResult({ rows: [projectRow()] });
    const r = await listProjects('u-1');
    expect(r).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/FROM agos_maker_projects/);
    expect(calls[0]!.sql).toMatch(/ORDER BY updated_at DESC/);
    expect(calls[0]!.params).toEqual(['u-1']);
  });

  it('returns the renamed table — never references agos_maker_builds', async () => {
    pushResult({ rows: [] });
    await listProjects('u-1');
    expect(calls[0]!.sql).not.toMatch(/agos_maker_builds/);
  });
});

describe('getProject', () => {
  it('returns null when no row matches', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await getProject('missing', 'u-1')).toBeNull();
  });

  it('returns a typed MakerProject when found', async () => {
    pushResult({
      rows: [projectRow({ name: 'Laser Cutter Build', status: 'fabrication' })],
    });
    const r = await getProject('p-1', 'u-1');
    expect(r).not.toBeNull();
    expect(r!.name).toBe('Laser Cutter Build');
    expect(r!.status).toBe('fabrication');
    // phase_progress null-safe coercion
    expect(r!.phaseProgress.concept).toBe(0);
  });
});

// ─── createProject ──────────────────────────────────────────────────────────

describe('createProject', () => {
  it('serialises tags, phaseProgress, and metadata as JSON strings', async () => {
    pushResult({ rowCount: 1, rows: [] }); // INSERT
    pushResult({
      rows: [
        projectRow({
          phase_progress: {
            concept: 25,
            design: 10,
            procurement: 0,
            fabrication: 0,
            assembly: 0,
            commissioning: 0,
            done: 0,
          },
          tags: ['cnc', 'workshop'],
          metadata: { program: 'aurora' },
        }),
      ],
    }); // SELECT (re-read via getProject)

    const project = await createProject('u-1', {
      name: 'Build A',
      tags: ['cnc', 'workshop'],
      phaseProgress: {
        concept: 25,
        design: 10,
        procurement: 0,
        fabrication: 0,
        assembly: 0,
        commissioning: 0,
        done: 0,
      },
      metadata: { program: 'aurora' },
    });

    const insert = calls[0]!;
    expect(insert.sql).toMatch(/INSERT INTO agos_maker_projects/);
    // The params should contain a JSON string for tags + phase_progress +
    // metadata. We search for the phase_progress one because it has a
    // distinctive key.
    // phase_progress is serialised as a JSON object that contains the
    // word "concept" alongside the other 6 phase keys. The status column
    // is also the literal string 'concept', so distinguish by leading '{'.
    const phaseJson = insert.params.find(
      (p) => typeof p === 'string' && p.startsWith('{') && p.includes('concept'),
    );
    expect(phaseJson).toBeTruthy();
    expect(JSON.parse(phaseJson as string).concept).toBe(25);

    const tagsJson = insert.params.find(
      (p) => typeof p === 'string' && p.startsWith('[') && p.includes('cnc'),
    );
    expect(tagsJson).toBeTruthy();

    expect(project.tags).toEqual(['cnc', 'workshop']);
    expect(project.phaseProgress.concept).toBe(25);
  });

  it('defaults status to "concept" when not provided', async () => {
    pushResult({ rowCount: 1, rows: [] });
    pushResult({ rows: [projectRow({ status: 'concept' })] });

    const project = await createProject('u-1', { name: 'Default-status build' });
    expect(project.status).toBe('concept');
    // status is the 5th positional parameter ($5)
    expect(calls[0]!.params[4]).toBe('concept');
  });

  it('rejects an unknown status value', async () => {
    await expect(
      createProject('u-1', { name: 'X', status: 'planning' as never }),
    ).rejects.toThrow(/Invalid status/);
  });
});

// ─── updateProject ──────────────────────────────────────────────────────────

describe('updateProject', () => {
  it('passes null for omitted fields so COALESCE keeps existing values', async () => {
    pushResult({ rowCount: 1, rows: [] }); // UPDATE
    pushResult({ rows: [projectRow({ name: 'Renamed' })] }); // SELECT

    await updateProject('p-1', 'u-1', { name: 'Renamed' });
    const params = calls[0]!.params;
    expect(params[2]).toBe('Renamed'); // $3 name
    expect(params[3]).toBeNull(); // $4 description
    expect(params[4]).toBeNull(); // $5 status
  });

  it('rejects an unknown status on update', async () => {
    await expect(
      updateProject('p-1', 'u-1', { status: 'in_progress' as never }),
    ).rejects.toThrow(/Invalid status/);
  });

  it('serialises a new tags array as JSONB', async () => {
    pushResult({ rowCount: 1, rows: [] });
    pushResult({ rows: [projectRow()] });
    await updateProject('p-1', 'u-1', { tags: ['alpha'] });
    const tagsJson = calls[0]!.params.find(
      (p) => typeof p === 'string' && p.startsWith('[') && p.includes('alpha'),
    );
    expect(tagsJson).toBeTruthy();
  });
});

// ─── updatePhaseProgress ────────────────────────────────────────────────────

describe('updatePhaseProgress', () => {
  it('merges with existing phases (other phases preserved)', async () => {
    // Sequence:
    //   1. getProject() pre-read
    //   2. updateProject() UPDATE
    //   3. getProject() post-read
    pushResult({
      rows: [
        projectRow({
          phase_progress: {
            concept: 50,
            design: 30,
            procurement: 10,
            fabrication: 0,
            assembly: 0,
            commissioning: 0,
            done: 0,
          },
        }),
      ],
    });
    pushResult({ rowCount: 1, rows: [] });
    pushResult({
      rows: [
        projectRow({
          phase_progress: {
            concept: 50,
            design: 30,
            procurement: 10,
            fabrication: 75, // <- changed
            assembly: 0,
            commissioning: 0,
            done: 0,
          },
        }),
      ],
    });

    const result = await updatePhaseProgress('p-1', 'u-1', { fabrication: 75 });
    expect(result!.phaseProgress.fabrication).toBe(75);

    // The UPDATE must have received the merged object — find the JSON
    // object (not the status string).
    const updateCall = calls[1]!;
    const phaseJson = updateCall.params.find(
      (p) => typeof p === 'string' && p.startsWith('{') && p.includes('concept'),
    );
    expect(phaseJson).toBeTruthy();
    const merged = JSON.parse(phaseJson as string);
    expect(merged.concept).toBe(50);
    expect(merged.design).toBe(30);
    expect(merged.fabrication).toBe(75);
  });

  it('returns null when the project does not exist', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await updatePhaseProgress('missing', 'u-1', { concept: 50 })).toBeNull();
  });
});

// ─── deleteProject ──────────────────────────────────────────────────────────

describe('deleteProject', () => {
  it('returns true when a row was removed', async () => {
    pushResult({ rowCount: 1, rows: [] });
    expect(await deleteProject('p-1', 'u-1')).toBe(true);
    expect(calls[0]!.sql).toMatch(/DELETE FROM agos_maker_projects/);
    expect(calls[0]!.params).toEqual(['p-1', 'u-1']);
  });

  it('returns false when no row matched', async () => {
    pushResult({ rowCount: 0, rows: [] });
    expect(await deleteProject('missing', 'u-1')).toBe(false);
  });

  it('relies on the FK cascade — no separate DELETE on parts', async () => {
    pushResult({ rowCount: 1, rows: [] });
    await deleteProject('p-1', 'u-1');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).not.toMatch(/agos_maker_parts/);
  });
});

// ─── recordAudit ────────────────────────────────────────────────────────────

describe('recordAudit', () => {
  it('writes to agos_audit with osSlug locked to "maker"', async () => {
    pushResult({ rowCount: 1, rows: [] });
    await recordAudit({
      actorId: 'u-1',
      action: 'maker.project.created',
      payload: { projectId: 'p-1' },
      projectId: 'p-1',
    });
    expect(calls[0]!.sql).toMatch(/INSERT INTO agos_audit/);
    // The osSlug positional parameter ($4 in the shared audit writer) should be 'maker'.
    expect(calls[0]!.params).toContain('maker');
    expect(calls[0]!.params).toContain('u-1');
    expect(calls[0]!.params).toContain('maker.project.created');
  });
});

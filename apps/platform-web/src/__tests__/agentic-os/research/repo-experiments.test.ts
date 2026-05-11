/**
 * Research OS — repo regression tests for the Phase 1 experiment hub.
 *
 * Exercises the experiment plumbing against a mocked pg Pool:
 *   - listExperimentsForUser hits agos_research_experiments with the new
 *     (user_id, status, archived_at, tags) filter columns + LIMIT/OFFSET.
 *   - getExperiment returns null on miss + a hydrated row on hit.
 *   - createExperiment maps the camelCase input to the DB columns + a
 *     legacy `title` column, accepts a NULL hypothesis_id, and serializes
 *     phase_progress / metadata as JSONB strings.
 *   - updateExperiment keeps untouched columns via COALESCE.
 *   - archiveExperiment sets archived_at + status='archived'.
 *   - restoreExperiment clears archived_at + flips back from archived.
 *   - deleteExperiment issues a single DELETE.
 *   - recordAudit writes the optional projectId column.
 *
 * Pattern mirrors `maker/repo.test.ts`.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PgResult {
  rows: any[];
  rowCount: number;
}

const queue: PgResult[] = [];
const calls: { sql: string; params: any[] }[] = [];

function pushResult(r: Partial<PgResult>): void {
  queue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) });
}

vi.mock('@/lib/agentic-os/research/session', () => ({
  getResearchPool: () => ({
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return queue.shift() ?? { rows: [], rowCount: 0 };
    }),
  }),
  getCurrentResearchUser: vi.fn(),
}));

import {
  listExperimentsForUser,
  getExperiment,
  createExperiment,
  updateExperiment,
  archiveExperiment,
  restoreExperiment,
  deleteExperiment,
  recordAudit,
} from '@/lib/agentic-os/research/repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function expRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'exp-1',
    user_id: 'u-1',
    hypothesis_id: null,
    name: 'Enzyme sweep',
    description: '',
    status: 'planning',
    tags: [],
    cover_image_url: null,
    target_completion_date: null,
    team_size: null,
    phase_progress: {
      planning: 0,
      running: 0,
      analysis: 0,
      writeup: 0,
      published: 0,
    },
    archived_at: null,
    metadata: {},
    independent: '',
    dependent: '',
    controls: '',
    protocol: '',
    success_criteria: '',
    created_at: new Date('2026-05-10T00:00:00Z'),
    updated_at: new Date('2026-05-10T01:00:00Z'),
    ...overrides,
  };
}

// ─── listExperimentsForUser ────────────────────────────────────────────────

describe('listExperimentsForUser', () => {
  it('queries agos_research_experiments ordered by updated_at DESC', async () => {
    pushResult({ rows: [expRow()] });
    const r = await listExperimentsForUser('u-1');
    expect(r).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/FROM agos_research_experiments/);
    expect(calls[0]!.sql).toMatch(/ORDER BY updated_at DESC/);
  });

  it('hides archived rows by default (archived_at IS NULL)', async () => {
    pushResult({ rows: [] });
    await listExperimentsForUser('u-1');
    expect(calls[0]!.sql).toMatch(/archived_at IS NULL/);
  });

  it('shows only archived rows when archived=true', async () => {
    pushResult({ rows: [] });
    await listExperimentsForUser('u-1', { archived: true });
    expect(calls[0]!.sql).toMatch(/archived_at IS NOT NULL/);
  });

  it('passes status filter as a param', async () => {
    pushResult({ rows: [] });
    await listExperimentsForUser('u-1', { status: 'running' });
    expect(calls[0]!.params).toContain('running');
  });

  it('rejects an invalid status filter', async () => {
    await expect(
      listExperimentsForUser('u-1', { status: 'shipping' as any }),
    ).rejects.toThrow(/Invalid status/);
  });

  it('applies a tag filter via ANY(tags)', async () => {
    pushResult({ rows: [] });
    await listExperimentsForUser('u-1', { tag: 'Biology' });
    expect(calls[0]!.sql).toMatch(/ANY\(tags\)/);
    // Tag should be lowercased.
    expect(calls[0]!.params).toContain('biology');
  });

  it('respects LIMIT + OFFSET', async () => {
    pushResult({ rows: [] });
    await listExperimentsForUser('u-1', { limit: 20, offset: 40 });
    expect(calls[0]!.sql).toMatch(/LIMIT/);
    expect(calls[0]!.sql).toMatch(/OFFSET/);
    expect(calls[0]!.params.slice(-2)).toEqual([20, 40]);
  });

  it('caps LIMIT at 200', async () => {
    pushResult({ rows: [] });
    await listExperimentsForUser('u-1', { limit: 9999 });
    expect(calls[0]!.params).toContain(200);
  });

  it('floors LIMIT to 1', async () => {
    pushResult({ rows: [] });
    await listExperimentsForUser('u-1', { limit: 0 });
    expect(calls[0]!.params).toContain(1);
  });

  it('hydrates rows into the ResearchExperiment shape', async () => {
    pushResult({
      rows: [
        expRow({
          id: 'exp-77',
          name: 'My exp',
          description: 'desc',
          status: 'running',
          tags: ['a', 'b'],
          cover_image_url: 'https://example.com/c.jpg',
          target_completion_date: new Date('2026-09-01T00:00:00Z'),
          team_size: 3,
          phase_progress: { planning: 100, running: 50 },
          archived_at: null,
          metadata: { foo: 'bar' },
        }),
      ],
    });
    const r = await listExperimentsForUser('u-1');
    expect(r[0]!.id).toBe('exp-77');
    expect(r[0]!.name).toBe('My exp');
    expect(r[0]!.tags).toEqual(['a', 'b']);
    expect(r[0]!.coverImageUrl).toBe('https://example.com/c.jpg');
    expect(r[0]!.targetCompletionDate).toBe('2026-09-01');
    expect(r[0]!.teamSize).toBe(3);
    expect(r[0]!.phaseProgress.planning).toBe(100);
    expect(r[0]!.phaseProgress.running).toBe(50);
    expect(r[0]!.phaseProgress.published).toBe(0);
    expect(r[0]!.metadata).toEqual({ foo: 'bar' });
  });
});

// ─── getExperiment ────────────────────────────────────────────────────────

describe('getExperiment', () => {
  it('returns null on a miss', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const r = await getExperiment('exp-x', 'u-1');
    expect(r).toBeNull();
  });

  it('hydrates a hit', async () => {
    pushResult({ rows: [expRow()] });
    const r = await getExperiment('exp-1', 'u-1');
    expect(r?.id).toBe('exp-1');
    expect(calls[0]!.params).toEqual(['exp-1', 'u-1']);
  });

  it('enforces cross-ownership via user_id in the WHERE clause', async () => {
    pushResult({ rows: [] });
    await getExperiment('exp-1', 'u-other');
    expect(calls[0]!.sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
    expect(calls[0]!.params).toEqual(['exp-1', 'u-other']);
  });

  it('hydrates NULL hypothesis_id correctly', async () => {
    pushResult({ rows: [expRow({ hypothesis_id: null })] });
    const r = await getExperiment('exp-1', 'u-1');
    expect(r?.hypothesisId).toBeNull();
  });

  it('hydrates archived_at as an ISO string', async () => {
    pushResult({
      rows: [expRow({ archived_at: new Date('2026-05-09T12:00:00Z') })],
    });
    const r = await getExperiment('exp-1', 'u-1');
    expect(r?.archivedAt).toBe('2026-05-09T12:00:00.000Z');
  });
});

// ─── createExperiment ─────────────────────────────────────────────────────

describe('createExperiment', () => {
  it('INSERTs then re-fetches the row', async () => {
    pushResult({ rowCount: 1 }); // INSERT
    pushResult({ rows: [expRow({ name: 'New' })] }); // SELECT after insert
    const r = await createExperiment('u-1', { name: 'New' });
    expect(r.name).toBe('New');
    expect(calls).toHaveLength(2);
    expect(calls[0]!.sql).toMatch(/INSERT INTO agos_research_experiments/);
  });

  it('serializes phase_progress + metadata as JSONB strings', async () => {
    pushResult({ rowCount: 1 });
    pushResult({ rows: [expRow()] });
    await createExperiment('u-1', {
      name: 'X',
      phaseProgress: {
        planning: 10,
        running: 20,
        analysis: 30,
        writeup: 40,
        published: 50,
      },
      metadata: { k: 'v' },
    });
    // phase_progress is param 11 (JSONB-cast); metadata is param 12.
    expect(calls[0]!.params[10]).toMatch(/"planning":10/);
    expect(calls[0]!.params[11]).toMatch(/"k":"v"/);
  });

  it('accepts a NULL hypothesisId (legacy column)', async () => {
    pushResult({ rowCount: 1 });
    pushResult({ rows: [expRow({ hypothesis_id: null })] });
    const r = await createExperiment('u-1', { name: 'X' });
    expect(r.hypothesisId).toBeNull();
    // hypothesis_id is param 3.
    expect(calls[0]!.params[2]).toBeNull();
  });

  it('accepts an explicit hypothesisId (legacy column)', async () => {
    pushResult({ rowCount: 1 });
    pushResult({ rows: [expRow({ hypothesis_id: 'hyp-9' })] });
    const r = await createExperiment('u-1', { name: 'X', hypothesisId: 'hyp-9' });
    expect(r.hypothesisId).toBe('hyp-9');
    expect(calls[0]!.params[2]).toBe('hyp-9');
  });

  it('defaults status to planning', async () => {
    pushResult({ rowCount: 1 });
    pushResult({ rows: [expRow()] });
    await createExperiment('u-1', { name: 'X' });
    // status is param 6.
    expect(calls[0]!.params[5]).toBe('planning');
  });

  it('rejects an invalid status', async () => {
    await expect(
      createExperiment('u-1', { name: 'X', status: 'shipping' as any }),
    ).rejects.toThrow(/Invalid status/);
  });

  it('defaults phase_progress to all zeros', async () => {
    pushResult({ rowCount: 1 });
    pushResult({ rows: [expRow()] });
    await createExperiment('u-1', { name: 'X' });
    expect(calls[0]!.params[10]).toMatch(/"planning":0/);
    expect(calls[0]!.params[10]).toMatch(/"published":0/);
  });

  it('preserves bench-side fields when provided', async () => {
    pushResult({ rowCount: 1 });
    pushResult({ rows: [expRow({ independent: 'temp', dependent: 'yield' })] });
    const r = await createExperiment('u-1', {
      name: 'X',
      independent: 'temp',
      dependent: 'yield',
      protocol: 'incubate at temp',
    });
    expect(r.independent).toBe('temp');
    expect(r.dependent).toBe('yield');
  });
});

// ─── updateExperiment ─────────────────────────────────────────────────────

describe('updateExperiment', () => {
  it('issues an UPDATE with COALESCE for untouched fields', async () => {
    pushResult({ rowCount: 1 });
    pushResult({ rows: [expRow({ name: 'Renamed' })] });
    await updateExperiment('exp-1', 'u-1', { name: 'Renamed' });
    expect(calls[0]!.sql).toMatch(/UPDATE agos_research_experiments/);
    expect(calls[0]!.sql).toMatch(/title\s+= COALESCE/);
  });

  it('refetches the row after update', async () => {
    pushResult({ rowCount: 1 });
    pushResult({ rows: [expRow({ name: 'Renamed' })] });
    const r = await updateExperiment('exp-1', 'u-1', { name: 'Renamed' });
    expect(r?.name).toBe('Renamed');
    expect(calls).toHaveLength(2);
  });

  it('rejects an invalid status', async () => {
    await expect(
      updateExperiment('exp-1', 'u-1', { status: 'shipping' as any }),
    ).rejects.toThrow(/Invalid status/);
  });

  it('passes null for unset fields so COALESCE preserves them', async () => {
    pushResult({ rowCount: 1 });
    pushResult({ rows: [expRow()] });
    await updateExperiment('exp-1', 'u-1', { name: 'Renamed' });
    // params: id, userId, name, description (null), status (null), ...
    expect(calls[0]!.params[2]).toBe('Renamed');
    expect(calls[0]!.params[3]).toBeNull();
    expect(calls[0]!.params[4]).toBeNull();
  });

  it('serializes phase_progress as JSONB when provided', async () => {
    pushResult({ rowCount: 1 });
    pushResult({ rows: [expRow()] });
    await updateExperiment('exp-1', 'u-1', {
      phaseProgress: {
        planning: 100,
        running: 75,
        analysis: 50,
        writeup: 25,
        published: 0,
      },
    });
    // phase_progress is param 10.
    expect(calls[0]!.params[9]).toMatch(/"running":75/);
  });

  it('passes raw tags array (not JSON-stringified) for TEXT[] column', async () => {
    pushResult({ rowCount: 1 });
    pushResult({ rows: [expRow()] });
    await updateExperiment('exp-1', 'u-1', { tags: ['a', 'b'] });
    // tags is param 6.
    expect(calls[0]!.params[5]).toEqual(['a', 'b']);
  });
});

// ─── archiveExperiment ───────────────────────────────────────────────────

describe('archiveExperiment', () => {
  it('sets archived_at = now() and status = archived', async () => {
    pushResult({ rowCount: 1, rows: [{ id: 'exp-1' }] });
    pushResult({ rows: [expRow({ archived_at: new Date(), status: 'archived' })] });
    const r = await archiveExperiment('exp-1', 'u-1');
    expect(calls[0]!.sql).toMatch(/SET archived_at = now\(\)/);
    expect(calls[0]!.sql).toMatch(/status\s*=\s*'archived'/);
    expect(r?.status).toBe('archived');
  });

  it('refetches even if already archived (idempotent for caller)', async () => {
    pushResult({ rowCount: 0 }); // UPDATE no-op
    pushResult({ rows: [expRow({ archived_at: new Date(), status: 'archived' })] });
    const r = await archiveExperiment('exp-1', 'u-1');
    expect(r?.status).toBe('archived');
  });

  it('enforces cross-ownership in the UPDATE WHERE', async () => {
    pushResult({ rowCount: 0 });
    pushResult({ rows: [] });
    await archiveExperiment('exp-1', 'u-other');
    expect(calls[0]!.sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
  });
});

// ─── restoreExperiment ───────────────────────────────────────────────────

describe('restoreExperiment', () => {
  it('clears archived_at and resets archived status to planning', async () => {
    pushResult({ rowCount: 1 });
    pushResult({ rows: [expRow({ status: 'planning' })] });
    const r = await restoreExperiment('exp-1', 'u-1');
    expect(calls[0]!.sql).toMatch(/archived_at\s*=\s*NULL/);
    expect(calls[0]!.sql).toMatch(/WHEN status = 'archived' THEN 'planning'/);
    expect(r?.status).toBe('planning');
  });
});

// ─── deleteExperiment ────────────────────────────────────────────────────

describe('deleteExperiment', () => {
  it('issues a hard DELETE and returns true on rowCount > 0', async () => {
    pushResult({ rowCount: 1 });
    const ok = await deleteExperiment('exp-1', 'u-1');
    expect(ok).toBe(true);
    expect(calls[0]!.sql).toMatch(/DELETE FROM agos_research_experiments/);
  });

  it('returns false when no rows match (cross-ownership miss)', async () => {
    pushResult({ rowCount: 0 });
    const ok = await deleteExperiment('exp-1', 'u-other');
    expect(ok).toBe(false);
  });
});

// ─── recordAudit ─────────────────────────────────────────────────────────

describe('recordAudit', () => {
  it('writes to agos_audit with os_slug=research', async () => {
    pushResult({ rowCount: 1 });
    await recordAudit({
      actorId: 'u-1',
      action: 'research.experiment.created',
      payload: { id: 'exp-1' },
      projectId: 'exp-1',
    });
    expect(calls[0]!.sql).toMatch(/INSERT INTO agos_audit/);
    expect(calls[0]!.params).toContain('research');
    expect(calls[0]!.params).toContain('research.experiment.created');
    expect(calls[0]!.params).toContain('exp-1');
  });

  it('persists projectId in the project_id column', async () => {
    pushResult({ rowCount: 1 });
    await recordAudit({
      actorId: 'u-1',
      action: 'research.experiment.archived',
      projectId: 'exp-9',
    });
    expect(calls[0]!.sql).toMatch(/project_id/);
    // INSERT order: id, project_id, actor_id, ...
    expect(calls[0]!.params[1]).toBe('exp-9');
  });

  it('omits projectId by writing NULL when not provided', async () => {
    pushResult({ rowCount: 1 });
    await recordAudit({
      actorId: 'u-1',
      action: 'research.hypothesis.created',
    });
    expect(calls[0]!.params[1]).toBeNull();
  });
});

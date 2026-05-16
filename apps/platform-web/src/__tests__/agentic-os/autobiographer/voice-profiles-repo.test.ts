/**
 * Autobiographer OS — voice-profiles-repo unit tests.
 *
 * Mocks the shared pg Pool *and* a `client` returned by `pool.connect()`
 * for the transactional `insertVoiceProfile` / `activateProfile` paths.
 * Exercises listing, version auto-increment, single-active enforcement
 * across activate + insert, and the version+sample math invariants.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PgResult {
  rows: unknown[];
  rowCount: number;
}

const poolQueue: PgResult[] = [];
const poolCalls: { sql: string; params: unknown[] }[] = [];
const clientQueue: PgResult[] = [];
const clientCalls: { sql: string; params: unknown[] }[] = [];

function pushPool(r: Partial<PgResult>): void {
  poolQueue.push({
    rows: r.rows ?? [],
    rowCount: r.rowCount ?? r.rows?.length ?? 0,
  });
}
function pushClient(r: Partial<PgResult>): void {
  clientQueue.push({
    rows: r.rows ?? [],
    rowCount: r.rowCount ?? r.rows?.length ?? 0,
  });
}

const clientReleaseSpy = vi.fn();
const clientMock = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    clientCalls.push({ sql, params });
    return clientQueue.shift() ?? { rows: [], rowCount: 0 };
  }),
  release: clientReleaseSpy,
};

vi.mock('@/lib/agentic-os/autobiographer/session', () => ({
  getAutobiographerPool: () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      poolCalls.push({ sql, params });
      return poolQueue.shift() ?? { rows: [], rowCount: 0 };
    }),
    connect: async () => clientMock,
  }),
}));

import {
  activateProfile,
  deactivateProfile,
  deleteVoiceProfile,
  getActiveVoiceProfile,
  getVoiceProfile,
  insertVoiceProfile,
  listVoiceProfiles,
  updateVoiceProfile,
} from '@/lib/agentic-os/autobiographer/voice-profiles-repo';

beforeEach(() => {
  poolQueue.length = 0;
  poolCalls.length = 0;
  clientQueue.length = 0;
  clientCalls.length = 0;
  clientMock.query.mockClear();
  clientReleaseSpy.mockClear();
});

function profileRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'pr-1',
    user_id: 'u-1',
    version: 1,
    is_active: true,
    style_summary: 'Warm and observational.',
    style_adjectives: ['warm', 'observational'],
    style_rules: ['Use short sentences'],
    example_openings: ['Once, on a Tuesday,'],
    sample_count: 3,
    sample_word_count: 1200,
    built_at: new Date('2026-05-11T01:00:00Z'),
    builder: 'coach',
    metadata: {},
    ...overrides,
  };
}

// ─── listVoiceProfiles ───────────────────────────────────────────────────────

describe('listVoiceProfiles', () => {
  it('orders by version DESC filtered by user_id', async () => {
    pushPool({ rows: [profileRow()] });
    const r = await listVoiceProfiles({ userId: 'u-1' });
    expect(r).toHaveLength(1);
    expect(poolCalls[0]!.sql).toMatch(/FROM agos_autobiographer_voice_profiles/);
    expect(poolCalls[0]!.sql).toMatch(/WHERE user_id = \$1/);
    expect(poolCalls[0]!.sql).toMatch(/ORDER BY version DESC/);
  });

  it('filters by is_active when provided', async () => {
    pushPool({ rows: [] });
    await listVoiceProfiles({ userId: 'u-1', isActive: true });
    expect(poolCalls[0]!.sql).toMatch(/is_active = \$\d+/);
    expect(poolCalls[0]!.params).toContain(true);
  });

  it('coerces JSONB arrays + booleans + numbers', async () => {
    pushPool({
      rows: [
        profileRow({
          style_rules: '["a", "b"]',
          example_openings: '["x"]',
          version: '5',
        }),
      ],
    });
    const [row] = await listVoiceProfiles({ userId: 'u-1' });
    expect(row!.styleRules).toEqual(['a', 'b']);
    expect(row!.exampleOpenings).toEqual(['x']);
    expect(row!.version).toBe(5);
  });
});

// ─── getActiveVoiceProfile ───────────────────────────────────────────────────

describe('getActiveVoiceProfile', () => {
  it('queries WHERE is_active = true LIMIT 1', async () => {
    pushPool({ rows: [profileRow()] });
    await getActiveVoiceProfile('u-1');
    expect(poolCalls[0]!.sql).toMatch(/WHERE user_id = \$1 AND is_active = true/);
    expect(poolCalls[0]!.sql).toMatch(/LIMIT 1/);
  });

  it('returns null when no active profile exists', async () => {
    pushPool({ rows: [], rowCount: 0 });
    expect(await getActiveVoiceProfile('u-1')).toBeNull();
  });
});

// ─── getVoiceProfile ─────────────────────────────────────────────────────────

describe('getVoiceProfile', () => {
  it('filters by user_id (cross-ownership)', async () => {
    pushPool({ rows: [profileRow()] });
    await getVoiceProfile('pr-1', 'u-1');
    expect(poolCalls[0]!.sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
  });
});

// ─── insertVoiceProfile ──────────────────────────────────────────────────────

describe('insertVoiceProfile', () => {
  it('wraps INSERT in a BEGIN/COMMIT transaction', async () => {
    pushClient({}); // BEGIN
    pushClient({}); // INSERT
    pushClient({}); // COMMIT
    pushPool({ rows: [profileRow()] }); // refetch via getVoiceProfile
    await insertVoiceProfile('u-1', {
      styleSummary: 'long enough style summary value here for validation',
      sampleCount: 1,
      sampleWordCount: 100,
    });
    const sqls = clientCalls.map((c) => c.sql);
    expect(sqls[0]).toMatch(/BEGIN/);
    expect(sqls.at(-1)).toMatch(/COMMIT/);
  });

  it('clears prior active rows first when setActive=true', async () => {
    pushClient({}); // BEGIN
    pushClient({}); // UPDATE clear
    pushClient({}); // INSERT
    pushClient({}); // COMMIT
    pushPool({ rows: [profileRow({ is_active: true })] });
    await insertVoiceProfile('u-1', {
      styleSummary: 'long enough style summary value here for validation',
      sampleCount: 1,
      sampleWordCount: 100,
      setActive: true,
    });
    expect(clientCalls[1]!.sql).toMatch(
      /UPDATE agos_autobiographer_voice_profiles[\s\S]+SET is_active = false/,
    );
    expect(clientCalls[2]!.sql).toMatch(
      /INSERT INTO agos_autobiographer_voice_profiles/,
    );
  });

  it('does NOT clear prior active rows when setActive is omitted', async () => {
    pushClient({}); // BEGIN
    pushClient({}); // INSERT
    pushClient({}); // COMMIT
    pushPool({ rows: [profileRow({ is_active: false })] });
    await insertVoiceProfile('u-1', {
      styleSummary: 'long enough style summary value here for validation',
      sampleCount: 1,
      sampleWordCount: 100,
    });
    expect(clientCalls.length).toBe(3); // BEGIN, INSERT, COMMIT
    expect(clientCalls[1]!.sql).toMatch(/INSERT INTO/);
  });

  it('derives version via MAX(version)+1 inside the INSERT', async () => {
    pushClient({}); // BEGIN
    pushClient({}); // INSERT
    pushClient({}); // COMMIT
    pushPool({ rows: [profileRow({ version: 2 })] });
    await insertVoiceProfile('u-1', {
      styleSummary: 'long enough style summary value here for validation',
      sampleCount: 1,
      sampleWordCount: 100,
    });
    expect(clientCalls[1]!.sql).toMatch(/MAX\(version\) \+ 1/);
  });

  it('ROLLBACKs and rethrows on insert failure', async () => {
    pushClient({}); // BEGIN
    pushClient({}); // INSERT (will throw via the next mock impl)
    clientMock.query.mockImplementationOnce(async () => ({
      rows: [],
      rowCount: 0,
    })); // BEGIN
    clientMock.query.mockImplementationOnce(async () => {
      throw new Error('boom');
    }); // INSERT throws
    clientMock.query.mockImplementationOnce(async () => ({
      rows: [],
      rowCount: 0,
    })); // ROLLBACK
    await expect(
      insertVoiceProfile('u-1', {
        styleSummary: 'long enough style summary value here for validation',
        sampleCount: 1,
        sampleWordCount: 100,
      }),
    ).rejects.toThrow(/boom/);
    expect(clientReleaseSpy).toHaveBeenCalled();
  });

  it('releases the client even on success', async () => {
    pushClient({}); // BEGIN
    pushClient({}); // INSERT
    pushClient({}); // COMMIT
    pushPool({ rows: [profileRow()] });
    await insertVoiceProfile('u-1', {
      styleSummary: 'long enough style summary value here for validation',
      sampleCount: 1,
      sampleWordCount: 100,
    });
    expect(clientReleaseSpy).toHaveBeenCalledTimes(1);
  });

  it('normalizes adjectives/rules/openings before insert', async () => {
    pushClient({});
    pushClient({});
    pushClient({});
    pushPool({ rows: [profileRow()] });
    await insertVoiceProfile('u-1', {
      styleSummary: 'long enough style summary value here for validation',
      styleAdjectives: ['Warm', 'warm', '', null as never],
      styleRules: ['Use short sentences', '', null as never],
      exampleOpenings: ['Once on a Tuesday'],
      sampleCount: 1,
      sampleWordCount: 100,
    });
    const insertParams = clientCalls[1]!.params;
    // adjectives at param 5 (1-based: id=1, user=2, active=3, summary=4, adj=5)
    expect(insertParams[4]).toEqual(['Warm']);
    expect(insertParams[5]).toBe(JSON.stringify(['Use short sentences']));
  });
});

// ─── activateProfile ─────────────────────────────────────────────────────────

describe('activateProfile', () => {
  it('returns null when the profile does not belong to the caller', async () => {
    pushClient({}); // BEGIN
    pushClient({ rows: [], rowCount: 0 }); // ownership probe
    pushClient({}); // ROLLBACK
    const r = await activateProfile('pr-other', 'u-1');
    expect(r).toBeNull();
    const sqls = clientCalls.map((c) => c.sql);
    expect(sqls[2]).toMatch(/ROLLBACK/);
  });

  it('clears other active rows then sets is_active=true on this row inside a tx', async () => {
    pushClient({}); // BEGIN
    pushClient({ rows: [{ '?column?': 1 }], rowCount: 1 }); // ownership probe
    pushClient({}); // UPDATE clear-others
    pushClient({}); // UPDATE this-row
    pushClient({}); // COMMIT
    pushPool({ rows: [profileRow({ is_active: true })] }); // refetch
    const r = await activateProfile('pr-1', 'u-1');
    expect(r!.isActive).toBe(true);

    const sqls = clientCalls.map((c) => c.sql);
    expect(sqls[0]).toMatch(/BEGIN/);
    expect(sqls[2]).toMatch(/SET is_active = false[\s\S]+id <> \$2/);
    expect(sqls[3]).toMatch(/SET is_active = true[\s\S]+id = \$1/);
    expect(sqls.at(-1)).toMatch(/COMMIT/);
  });

  it('ROLLBACKs and rethrows on mid-transaction failure', async () => {
    clientMock.query.mockImplementationOnce(async () => ({
      rows: [],
      rowCount: 0,
    })); // BEGIN
    clientMock.query.mockImplementationOnce(async () => ({
      rows: [{ '?column?': 1 }],
      rowCount: 1,
    })); // ownership ok
    clientMock.query.mockImplementationOnce(async () => {
      throw new Error('boom');
    }); // UPDATE clear-others fails
    clientMock.query.mockImplementationOnce(async () => ({
      rows: [],
      rowCount: 0,
    })); // ROLLBACK

    await expect(activateProfile('pr-1', 'u-1')).rejects.toThrow(/boom/);
    expect(clientReleaseSpy).toHaveBeenCalled();
  });

  it('releases the client even on success', async () => {
    pushClient({});
    pushClient({ rows: [{ '?column?': 1 }], rowCount: 1 });
    pushClient({});
    pushClient({});
    pushClient({});
    pushPool({ rows: [profileRow()] });
    await activateProfile('pr-1', 'u-1');
    expect(clientReleaseSpy).toHaveBeenCalledTimes(1);
  });
});

// ─── updateVoiceProfile ──────────────────────────────────────────────────────

describe('updateVoiceProfile', () => {
  it('issues UPDATE filtered by user_id without touching version or is_active', async () => {
    pushPool({}); // update
    pushPool({ rows: [profileRow()] }); // refetch
    await updateVoiceProfile('pr-1', 'u-1', { styleSummary: 'new summary' });
    expect(poolCalls[0]!.sql).toMatch(
      /UPDATE agos_autobiographer_voice_profiles/,
    );
    expect(poolCalls[0]!.sql).not.toMatch(/version\s*=/);
    expect(poolCalls[0]!.sql).not.toMatch(/is_active\s*=/);
    expect(poolCalls[0]!.sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
  });

  it('normalizes adjectives/rules/openings before update', async () => {
    pushPool({});
    pushPool({ rows: [profileRow()] });
    await updateVoiceProfile('pr-1', 'u-1', {
      styleAdjectives: ['Warm', 'warm'],
      styleRules: ['Use short sentences'],
      exampleOpenings: ['Once,'],
    });
    expect(poolCalls[0]!.params[3]).toEqual(['Warm']);
    expect(poolCalls[0]!.params[4]).toBe(JSON.stringify(['Use short sentences']));
    expect(poolCalls[0]!.params[5]).toBe(JSON.stringify(['Once,']));
  });
});

// ─── deactivate / delete ─────────────────────────────────────────────────────

describe('deactivateProfile', () => {
  it('only flips is_active when currently true', async () => {
    pushPool({ rowCount: 1 });
    expect(await deactivateProfile('pr-1', 'u-1')).toBe(true);
    expect(poolCalls[0]!.sql).toMatch(
      /SET is_active = false[\s\S]+is_active = true/,
    );
  });

  it('returns false when no active row matches', async () => {
    pushPool({ rowCount: 0 });
    expect(await deactivateProfile('pr-1', 'u-1')).toBe(false);
  });
});

describe('deleteVoiceProfile', () => {
  it('issues hard DELETE filtered by user_id', async () => {
    pushPool({ rowCount: 1 });
    expect(await deleteVoiceProfile('pr-1', 'u-1')).toBe(true);
    expect(poolCalls[0]!.sql).toMatch(
      /DELETE FROM agos_autobiographer_voice_profiles\s+WHERE id = \$1 AND user_id = \$2/,
    );
  });

  it('returns false on miss', async () => {
    pushPool({ rowCount: 0 });
    expect(await deleteVoiceProfile('missing', 'u-1')).toBe(false);
  });
});

/**
 * Autobiographer OS — voice-samples-repo unit tests.
 *
 * Mocks the shared pg Pool. Exercises listing/filtering, archive flag,
 * word-count recompute on bodyText updates, memory-backed lookup, and
 * the no-leak cross-ownership filter on every read.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PgResult {
  rows: any[];
  rowCount: number;
}

const queue: PgResult[] = [];
const calls: { sql: string; params: any[] }[] = [];

function pushResult(r: Partial<PgResult>): void {
  queue.push({
    rows: r.rows ?? [],
    rowCount: r.rowCount ?? r.rows?.length ?? 0,
  });
}

vi.mock('@/lib/agentic-os/autobiographer/session', () => ({
  getAutobiographerPool: () => ({
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return queue.shift() ?? { rows: [], rowCount: 0 };
    }),
  }),
}));

import {
  createVoiceSample,
  deleteVoiceSample,
  getVoiceSample,
  getVoiceSampleByMemory,
  listSamplesForBuilder,
  listVoiceSamples,
  updateVoiceSample,
} from '@/lib/agentic-os/autobiographer/voice-samples-repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function sampleRow(overrides: Record<string, any> = {}): any {
  return {
    id: 's-1',
    user_id: 'u-1',
    memory_id: null,
    title: null,
    body_text: 'I wrote a small thing one Tuesday.',
    word_count: 7,
    is_archived: false,
    metadata: {},
    created_at: new Date('2026-05-11T00:00:00Z'),
    updated_at: new Date('2026-05-11T01:00:00Z'),
    ...overrides,
  };
}

// ─── listVoiceSamples ────────────────────────────────────────────────────────

describe('listVoiceSamples', () => {
  it('queries voice_samples ordered by updated_at DESC, filtered by user_id', async () => {
    pushResult({ rows: [sampleRow()] });
    const r = await listVoiceSamples({ userId: 'u-1' });
    expect(r).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/FROM agos_autobiographer_voice_samples/);
    expect(calls[0]!.sql).toMatch(/WHERE user_id = \$1/);
    expect(calls[0]!.sql).toMatch(/ORDER BY updated_at DESC/);
  });

  it('filters by is_archived when provided', async () => {
    pushResult({ rows: [] });
    await listVoiceSamples({ userId: 'u-1', isArchived: true });
    expect(calls[0]!.sql).toMatch(/is_archived = \$\d+/);
    expect(calls[0]!.params).toContain(true);
  });

  it('filters memory_backed=true with NOT NULL', async () => {
    pushResult({ rows: [] });
    await listVoiceSamples({ userId: 'u-1', memoryBacked: true });
    expect(calls[0]!.sql).toMatch(/memory_id IS NOT NULL/);
  });

  it('filters memory_backed=false with IS NULL', async () => {
    pushResult({ rows: [] });
    await listVoiceSamples({ userId: 'u-1', memoryBacked: false });
    expect(calls[0]!.sql).toMatch(/memory_id IS NULL/);
  });

  it('search q hits title + body_text', async () => {
    pushResult({ rows: [] });
    await listVoiceSamples({ userId: 'u-1', q: 'tuesday' });
    expect(calls[0]!.sql).toMatch(/lower\(body_text\) LIKE/);
    expect(calls[0]!.params.some((p: any) => /tuesday/.test(String(p)))).toBe(
      true,
    );
  });

  it('caps limit at 200 and defaults to 50', async () => {
    pushResult({ rows: [] });
    await listVoiceSamples({ userId: 'u-1' });
    expect(calls[0]!.params.at(-2)).toBe(50);

    queue.length = 0;
    calls.length = 0;
    pushResult({ rows: [] });
    await listVoiceSamples({ userId: 'u-1', limit: 500 });
    expect(calls[0]!.params.at(-2)).toBe(200);
  });

  it('coerces rows: numbers + booleans + nulls', async () => {
    pushResult({
      rows: [
        sampleRow({
          word_count: '42',
          is_archived: true,
          memory_id: 'm-1',
        }),
      ],
    });
    const [row] = await listVoiceSamples({ userId: 'u-1' });
    expect(row!.wordCount).toBe(42);
    expect(row!.isArchived).toBe(true);
    expect(row!.memoryId).toBe('m-1');
  });
});

// ─── getVoiceSample ──────────────────────────────────────────────────────────

describe('getVoiceSample', () => {
  it('returns null on miss', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await getVoiceSample('missing', 'u-1')).toBeNull();
  });

  it('filters by user_id (cross-ownership)', async () => {
    pushResult({ rows: [sampleRow()] });
    await getVoiceSample('s-1', 'u-1');
    expect(calls[0]!.sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
    expect(calls[0]!.params).toEqual(['s-1', 'u-1']);
  });
});

// ─── getVoiceSampleByMemory ──────────────────────────────────────────────────

describe('getVoiceSampleByMemory', () => {
  it('queries by memory_id + user_id LIMIT 1', async () => {
    pushResult({ rows: [sampleRow({ memory_id: 'm-1' })] });
    const r = await getVoiceSampleByMemory('m-1', 'u-1');
    expect(r!.memoryId).toBe('m-1');
    expect(calls[0]!.sql).toMatch(/WHERE memory_id = \$1 AND user_id = \$2/);
    expect(calls[0]!.sql).toMatch(/LIMIT 1/);
    expect(calls[0]!.params).toEqual(['m-1', 'u-1']);
  });

  it('returns null when no sample is backed by the memory', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await getVoiceSampleByMemory('m-1', 'u-1')).toBeNull();
  });
});

// ─── createVoiceSample ───────────────────────────────────────────────────────

describe('createVoiceSample', () => {
  it('inserts with server-computed word_count', async () => {
    pushResult({}); // insert
    pushResult({ rows: [sampleRow({ word_count: 5 })] }); // refetch
    const r = await createVoiceSample('u-1', {
      bodyText: 'one two three four five',
    });
    expect(r.wordCount).toBe(5);
    // word_count is param index 6 (1-based: id=1, user=2, memory=3, title=4, body=5, wc=6)
    expect(calls[0]!.params[5]).toBe(5);
    expect(calls[0]!.sql).toMatch(/INSERT INTO agos_autobiographer_voice_samples/);
  });

  it('forwards memory_id when set', async () => {
    pushResult({});
    pushResult({ rows: [sampleRow({ memory_id: 'm-1' })] });
    await createVoiceSample('u-1', {
      memoryId: 'm-1',
      bodyText: 'short body',
    });
    expect(calls[0]!.params[2]).toBe('m-1');
  });

  it('defaults memory_id + title + is_archived to null/false', async () => {
    pushResult({});
    pushResult({ rows: [sampleRow()] });
    await createVoiceSample('u-1', { bodyText: 'body' });
    expect(calls[0]!.params[2]).toBeNull(); // memory_id
    expect(calls[0]!.params[3]).toBeNull(); // title
    expect(calls[0]!.params[6]).toBe(false); // is_archived
  });

  it('throws when refetch returns no row', async () => {
    pushResult({}); // insert
    pushResult({ rows: [], rowCount: 0 }); // refetch
    await expect(
      createVoiceSample('u-1', { bodyText: 'b' }),
    ).rejects.toThrow(/Failed to create voice sample/);
  });
});

// ─── updateVoiceSample ───────────────────────────────────────────────────────

describe('updateVoiceSample', () => {
  it('issues UPDATE filtered by user_id', async () => {
    pushResult({});
    pushResult({ rows: [sampleRow()] });
    await updateVoiceSample('s-1', 'u-1', { title: 'New' });
    expect(calls[0]!.sql).toMatch(/UPDATE agos_autobiographer_voice_samples/);
    expect(calls[0]!.sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
  });

  it('recomputes word_count when bodyText is supplied', async () => {
    pushResult({});
    pushResult({ rows: [sampleRow({ word_count: 4 })] });
    await updateVoiceSample('s-1', 'u-1', {
      bodyText: 'four words now here',
    });
    expect(calls[0]!.params[4]).toBe(4);
  });

  it('leaves word_count untouched when only title is patched', async () => {
    pushResult({});
    pushResult({ rows: [sampleRow()] });
    await updateVoiceSample('s-1', 'u-1', { title: 'Renamed' });
    expect(calls[0]!.params[4]).toBeNull();
  });

  it('flips is_archived explicitly when boolean is supplied', async () => {
    pushResult({});
    pushResult({ rows: [sampleRow({ is_archived: true })] });
    await updateVoiceSample('s-1', 'u-1', { isArchived: true });
    expect(calls[0]!.params[5]).toBe(true);
  });

  it('leaves is_archived alone when omitted', async () => {
    pushResult({});
    pushResult({ rows: [sampleRow()] });
    await updateVoiceSample('s-1', 'u-1', { title: 'X' });
    expect(calls[0]!.params[5]).toBeNull();
  });
});

// ─── deleteVoiceSample ───────────────────────────────────────────────────────

describe('deleteVoiceSample', () => {
  it('issues hard DELETE filtered by user_id', async () => {
    pushResult({ rowCount: 1 });
    expect(await deleteVoiceSample('s-1', 'u-1')).toBe(true);
    expect(calls[0]!.sql).toMatch(
      /DELETE FROM agos_autobiographer_voice_samples\s+WHERE id = \$1 AND user_id = \$2/,
    );
  });

  it('returns false on miss', async () => {
    pushResult({ rowCount: 0 });
    expect(await deleteVoiceSample('missing', 'u-1')).toBe(false);
  });
});

// ─── listSamplesForBuilder ───────────────────────────────────────────────────

describe('listSamplesForBuilder', () => {
  it('selects only non-archived rows in created_at ASC order', async () => {
    pushResult({ rows: [sampleRow(), sampleRow({ id: 's-2' })] });
    const r = await listSamplesForBuilder('u-1');
    expect(r).toHaveLength(2);
    expect(calls[0]!.sql).toMatch(/is_archived = false/);
    expect(calls[0]!.sql).toMatch(/ORDER BY created_at ASC/);
  });

  it('coerces to the builder-input shape', async () => {
    pushResult({
      rows: [
        sampleRow({
          id: 's-1',
          title: 'Tuesday',
          body_text: 'words',
          word_count: '1',
          memory_id: 'm-1',
        }),
      ],
    });
    const [r] = await listSamplesForBuilder('u-1');
    expect(r).toEqual({
      id: 's-1',
      title: 'Tuesday',
      bodyText: 'words',
      wordCount: 1,
      memoryId: 'm-1',
    });
  });
});

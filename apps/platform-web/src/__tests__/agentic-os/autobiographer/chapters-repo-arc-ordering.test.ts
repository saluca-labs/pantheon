/**
 * Autobiographer OS — chapters-repo arc-ordering test.
 *
 * Phase 4 seam activation: `listChaptersForBook({order:'arc'})` resolves
 * the primary arc and routes chapters through the arc-chapters join.
 * When no primary arc exists, the function falls back to position
 * ordering — same behavior Phase 4 used.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
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

import { listChaptersForBook } from '@/lib/agentic-os/autobiographer/chapters-repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

describe('listChaptersForBook order="arc"', () => {
  it('falls back to position ordering when no primary arc exists', async () => {
    // 1) Primary arc probe → no rows
    pushResult({ rows: [] });
    // 2) Position-ordered fallback
    pushResult({ rows: [] });
    await listChaptersForBook({ userId: 'u-1', bookId: 'b-1', order: 'arc' });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.sql).toMatch(/ORDER BY position ASC/);
  });

  it('joins through arc_chapters when a primary arc exists', async () => {
    // 1) Primary arc probe → row
    pushResult({ rows: [{ id: 'a-1' }] });
    // 2) arc-ordered SQL
    pushResult({ rows: [] });
    await listChaptersForBook({ userId: 'u-1', bookId: 'b-1', order: 'arc' });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.sql).toMatch(/arc_membership AS/);
    expect(calls[1]!.sql).toMatch(/am\.position ASC/);
    expect(calls[1]!.params[0]).toBe('a-1');
  });

  it('preserves the previous default (position) when order is omitted', async () => {
    pushResult({ rows: [] });
    await listChaptersForBook({ userId: 'u-1', bookId: 'b-1' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/ORDER BY position ASC/);
  });

  it('honors order="updated_desc"', async () => {
    pushResult({ rows: [] });
    await listChaptersForBook({
      userId: 'u-1',
      bookId: 'b-1',
      order: 'updated_desc',
    });
    expect(calls[0]!.sql).toMatch(/ORDER BY updated_at DESC/);
  });
});

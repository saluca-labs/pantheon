/**
 * Autobiographer OS Phase 7 — coach sessions repo tests.
 *
 * Mocks the pg Pool and asserts the SQL shape + ownership wiring for
 * createSession / getSession / listSessions / updateSession /
 * appendMessages / patchMetadata / touchSession / deleteSession,
 * plus the autoTitle helper.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
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
  appendMessages,
  autoTitle,
  createSession,
  deleteSession,
  getSession,
  listSessions,
  patchMetadata,
  touchSession,
  updateSession,
} from '@/lib/agentic-os/autobiographer/coach/sessions-repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function sessionRow(over: Partial<Record<string, any>> = {}): any {
  return {
    id: 'sess-1',
    user_id: 'u-1',
    book_id: null,
    mode: 'general',
    title: 'A session',
    messages: [],
    metadata: {},
    created_at: new Date('2026-05-12T10:00:00Z'),
    updated_at: new Date('2026-05-12T10:05:00Z'),
    ...over,
  };
}

// ═════════ autoTitle ════════════════════════════════════════════════════════

describe('autoTitle', () => {
  it('returns trimmed message under 60 chars verbatim', () => {
    expect(autoTitle('What memory should I capture next?')).toBe(
      'What memory should I capture next?',
    );
  });

  it('collapses whitespace runs to single space', () => {
    expect(autoTitle('draft\n\n  the next   paragraph')).toBe(
      'draft the next paragraph',
    );
  });

  it('truncates long messages to 60 chars with ellipsis', () => {
    const long = 'a'.repeat(120);
    const result = autoTitle(long);
    expect(result.length).toBe(60);
    expect(result.endsWith('…')).toBe(true);
  });

  it('returns "New conversation" for empty / whitespace-only input', () => {
    expect(autoTitle('')).toBe('New conversation');
    expect(autoTitle('   ')).toBe('New conversation');
  });

  it('returns "New conversation" for null/undefined input', () => {
    expect(autoTitle(null as any)).toBe('New conversation');
    expect(autoTitle(undefined as any)).toBe('New conversation');
  });
});

// ═════════ createSession ════════════════════════════════════════════════════

describe('createSession', () => {
  it('rejects an invalid mode', async () => {
    await expect(
      createSession({
        userId: 'u-1',
        mode: 'procurement_advisor' as any,
        title: 'Hi',
      }),
    ).rejects.toThrow(/Invalid coach mode/);
  });

  it('inserts with the expected columns + JSONB casts', async () => {
    pushResult({ rows: [sessionRow()] });
    await createSession({
      userId: 'u-1',
      mode: 'general',
      bookId: null,
      title: 'A session',
      initialMessages: [
        { role: 'user', content: 'hello', created_at: '2026-05-12T10:00:00Z' },
      ],
      metadata: { system_prompt_version: 'v1' },
    });
    expect(calls.length).toBe(1);
    const c = calls[0];
    expect(c.sql).toMatch(/INSERT INTO agos_autobiographer_coach_sessions/);
    expect(c.sql).toMatch(/\$6::jsonb/);
    expect(c.sql).toMatch(/\$7::jsonb/);
    // params: id, user_id, book_id, mode, title, messages JSON, metadata JSON
    expect(c.params[1]).toBe('u-1');
    expect(c.params[2]).toBe(null);
    expect(c.params[3]).toBe('general');
    expect(c.params[4]).toBe('A session');
    expect(JSON.parse(c.params[5])[0].content).toBe('hello');
    expect(JSON.parse(c.params[6]).system_prompt_version).toBe('v1');
  });

  it('returns a hydrated CoachSession row', async () => {
    pushResult({ rows: [sessionRow({ title: 'My session', mode: 'interviewer' })] });
    const result = await createSession({
      userId: 'u-1',
      mode: 'interviewer',
      title: 'My session',
    });
    expect(result.title).toBe('My session');
    expect(result.mode).toBe('interviewer');
    expect(result.userId).toBe('u-1');
    expect(result.bookId).toBe(null);
  });
});

// ═════════ getSession ═══════════════════════════════════════════════════════

describe('getSession', () => {
  it('filters by user_id and returns null on no match', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const result = await getSession('sess-1', 'u-1');
    expect(result).toBeNull();
    expect(calls[0].sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
    expect(calls[0].params).toEqual(['sess-1', 'u-1']);
  });

  it('hydrates messages from JSONB row', async () => {
    pushResult({
      rows: [
        sessionRow({
          messages: [
            {
              role: 'user',
              content: 'one',
              created_at: '2026-05-12T10:00:00Z',
            },
            {
              role: 'assistant',
              content: 'reply',
              created_at: '2026-05-12T10:01:00Z',
            },
          ],
        }),
      ],
    });
    const result = await getSession('sess-1', 'u-1');
    expect(result!.messages.length).toBe(2);
    expect(result!.messages[0].role).toBe('user');
    expect(result!.messages[1].content).toBe('reply');
  });

  it('drops malformed message entries during hydration', async () => {
    pushResult({
      rows: [
        sessionRow({
          messages: [
            { role: 'user', content: 'ok' },
            { role: 'narrator', content: 'invalid role' }, // dropped
            { content: 'no role' }, // dropped
            null,
            'string-noise',
          ],
        }),
      ],
    });
    const result = await getSession('sess-1', 'u-1');
    expect(result!.messages.length).toBe(1);
    expect(result!.messages[0].role).toBe('user');
  });
});

// ═════════ listSessions ═════════════════════════════════════════════════════

describe('listSessions', () => {
  it('filters by user_id only when no mode/book/scope', async () => {
    pushResult({ rows: [] });
    await listSessions({ userId: 'u-1' });
    const c = calls[0];
    expect(c.sql).toMatch(/WHERE user_id = \$1/);
    expect(c.sql).toMatch(/ORDER BY updated_at DESC/);
  });

  it('adds mode filter when supplied', async () => {
    pushResult({ rows: [] });
    await listSessions({ userId: 'u-1', mode: 'chapter_drafter' });
    const c = calls[0];
    expect(c.sql).toMatch(/mode = \$2/);
    expect(c.params[1]).toBe('chapter_drafter');
  });

  it('adds book_id filter when supplied', async () => {
    pushResult({ rows: [] });
    await listSessions({ userId: 'u-1', bookId: 'b-1' });
    const c = calls[0];
    expect(c.sql).toMatch(/book_id = \$2/);
    expect(c.params[1]).toBe('b-1');
  });

  it('filters book_id IS NULL when scope=workshop', async () => {
    pushResult({ rows: [] });
    await listSessions({ userId: 'u-1', scope: 'workshop' });
    expect(calls[0].sql).toMatch(/book_id IS NULL/);
  });

  it('rejects an invalid mode filter', async () => {
    await expect(
      listSessions({ userId: 'u-1', mode: 'shop_safety' as any }),
    ).rejects.toThrow(/Invalid coach mode/);
  });

  it('clamps limit to [1, 200]', async () => {
    pushResult({ rows: [] });
    await listSessions({ userId: 'u-1', limit: 50000 });
    expect(calls[0].params).toContain(200);
    pushResult({ rows: [] });
    await listSessions({ userId: 'u-1', limit: -5 });
    expect(calls[1].params).toContain(1);
  });
});

// ═════════ updateSession ════════════════════════════════════════════════════

describe('updateSession', () => {
  it('returns null when target row missing', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const result = await updateSession('sess-1', 'u-1', { title: 'Renamed' });
    expect(result).toBeNull();
  });

  it('updates title only (mode is NOT touched)', async () => {
    pushResult({ rows: [sessionRow()] }); // getSession (existing check)
    pushResult({ rowCount: 1, rows: [] }); // UPDATE
    pushResult({ rows: [sessionRow({ title: 'Renamed' })] }); // getSession (post-write)
    const result = await updateSession('sess-1', 'u-1', { title: 'Renamed' });
    expect(result!.title).toBe('Renamed');
    // Check the UPDATE call doesn't touch mode
    const updateCall = calls.find((c) => c.sql.match(/^\s*UPDATE/));
    expect(updateCall).toBeDefined();
    expect(updateCall!.sql).not.toMatch(/mode\s*=/);
  });
});

// ═════════ appendMessages ═══════════════════════════════════════════════════

describe('appendMessages', () => {
  it('returns existing row when no messages to append', async () => {
    pushResult({ rows: [sessionRow()] });
    const result = await appendMessages('sess-1', 'u-1', []);
    expect(result!.id).toBe('sess-1');
    // No UPDATE call should have fired
    expect(calls.find((c) => c.sql.match(/UPDATE/))).toBeUndefined();
  });

  it('appends using the jsonb || concat operator', async () => {
    pushResult({ rows: [sessionRow()], rowCount: 1 });
    await appendMessages('sess-1', 'u-1', [
      { role: 'assistant', content: 'reply', created_at: '2026-05-12T10:02:00Z' },
    ]);
    expect(calls[0].sql).toMatch(/messages\s*=\s*messages \|\| \$3::jsonb/);
    expect(JSON.parse(calls[0].params[2])[0].role).toBe('assistant');
  });

  it('rejects an invalid role', async () => {
    await expect(
      appendMessages('sess-1', 'u-1', [
        { role: 'narrator' as any, content: 'x', created_at: '' },
      ]),
    ).rejects.toThrow(/Invalid message role/);
  });

  it('rejects a non-string content', async () => {
    await expect(
      appendMessages('sess-1', 'u-1', [
        { role: 'user', content: 42 as any, created_at: '' },
      ]),
    ).rejects.toThrow(/content must be a string/);
  });
});

// ═════════ patchMetadata ════════════════════════════════════════════════════

describe('patchMetadata', () => {
  it('merges using jsonb || concat', async () => {
    pushResult({ rows: [sessionRow()], rowCount: 1 });
    await patchMetadata('sess-1', 'u-1', { foo: 'bar' });
    expect(calls[0].sql).toMatch(/metadata\s*=\s*metadata \|\| \$3::jsonb/);
    expect(JSON.parse(calls[0].params[2]).foo).toBe('bar');
  });

  it('returns null when row missing', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const result = await patchMetadata('sess-1', 'u-1', { foo: 'bar' });
    expect(result).toBeNull();
  });
});

// ═════════ touchSession ═════════════════════════════════════════════════════

describe('touchSession', () => {
  it('bumps updated_at scoped by user_id', async () => {
    pushResult({ rows: [], rowCount: 1 });
    await touchSession('sess-1', 'u-1');
    expect(calls[0].sql).toMatch(/SET updated_at = now\(\)/);
    expect(calls[0].sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
  });
});

// ═════════ deleteSession ════════════════════════════════════════════════════

describe('deleteSession', () => {
  it('returns true when 1 row deleted', async () => {
    pushResult({ rows: [], rowCount: 1 });
    expect(await deleteSession('sess-1', 'u-1')).toBe(true);
  });

  it('returns false when no row deleted', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await deleteSession('sess-1', 'u-1')).toBe(false);
  });

  it('scopes DELETE by id AND user_id', async () => {
    pushResult({ rows: [], rowCount: 1 });
    await deleteSession('sess-1', 'u-1');
    expect(calls[0].sql).toMatch(/DELETE FROM agos_autobiographer_coach_sessions/);
    expect(calls[0].sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
  });
});

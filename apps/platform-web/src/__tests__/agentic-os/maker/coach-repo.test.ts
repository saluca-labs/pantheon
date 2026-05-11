/**
 * Maker OS Phase 7 — coach repo tests.
 *
 * Mocks the pg Pool and asserts the SQL shape + ownership wiring for
 * the one-table session repo (createSession / getSession /
 * listSessions / updateSession / appendMessages / touchSession /
 * deleteSession), plus the autoTitle helper.
 *
 * @license MIT — Tiresias Maker OS Phase 7 (internal).
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

vi.mock('@/lib/agentic-os/maker/session', () => ({
  getMakerPool: () => ({
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
  touchSession,
  updateSession,
} from '@/lib/agentic-os/maker/coach/repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function sessionRow(over: Partial<Record<string, any>> = {}): any {
  return {
    id: 'sess-1',
    user_id: 'u-1',
    project_id: null,
    mode: 'general',
    title: 'A session',
    messages: [],
    metadata: {},
    created_at: new Date('2026-05-11T10:00:00Z'),
    updated_at: new Date('2026-05-11T10:05:00Z'),
    ...over,
  };
}

// ═════════ autoTitle ════════════════════════════════════════════════════════

describe('autoTitle', () => {
  it('returns trimmed message under 60 chars verbatim', () => {
    expect(autoTitle('what should I order first?')).toBe('what should I order first?');
  });

  it('collapses whitespace runs to single space', () => {
    expect(autoTitle('walk    me\n\nthrough the BOM')).toBe('walk me through the BOM');
  });

  it('truncates long messages to 60 chars with ellipsis', () => {
    const long = 'a'.repeat(120);
    const result = autoTitle(long);
    expect(result.length).toBe(60);
    expect(result.endsWith('…')).toBe(true);
  });

  it('falls back to "New conversation" on empty input', () => {
    expect(autoTitle('')).toBe('New conversation');
    expect(autoTitle('   \n  ')).toBe('New conversation');
  });

  it('handles undefined-ish input without throwing', () => {
    expect(autoTitle(undefined as unknown as string)).toBe('New conversation');
  });
});

// ═════════ createSession ════════════════════════════════════════════════════

describe('createSession', () => {
  it('inserts a row with the given mode + project_id + title', async () => {
    pushResult({
      rows: [
        sessionRow({
          id: 'new-1',
          user_id: 'u-1',
          project_id: 'p-1',
          mode: 'build_planner',
          title: 'planner session',
        }),
      ],
    });
    const session = await createSession({
      userId: 'u-1',
      mode: 'build_planner',
      projectId: 'p-1',
      title: 'planner session',
    });
    expect(session.userId).toBe('u-1');
    expect(session.projectId).toBe('p-1');
    expect(session.mode).toBe('build_planner');
    expect(session.title).toBe('planner session');
    expect(calls[0].sql).toMatch(/INSERT INTO agos_maker_coach_sessions/);
    // Mode goes into param 4 of the INSERT.
    expect(calls[0].params[3]).toBe('build_planner');
    expect(calls[0].params[2]).toBe('p-1');
  });

  it('defaults project_id to null when omitted', async () => {
    pushResult({
      rows: [
        sessionRow({
          id: 'new-2',
          user_id: 'u-1',
          project_id: null,
          mode: 'general',
          title: 'workshop chat',
        }),
      ],
    });
    const session = await createSession({
      userId: 'u-1',
      mode: 'general',
      title: 'workshop chat',
    });
    expect(session.projectId).toBeNull();
    expect(calls[0].params[2]).toBeNull();
  });

  it('serializes initialMessages into the JSONB column', async () => {
    pushResult({
      rows: [
        sessionRow({
          id: 'new-3',
          messages: [{ role: 'user', content: 'hi', created_at: '2026-05-11T10:00:00Z' }],
        }),
      ],
    });
    await createSession({
      userId: 'u-1',
      mode: 'general',
      title: 'with initial',
      initialMessages: [{ role: 'user', content: 'hi', created_at: '2026-05-11T10:00:00Z' }],
    });
    expect(calls[0].params[5]).toBe(
      JSON.stringify([{ role: 'user', content: 'hi', created_at: '2026-05-11T10:00:00Z' }]),
    );
  });

  it('throws on invalid mode', async () => {
    await expect(
      createSession({
        userId: 'u-1',
        mode: 'not_a_mode' as any,
        title: 'x',
      }),
    ).rejects.toThrow(/Invalid coach mode/);
    expect(calls.length).toBe(0);
  });

  it('defaults metadata to {} when omitted', async () => {
    pushResult({ rows: [sessionRow({ id: 'new-4' })] });
    await createSession({ userId: 'u-1', mode: 'general', title: 'x' });
    expect(calls[0].params[6]).toBe('{}');
  });
});

// ═════════ getSession ═══════════════════════════════════════════════════════

describe('getSession', () => {
  it('selects with WHERE id AND user_id ownership filter', async () => {
    pushResult({ rows: [sessionRow({ id: 'sess-1', user_id: 'u-1' })] });
    const session = await getSession('sess-1', 'u-1');
    expect(session?.id).toBe('sess-1');
    expect(calls[0].sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
    expect(calls[0].params).toEqual(['sess-1', 'u-1']);
  });

  it('returns null on miss', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const session = await getSession('sess-x', 'u-1');
    expect(session).toBeNull();
  });

  it('coerces malformed messages JSONB to []', async () => {
    pushResult({
      rows: [
        sessionRow({
          id: 'sess-1',
          messages: [
            { role: 'user', content: 'good' },
            { role: 'invalid_role', content: 'dropped' },
            { content: 'no role' },
            { role: 'assistant', content: 'also good' },
          ],
        }),
      ],
    });
    const session = await getSession('sess-1', 'u-1');
    expect(session?.messages).toHaveLength(2);
    expect(session?.messages[0].role).toBe('user');
    expect(session?.messages[1].role).toBe('assistant');
  });

  it('coerces non-array messages to []', async () => {
    pushResult({ rows: [sessionRow({ messages: null })] });
    const session = await getSession('sess-1', 'u-1');
    expect(session?.messages).toEqual([]);
  });
});

// ═════════ listSessions ═════════════════════════════════════════════════════

describe('listSessions', () => {
  it('defaults to recent sessions ordered by updated_at DESC', async () => {
    pushResult({ rows: [sessionRow({ id: 's1' }), sessionRow({ id: 's2' })] });
    const sessions = await listSessions({ userId: 'u-1' });
    expect(sessions).toHaveLength(2);
    expect(calls[0].sql).toMatch(/ORDER BY updated_at DESC/);
    expect(calls[0].sql).toMatch(/user_id = \$1/);
  });

  it('filters by mode when supplied', async () => {
    pushResult({ rows: [] });
    await listSessions({ userId: 'u-1', mode: 'shop_safety' });
    expect(calls[0].sql).toMatch(/mode = \$\d+/);
    expect(calls[0].params).toContain('shop_safety');
  });

  it('rejects an invalid mode filter', async () => {
    await expect(
      listSessions({ userId: 'u-1', mode: 'bogus' as any }),
    ).rejects.toThrow(/Invalid coach mode/);
  });

  it('filters by project_id when supplied', async () => {
    pushResult({ rows: [] });
    await listSessions({ userId: 'u-1', projectId: 'p-1' });
    expect(calls[0].sql).toMatch(/project_id = \$\d+/);
    expect(calls[0].params).toContain('p-1');
  });

  it('filters to workshop-scope (project_id IS NULL) when scope=workshop and no projectId', async () => {
    pushResult({ rows: [] });
    await listSessions({ userId: 'u-1', scope: 'workshop' });
    expect(calls[0].sql).toMatch(/project_id IS NULL/);
  });

  it('prefers projectId over scope when both supplied', async () => {
    pushResult({ rows: [] });
    await listSessions({ userId: 'u-1', projectId: 'p-1', scope: 'workshop' });
    expect(calls[0].sql).not.toMatch(/project_id IS NULL/);
    expect(calls[0].sql).toMatch(/project_id = \$\d+/);
  });

  it('caps limit at 200', async () => {
    pushResult({ rows: [] });
    await listSessions({ userId: 'u-1', limit: 9999 });
    // Limit is the second-to-last param.
    expect(calls[0].params[calls[0].params.length - 2]).toBe(200);
  });

  it('floors limit at 1', async () => {
    pushResult({ rows: [] });
    await listSessions({ userId: 'u-1', limit: -5 });
    expect(calls[0].params[calls[0].params.length - 2]).toBe(1);
  });

  it('defaults limit to 20', async () => {
    pushResult({ rows: [] });
    await listSessions({ userId: 'u-1' });
    expect(calls[0].params[calls[0].params.length - 2]).toBe(20);
  });

  it('clamps negative offset to 0', async () => {
    pushResult({ rows: [] });
    await listSessions({ userId: 'u-1', offset: -5 });
    expect(calls[0].params[calls[0].params.length - 1]).toBe(0);
  });
});

// ═════════ updateSession ════════════════════════════════════════════════════

describe('updateSession', () => {
  it('returns null when the session does not exist', async () => {
    // getSession lookup
    pushResult({ rows: [], rowCount: 0 });
    const out = await updateSession('sess-x', 'u-1', { title: 'new' });
    expect(out).toBeNull();
    // Only the getSession pre-check; no UPDATE issued.
    expect(calls.length).toBe(1);
  });

  it('updates the title with COALESCE and bumps updated_at', async () => {
    pushResult({ rows: [sessionRow({ id: 'sess-1' })] }); // getSession
    pushResult({ rows: [], rowCount: 1 }); // UPDATE
    pushResult({ rows: [sessionRow({ id: 'sess-1', title: 'renamed' })] }); // getSession after
    const out = await updateSession('sess-1', 'u-1', { title: 'renamed' });
    expect(out?.title).toBe('renamed');
    expect(calls[1].sql).toMatch(/UPDATE agos_maker_coach_sessions/);
    expect(calls[1].sql).toMatch(/SET title\s+= COALESCE\(\$3, title\)/);
    expect(calls[1].sql).toMatch(/updated_at = now\(\)/);
    expect(calls[1].sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
  });
});

// ═════════ appendMessages ═══════════════════════════════════════════════════

describe('appendMessages', () => {
  it('UPDATEs with messages || $3::jsonb (race-safe concat)', async () => {
    pushResult({ rows: [sessionRow({ messages: [{ role: 'user', content: 'hi', created_at: '2026-05-11T10:00:00Z' }] })] });
    await appendMessages('sess-1', 'u-1', [
      { role: 'user', content: 'hi', created_at: '2026-05-11T10:00:00Z' },
    ]);
    expect(calls[0].sql).toMatch(/UPDATE agos_maker_coach_sessions/);
    expect(calls[0].sql).toMatch(/SET messages\s+= messages \|\| \$3::jsonb/);
    expect(calls[0].sql).toMatch(/updated_at = now\(\)/);
    expect(calls[0].sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
  });

  it('skips DB call when given an empty array (returns current row)', async () => {
    pushResult({ rows: [sessionRow()] }); // getSession
    await appendMessages('sess-1', 'u-1', []);
    expect(calls.length).toBe(1); // only the getSession call
    expect(calls[0].sql).toMatch(/^SELECT/);
  });

  it('rejects unknown role', async () => {
    await expect(
      appendMessages('sess-1', 'u-1', [
        { role: 'admin' as any, content: 'x', created_at: '2026-05-11T10:00:00Z' },
      ]),
    ).rejects.toThrow(/Invalid message role/);
  });

  it('rejects non-string content', async () => {
    await expect(
      appendMessages('sess-1', 'u-1', [
        { role: 'user', content: 123 as any, created_at: '2026-05-11T10:00:00Z' },
      ]),
    ).rejects.toThrow(/content must be a string/);
  });

  it('returns null on cross-ownership miss (UPDATE row count 0)', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const out = await appendMessages('sess-x', 'u-other', [
      { role: 'user', content: 'hi', created_at: '2026-05-11T10:00:00Z' },
    ]);
    expect(out).toBeNull();
  });

  it('JSON-encodes the messages array for the param', async () => {
    pushResult({ rows: [sessionRow()] });
    const msgs = [
      { role: 'user' as const, content: 'hi', created_at: '2026-05-11T10:00:00Z' },
      { role: 'assistant' as const, content: 'hello', created_at: '2026-05-11T10:00:05Z' },
    ];
    await appendMessages('sess-1', 'u-1', msgs);
    expect(calls[0].params[2]).toBe(JSON.stringify(msgs));
  });
});

// ═════════ touchSession ═════════════════════════════════════════════════════

describe('touchSession', () => {
  it('bumps updated_at scoped to user', async () => {
    pushResult({ rowCount: 1 });
    await touchSession('sess-1', 'u-1');
    expect(calls[0].sql).toMatch(/SET updated_at = now\(\)/);
    expect(calls[0].sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
    expect(calls[0].params).toEqual(['sess-1', 'u-1']);
  });
});

// ═════════ deleteSession ════════════════════════════════════════════════════

describe('deleteSession', () => {
  it('issues DELETE WHERE id AND user_id', async () => {
    pushResult({ rowCount: 1 });
    const ok = await deleteSession('sess-1', 'u-1');
    expect(ok).toBe(true);
    expect(calls[0].sql).toMatch(/DELETE FROM agos_maker_coach_sessions/);
    expect(calls[0].sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
  });

  it('returns false on cross-ownership miss', async () => {
    pushResult({ rowCount: 0 });
    const ok = await deleteSession('sess-1', 'u-other');
    expect(ok).toBe(false);
  });
});

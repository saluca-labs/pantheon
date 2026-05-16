/**
 * Research OS Phase 7 — coach sessions repo tests.
 *
 * Covers:
 *   - createSession SQL shape, mode validation, JSONB marshaling.
 *   - getSession ownership filter.
 *   - listSessions filter composition (mode + experimentId + scope).
 *   - updateSession title-only patch (no mode mutation).
 *   - appendMessages SQL shape + role validation.
 *   - patchMetadata + touchSession SQL shape.
 *   - deleteSession returns boolean.
 *   - autoTitle pure helper.
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const poolMock = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('@/lib/agentic-os/research/session', () => ({
  getResearchPool: () => poolMock,
  getCurrentResearchUser: vi.fn(),
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
} from '@/lib/agentic-os/research/coach/sessions-repo';

beforeEach(() => {
  poolMock.query.mockReset();
});

function fakeRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 's-1',
    user_id: 'u-1',
    experiment_id: null,
    mode: 'general',
    title: 'My session',
    messages: [],
    metadata: {},
    created_at: new Date('2026-05-01T00:00:00Z'),
    updated_at: new Date('2026-05-02T00:00:00Z'),
    ...over,
  };
}

describe('autoTitle', () => {
  it('returns "New conversation" for empty input', () => {
    expect(autoTitle('')).toBe('New conversation');
    expect(autoTitle('   ')).toBe('New conversation');
  });

  it('returns the trimmed input when short enough', () => {
    expect(autoTitle('  hello world  ')).toBe('hello world');
  });

  it('collapses whitespace to single spaces', () => {
    expect(autoTitle('one\n\ntwo   three')).toBe('one two three');
  });

  it('truncates to <= 60 chars with ellipsis', () => {
    const long = 'a'.repeat(80);
    const out = autoTitle(long);
    expect(out.length).toBe(60);
    expect(out.endsWith('…')).toBe(true);
  });

  it('leaves a 60-char input unchanged', () => {
    const sixty = 'a'.repeat(60);
    expect(autoTitle(sixty)).toBe(sixty);
  });
});

describe('createSession', () => {
  it('inserts a row with the supplied fields', async () => {
    poolMock.query.mockResolvedValue({ rows: [fakeRow()], rowCount: 1 });
    const out = await createSession({
      userId: 'u-1',
      mode: 'general',
      title: 'New thread',
    });
    expect(out.id).toBeTruthy();
    expect(out.mode).toBe('general');
    const call = poolMock.query.mock.calls[0]!;
    expect(call[0]).toMatch(/INSERT INTO agos_research_coach_sessions/);
    expect(call[0]).toMatch(/RETURNING/);
  });

  it('serializes messages + metadata as JSON', async () => {
    poolMock.query.mockResolvedValue({ rows: [fakeRow()], rowCount: 1 });
    await createSession({
      userId: 'u-1',
      mode: 'lit_reviewer',
      title: 'X',
      initialMessages: [
        { role: 'user', content: 'hello', created_at: '2026-05-12T00:00:00Z' },
      ],
      metadata: { system_prompt_version: 'v1' },
    });
    const params = poolMock.query.mock.calls[0]![1];
    expect(JSON.parse(params[5])).toEqual([
      { role: 'user', content: 'hello', created_at: '2026-05-12T00:00:00Z' },
    ]);
    expect(JSON.parse(params[6])).toEqual({ system_prompt_version: 'v1' });
  });

  it('throws on invalid mode (defense-in-depth past the route)', async () => {
    await expect(
      createSession({
        userId: 'u-1',
        mode: 'narrative_critic' as never,
        title: 'X',
      }),
    ).rejects.toThrow(/Invalid coach mode/);
  });

  it('persists experiment_id when supplied', async () => {
    poolMock.query.mockResolvedValue({
      rows: [fakeRow({ experiment_id: 'exp-1' })],
      rowCount: 1,
    });
    await createSession({
      userId: 'u-1',
      mode: 'methods_advisor',
      title: 'X',
      experimentId: 'exp-1',
    });
    const params = poolMock.query.mock.calls[0]![1];
    expect(params[2]).toBe('exp-1');
  });

  it('defaults experiment_id to null when omitted', async () => {
    poolMock.query.mockResolvedValue({ rows: [fakeRow()], rowCount: 1 });
    await createSession({
      userId: 'u-1',
      mode: 'general',
      title: 'X',
    });
    const params = poolMock.query.mock.calls[0]![1];
    expect(params[2]).toBeNull();
  });

  it('all 4 valid modes pass the validator', async () => {
    poolMock.query.mockResolvedValue({ rows: [fakeRow()], rowCount: 1 });
    for (const m of [
      'lit_reviewer',
      'hypothesis_critic',
      'methods_advisor',
      'general',
    ] as const) {
      poolMock.query.mockClear();
      await createSession({
        userId: 'u-1',
        mode: m,
        title: 'X',
        experimentId: m === 'methods_advisor' ? 'exp-1' : null,
      });
      expect(poolMock.query).toHaveBeenCalled();
    }
  });
});

describe('getSession', () => {
  it('returns null when no row matches', async () => {
    poolMock.query.mockResolvedValue({ rows: [], rowCount: 0 });
    const out = await getSession('s-1', 'u-1');
    expect(out).toBeNull();
  });

  it('returns the hydrated session when found', async () => {
    poolMock.query.mockResolvedValue({ rows: [fakeRow()], rowCount: 1 });
    const out = await getSession('s-1', 'u-1');
    expect(out).not.toBeNull();
    expect(out!.id).toBe('s-1');
    expect(out!.userId).toBe('u-1');
  });

  it('filters by user_id in the SQL', async () => {
    poolMock.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await getSession('s-1', 'u-1');
    const sql = poolMock.query.mock.calls[0]![0];
    expect(sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
  });

  it('hydrates date columns to ISO strings', async () => {
    poolMock.query.mockResolvedValue({ rows: [fakeRow()], rowCount: 1 });
    const out = await getSession('s-1', 'u-1');
    expect(out!.createdAt).toMatch(/2026-05-01T00:00:00\.000Z/);
    expect(out!.updatedAt).toMatch(/2026-05-02T00:00:00\.000Z/);
  });

  it('coerces messages array, dropping malformed entries', async () => {
    poolMock.query.mockResolvedValue({
      rows: [
        fakeRow({
          messages: [
            { role: 'user', content: 'hi', created_at: '2026-05-12T00:00:00Z' },
            { role: 'invalid_role', content: 'x', created_at: '2026-05-12T00:00:00Z' },
            { role: 'assistant', content: 42 },
            { role: 'assistant', content: 'ok' },
          ],
        }),
      ],
      rowCount: 1,
    });
    const out = await getSession('s-1', 'u-1');
    expect(out!.messages.length).toBe(2);
    expect(out!.messages[0]!.role).toBe('user');
    expect(out!.messages[1]!.role).toBe('assistant');
  });
});

describe('listSessions', () => {
  it('lists with user_id only', async () => {
    poolMock.query.mockResolvedValue({ rows: [fakeRow()], rowCount: 1 });
    await listSessions({ userId: 'u-1' });
    const sql = poolMock.query.mock.calls[0]![0];
    expect(sql).toMatch(/WHERE user_id = \$1/);
    expect(sql).toMatch(/ORDER BY updated_at DESC/);
  });

  it('adds the mode filter when supplied', async () => {
    poolMock.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await listSessions({ userId: 'u-1', mode: 'lit_reviewer' });
    const sql = poolMock.query.mock.calls[0]![0];
    expect(sql).toMatch(/mode = \$2/);
  });

  it('rejects invalid modes', async () => {
    await expect(
      listSessions({ userId: 'u-1', mode: 'nonsense' as never }),
    ).rejects.toThrow(/Invalid coach mode/);
  });

  it('adds experiment_id filter when supplied', async () => {
    poolMock.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await listSessions({ userId: 'u-1', experimentId: 'exp-1' });
    const sql = poolMock.query.mock.calls[0]![0];
    expect(sql).toMatch(/experiment_id = \$2/);
  });

  it('scope=workshop filters experiment_id IS NULL', async () => {
    poolMock.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await listSessions({ userId: 'u-1', scope: 'workshop' });
    const sql = poolMock.query.mock.calls[0]![0];
    expect(sql).toMatch(/experiment_id IS NULL/);
  });

  it('experimentId takes precedence over scope=workshop', async () => {
    poolMock.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await listSessions({
      userId: 'u-1',
      experimentId: 'exp-1',
      scope: 'workshop',
    });
    const sql = poolMock.query.mock.calls[0]![0];
    expect(sql).toMatch(/experiment_id = \$2/);
    expect(sql).not.toMatch(/experiment_id IS NULL/);
  });

  it('clamps limit to [1, 200]', async () => {
    poolMock.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await listSessions({ userId: 'u-1', limit: 9999 });
    const params = poolMock.query.mock.calls[0]![1];
    // Find the limit positional (second-to-last)
    expect(params[params.length - 2]).toBe(200);
  });

  it('clamps negative limit to 1', async () => {
    poolMock.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await listSessions({ userId: 'u-1', limit: -5 });
    const params = poolMock.query.mock.calls[0]![1];
    expect(params[params.length - 2]).toBe(1);
  });
});

describe('updateSession', () => {
  it('returns null when the session doesn\'t exist', async () => {
    poolMock.query.mockResolvedValue({ rows: [], rowCount: 0 });
    const out = await updateSession('s-1', 'u-1', { title: 'New' });
    expect(out).toBeNull();
  });

  it('only updates the title field', async () => {
    // First call: getSession returns existing row.
    poolMock.query.mockResolvedValueOnce({ rows: [fakeRow()], rowCount: 1 });
    // Second call: UPDATE.
    poolMock.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // Third call: getSession returns the patched row.
    poolMock.query.mockResolvedValueOnce({
      rows: [fakeRow({ title: 'New' })],
      rowCount: 1,
    });
    const out = await updateSession('s-1', 'u-1', { title: 'New' });
    expect(out!.title).toBe('New');
    // Second SQL call should be the UPDATE.
    const updateSql = poolMock.query.mock.calls[1]![0];
    expect(updateSql).toMatch(/UPDATE agos_research_coach_sessions/);
    expect(updateSql).toMatch(/SET title/);
    expect(updateSql).not.toMatch(/SET mode/);
  });
});

describe('appendMessages', () => {
  it('returns null when the session doesn\'t exist', async () => {
    poolMock.query.mockResolvedValue({ rows: [], rowCount: 0 });
    const out = await appendMessages('s-1', 'u-1', [
      { role: 'user', content: 'hi', created_at: '2026-05-12T00:00:00Z' },
    ]);
    expect(out).toBeNull();
  });

  it('appends with messages || patch JSONB op', async () => {
    poolMock.query.mockResolvedValue({ rows: [fakeRow()], rowCount: 1 });
    await appendMessages('s-1', 'u-1', [
      { role: 'user', content: 'hi', created_at: '2026-05-12T00:00:00Z' },
    ]);
    const sql = poolMock.query.mock.calls[0]![0];
    expect(sql).toMatch(/messages\s*=\s*messages \|\| \$3::jsonb/);
    expect(sql).toMatch(/UPDATE agos_research_coach_sessions/);
  });

  it('returns the existing session when called with [] (no-op)', async () => {
    poolMock.query.mockResolvedValue({ rows: [fakeRow()], rowCount: 1 });
    const out = await appendMessages('s-1', 'u-1', []);
    expect(out).not.toBeNull();
    // The SQL called was a getSession (no UPDATE).
    const sql = poolMock.query.mock.calls[0]![0];
    expect(sql).toMatch(/SELECT/);
  });

  it('rejects messages with an invalid role', async () => {
    await expect(
      appendMessages('s-1', 'u-1', [
        { role: 'invalid' as never, content: 'x', created_at: '2026-05-12T00:00:00Z' },
      ]),
    ).rejects.toThrow(/Invalid message role/);
  });

  it('rejects messages with non-string content', async () => {
    await expect(
      appendMessages('s-1', 'u-1', [
        { role: 'user', content: 42 as never, created_at: '2026-05-12T00:00:00Z' },
      ]),
    ).rejects.toThrow(/content must be a string/);
  });
});

describe('patchMetadata', () => {
  it('runs an UPDATE with metadata || patch', async () => {
    poolMock.query.mockResolvedValue({ rows: [fakeRow()], rowCount: 1 });
    await patchMetadata('s-1', 'u-1', { foo: 'bar' });
    const sql = poolMock.query.mock.calls[0]![0];
    expect(sql).toMatch(/metadata\s*=\s*metadata \|\| \$3::jsonb/);
  });

  it('returns null when no row matches', async () => {
    poolMock.query.mockResolvedValue({ rows: [], rowCount: 0 });
    const out = await patchMetadata('s-1', 'u-1', { foo: 'bar' });
    expect(out).toBeNull();
  });
});

describe('touchSession', () => {
  it('runs an UPDATE setting updated_at = now()', async () => {
    poolMock.query.mockResolvedValue({ rowCount: 1, rows: [] });
    await touchSession('s-1', 'u-1');
    const sql = poolMock.query.mock.calls[0]![0];
    expect(sql).toMatch(/UPDATE agos_research_coach_sessions/);
    expect(sql).toMatch(/SET updated_at = now\(\)/);
  });
});

describe('deleteSession', () => {
  it('returns true when a row was deleted', async () => {
    poolMock.query.mockResolvedValue({ rowCount: 1, rows: [] });
    expect(await deleteSession('s-1', 'u-1')).toBe(true);
  });

  it('returns false when nothing was deleted', async () => {
    poolMock.query.mockResolvedValue({ rowCount: 0, rows: [] });
    expect(await deleteSession('s-1', 'u-1')).toBe(false);
  });

  it('filters by user_id in the SQL', async () => {
    poolMock.query.mockResolvedValue({ rowCount: 0, rows: [] });
    await deleteSession('s-1', 'u-1');
    const sql = poolMock.query.mock.calls[0]![0];
    expect(sql).toMatch(/DELETE FROM agos_research_coach_sessions/);
    expect(sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
  });
});

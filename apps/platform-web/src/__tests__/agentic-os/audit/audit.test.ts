/**
 * Agentic OS — audit reader unit tests.
 *
 * Tests:
 *   1. Cursor encode/decode round-trips and rejects malformed input.
 *   2. listAudit builds correct WHERE clause for each filter combination.
 *   3. listAudit returns a nextCursor only when there are more rows.
 *   4. isValidSlug enforces the registered slug allowlist.
 *
 * The DB pool is mocked so no real Postgres is required.
 *
 * @license MIT — Tiresias platform (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();

vi.mock('@/lib/agentic-os/maker/session', () => ({
  getMakerPool: () => ({ query: queryMock }),
  getCurrentMakerUser: vi.fn(),
}));

import {
  listAudit,
  encodeCursor,
  decodeCursor,
  isValidSlug,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  type AuditCursor,
} from '@/lib/agentic-os/audit/repo';

beforeEach(() => {
  queryMock.mockReset();
});

function fakeRow(overrides: Partial<{ id: string; created_at: Date; os_slug: string; action: string; payload: unknown; actor_id: string | null }> = {}) {
  return {
    id: overrides.id ?? '11111111-1111-1111-1111-111111111111',
    actor_id: overrides.actor_id ?? 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    os_slug: overrides.os_slug ?? 'maker',
    action: overrides.action ?? 'maker.build.created',
    payload: 'payload' in overrides ? overrides.payload : { foo: 'bar' },
    created_at: overrides.created_at ?? new Date('2026-05-07T12:00:00.000Z'),
  };
}

describe('audit cursor codec', () => {
  it('round-trips a valid cursor', () => {
    const c: AuditCursor = { ts: '2026-05-07T12:00:00.000Z', id: '11111111-1111-1111-1111-111111111111' };
    const encoded = encodeCursor(c);
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);
    const decoded = decodeCursor(encoded);
    expect(decoded).toEqual(c);
  });

  it('rejects garbage strings', () => {
    expect(decodeCursor('not-base64!!!')).toBeNull();
    expect(decodeCursor('')).toBeNull();
    expect(decodeCursor('YWJjZGVm')).toBeNull(); // base64 of 'abcdef' — not JSON
  });

  it('rejects cursors missing ts or id', () => {
    const bad1 = Buffer.from(JSON.stringify({ ts: '2026-05-07T12:00:00Z' }), 'utf8').toString('base64url');
    expect(decodeCursor(bad1)).toBeNull();
    const bad2 = Buffer.from(JSON.stringify({ id: '11111111-1111-1111-1111-111111111111' }), 'utf8').toString('base64url');
    expect(decodeCursor(bad2)).toBeNull();
  });

  it('rejects cursors with unparseable timestamps', () => {
    const bad = Buffer.from(JSON.stringify({ ts: 'not-a-date', id: '11111111-1111-1111-1111-111111111111' }), 'utf8').toString('base64url');
    expect(decodeCursor(bad)).toBeNull();
  });

  it('rejects cursors with non-uuid-like ids', () => {
    const bad = Buffer.from(JSON.stringify({ ts: '2026-05-07T12:00:00.000Z', id: 'short' }), 'utf8').toString('base64url');
    expect(decodeCursor(bad)).toBeNull();
  });
});

describe('isValidSlug', () => {
  it('accepts every registered Agentic OS slug', () => {
    const slugs = ['health', 'maker', 'research', 'secure-dev', 'cyber', 'filmmaker', 'autobiographer', 'business', 'creator'];
    for (const s of slugs) {
      expect(isValidSlug(s)).toBe(true);
    }
  });

  it('rejects unregistered slugs', () => {
    expect(isValidSlug('nope')).toBe(false);
    expect(isValidSlug('')).toBe(false);
    expect(isValidSlug('agos_audit')).toBe(false);
  });
});

describe('listAudit', () => {
  it('queries with only actorId when no filters set', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const r = await listAudit({ actorId: 'user-1' });
    expect(r.entries).toEqual([]);
    expect(r.nextCursor).toBeNull();
    const [sql, params] = queryMock.mock.calls[0]!;
    expect(sql).toContain('FROM agos_audit');
    expect(sql).toContain('actor_id = $1');
    expect(sql).toContain('ORDER BY created_at DESC, id DESC');
    expect(params).toEqual(['user-1', DEFAULT_LIMIT + 1]);
  });

  it('adds slug, action, from, and to filters in order', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await listAudit({
      actorId: 'user-1',
      slug: 'maker',
      action: 'maker.build.created',
      fromTs: '2026-05-01T00:00:00Z',
      toTs: '2026-05-08T00:00:00Z',
      limit: 10,
    });
    const [sql, params] = queryMock.mock.calls[0]!;
    expect(sql).toContain('os_slug = $2');
    expect(sql).toContain('action = $3');
    expect(sql).toContain('created_at >= $4');
    expect(sql).toContain('created_at < $5');
    expect(params[0]).toBe('user-1');
    expect(params[1]).toBe('maker');
    expect(params[2]).toBe('maker.build.created');
    expect(params[3]).toBe('2026-05-01T00:00:00Z');
    expect(params[4]).toBe('2026-05-08T00:00:00Z');
    expect(params[5]).toBe(11); // limit + 1
  });

  it('rejects invalid slug by returning empty without querying', async () => {
    const r = await listAudit({ actorId: 'user-1', slug: 'not-a-real-slug' });
    expect(r.entries).toEqual([]);
    expect(r.nextCursor).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('clamps limit to MAX_LIMIT', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await listAudit({ actorId: 'user-1', limit: 9999 });
    const params = queryMock.mock.calls[0]![1];
    expect(params[params.length - 1]).toBe(MAX_LIMIT + 1);
  });

  it('floors limit to 1 when given non-positive value', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await listAudit({ actorId: 'user-1', limit: 0 });
    const params = queryMock.mock.calls[0]![1];
    expect(params[params.length - 1]).toBe(2); // 1 + 1
  });

  it('adds keyset condition when cursor provided', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await listAudit({
      actorId: 'user-1',
      cursor: { ts: '2026-05-07T12:00:00.000Z', id: '11111111-1111-1111-1111-111111111111' },
    });
    const [sql, params] = queryMock.mock.calls[0]!;
    expect(sql).toContain('(created_at, id) < ($2::timestamptz, $3::uuid)');
    expect(params).toContain('2026-05-07T12:00:00.000Z');
    expect(params).toContain('11111111-1111-1111-1111-111111111111');
  });

  it('returns mapped entries with ISO timestamps', async () => {
    queryMock.mockResolvedValueOnce({ rows: [fakeRow()] });
    const r = await listAudit({ actorId: 'user-1' });
    expect(r.entries).toHaveLength(1);
    const e = r.entries[0]!;
    expect(e.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(e.osSlug).toBe('maker');
    expect(e.action).toBe('maker.build.created');
    expect(e.payload).toEqual({ foo: 'bar' });
    expect(e.createdAt).toBe('2026-05-07T12:00:00.000Z');
  });

  it('returns null nextCursor when fewer than limit+1 rows returned', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [fakeRow({ id: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa' })],
    });
    const r = await listAudit({ actorId: 'user-1', limit: 5 });
    expect(r.entries).toHaveLength(1);
    expect(r.nextCursor).toBeNull();
  });

  it('returns nextCursor and trims to limit when extra row present', async () => {
    const rows = [];
    for (let i = 0; i < 4; i += 1) {
      rows.push(
        fakeRow({
          id: `${i.toString().padStart(8, '0')}-1111-1111-1111-111111111111`,
          created_at: new Date(Date.UTC(2026, 4, 7 - i, 12, 0, 0)),
        }),
      );
    }
    queryMock.mockResolvedValueOnce({ rows });
    const r = await listAudit({ actorId: 'user-1', limit: 3 });
    expect(r.entries).toHaveLength(3);
    expect(r.nextCursor).not.toBeNull();
    expect(r.nextCursor!.id).toBe(r.entries[2]!.id);
    expect(r.nextCursor!.ts).toBe(r.entries[2]!.createdAt);
  });

  it('coerces non-object payloads to {}', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [fakeRow({ payload: null }), fakeRow({ id: '22222222-2222-2222-2222-222222222222', payload: 'not an object' })],
    });
    const r = await listAudit({ actorId: 'user-1' });
    expect(r.entries[0]!.payload).toEqual({});
    expect(r.entries[1]!.payload).toEqual({});
  });
});

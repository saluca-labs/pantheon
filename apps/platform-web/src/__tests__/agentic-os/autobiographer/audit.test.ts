/**
 * Autobiographer OS — recordAudit behavior test.
 *
 * Phase 1 extended the autobiographer recordAudit signature to accept a
 * `projectId` argument so book-scoped mutations can filter the audit
 * timeline. Lock the SQL shape (now writes the project_id column).
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: { sql: string; params: any[] }[] = [];

vi.mock('@/lib/agentic-os/autobiographer/session', () => ({
  getAutobiographerPool: () => ({
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return { rows: [], rowCount: 0 };
    }),
  }),
}));

import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';

beforeEach(() => {
  calls.length = 0;
});

describe('autobiographer recordAudit', () => {
  it('inserts into agos_audit with os_slug=autobiographer', async () => {
    await recordAudit({
      actorId: 'u-1',
      action: 'autobiographer.book.created',
    });
    expect(calls[0]!.sql).toMatch(/INSERT INTO agos_audit/);
    expect(calls[0]!.params).toContain('autobiographer');
    expect(calls[0]!.params).toContain('autobiographer.book.created');
  });

  it('writes a generated UUID id', async () => {
    await recordAudit({ actorId: 'u-1', action: 'autobiographer.x' });
    // The first param is the generated id
    expect(typeof calls[0]!.params[0]).toBe('string');
    expect(calls[0]!.params[0].length).toBeGreaterThan(20);
  });

  it('passes projectId through to the project_id column (book-scoped)', async () => {
    await recordAudit({
      actorId: 'u-1',
      action: 'autobiographer.book.updated',
      projectId: 'b-1',
    });
    // The SQL writes (id, project_id, actor_id, os_slug, action, payload).
    expect(calls[0]!.sql).toMatch(/project_id/);
    expect(calls[0]!.params[1]).toBe('b-1');
  });

  it('writes null project_id for workshop-global mutations', async () => {
    await recordAudit({
      actorId: 'u-1',
      action: 'autobiographer.memory.created',
      projectId: null,
    });
    expect(calls[0]!.params[1]).toBeNull();
  });

  it('defaults projectId to null when omitted', async () => {
    await recordAudit({ actorId: 'u-1', action: 'autobiographer.x' });
    expect(calls[0]!.params[1]).toBeNull();
  });

  it('serializes payload as JSON', async () => {
    await recordAudit({
      actorId: 'u-1',
      action: 'autobiographer.book.updated',
      payload: { fields: ['title'] },
      projectId: 'b-1',
    });
    const payloadArg = calls[0]!.params.at(-1);
    expect(typeof payloadArg).toBe('string');
    expect(() => JSON.parse(payloadArg)).not.toThrow();
    expect(JSON.parse(payloadArg)).toEqual({ fields: ['title'] });
  });

  it('defaults payload to empty object when omitted', async () => {
    await recordAudit({ actorId: 'u-1', action: 'autobiographer.x' });
    expect(JSON.parse(calls[0]!.params.at(-1))).toEqual({});
  });
});

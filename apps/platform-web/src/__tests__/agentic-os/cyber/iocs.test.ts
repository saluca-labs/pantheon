/**
 * CyberSec OS — IOC regression tests.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PgResult { rows: any[]; rowCount: number }
const queue: PgResult[] = [];
const calls: { sql: string; params: any[] }[] = [];

function pushResult(r: Partial<PgResult>): void {
  queue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) });
}

vi.mock('@/lib/agentic-os/cyber/session', () => ({
  getCyberPool: () => ({
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return queue.shift() ?? { rows: [], rowCount: 0 };
    }),
  }),
}));

import {
  searchIocs,
  createIoc,
  getIoc,
  updateIoc,
  deleteIoc,
} from '@/lib/agentic-os/cyber/repo';
import {
  isIocExpired,
  validateIocValue,
} from '@/lib/agentic-os/cyber/iocs';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function iocRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'i-1',
    owner_id: 'u-1',
    kind: 'ipv4',
    value: '1.2.3.4',
    title: null,
    description: null,
    threat_type: 'c2',
    confidence: 80,
    first_seen_at: new Date('2026-05-01T00:00:00Z'),
    last_seen_at: new Date('2026-05-10T00:00:00Z'),
    expires_at: null,
    source: 'abuse.ch',
    tags: ['c2'],
    references: [],
    metadata: {},
    created_at: new Date('2026-05-10T00:00:00Z'),
    updated_at: new Date('2026-05-10T00:00:00Z'),
    ...overrides,
  };
}

describe('validateIocValue', () => {
  it('accepts valid IPv4', () => {
    expect(validateIocValue('ipv4', '8.8.8.8').ok).toBe(true);
    expect(validateIocValue('ipv4', '255.255.255.255').ok).toBe(true);
  });
  it('rejects bad IPv4', () => {
    expect(validateIocValue('ipv4', '999.0.0.1').ok).toBe(false);
    expect(validateIocValue('ipv4', 'nope').ok).toBe(false);
  });
  it('validates SHA256 length', () => {
    const good = 'a'.repeat(64);
    expect(validateIocValue('file_hash_sha256', good).ok).toBe(true);
    expect(validateIocValue('file_hash_sha256', 'a'.repeat(63)).ok).toBe(false);
  });
  it('validates MD5 (32 hex)', () => {
    expect(validateIocValue('file_hash_md5', 'a'.repeat(32)).ok).toBe(true);
    expect(validateIocValue('file_hash_md5', 'a'.repeat(31)).ok).toBe(false);
  });
  it('validates SHA1 (40 hex)', () => {
    expect(validateIocValue('file_hash_sha1', 'a'.repeat(40)).ok).toBe(true);
    expect(validateIocValue('file_hash_sha1', 'a'.repeat(39)).ok).toBe(false);
  });
  it('validates domain', () => {
    expect(validateIocValue('domain', 'evil.example.com').ok).toBe(true);
    expect(validateIocValue('domain', 'no_dots').ok).toBe(false);
  });
  it('validates URL', () => {
    expect(validateIocValue('url', 'https://evil.example.com/path').ok).toBe(true);
    expect(validateIocValue('url', 'not a url').ok).toBe(false);
  });
  it('validates email', () => {
    expect(validateIocValue('email', 'a@b.co').ok).toBe(true);
    expect(validateIocValue('email', 'not-email').ok).toBe(false);
  });
  it('rejects empty values across all kinds', () => {
    expect(validateIocValue('ipv4', '').ok).toBe(false);
    expect(validateIocValue('other', '').ok).toBe(false);
  });
  it('accepts free-form `other` non-empty', () => {
    expect(validateIocValue('other', 'anything goes').ok).toBe(true);
  });
});

describe('isIocExpired', () => {
  it('returns false when expiresAt is null', () => {
    expect(isIocExpired({ expiresAt: null })).toBe(false);
  });
  it('returns true when expiresAt is in the past', () => {
    expect(isIocExpired({ expiresAt: '2020-01-01T00:00:00Z' })).toBe(true);
  });
  it('returns false when expiresAt is in the future', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(isIocExpired({ expiresAt: future })).toBe(false);
  });
});

describe('IOC CRUD', () => {
  it('createIoc INSERTs with correct columns', async () => {
    pushResult({ rows: [iocRow()] });
    const out = await createIoc('u-1', { kind: 'ipv4', value: '1.2.3.4' });
    expect(out?.id).toBe('i-1');
    expect(calls[0]!.sql).toContain('INSERT INTO agos_cyber_iocs');
    expect(calls[0]!.params[1]).toBe('u-1');
    expect(calls[0]!.params[2]).toBe('ipv4');
    expect(calls[0]!.params[3]).toBe('1.2.3.4');
  });

  it('getIoc binds owner_id', async () => {
    pushResult({ rows: [iocRow()] });
    const out = await getIoc('i-1', 'u-1');
    expect(out?.id).toBe('i-1');
    expect(calls[0]!.params).toEqual(['i-1', 'u-1']);
  });

  it('updateIoc with patch updates expected columns', async () => {
    pushResult({ rows: [iocRow({ confidence: 95 })] });
    const out = await updateIoc('i-1', 'u-1', { confidence: 95 });
    expect(out?.confidence).toBe(95);
    expect(calls[0]!.sql).toContain('confidence = $');
  });

  it('deleteIoc binds owner_id', async () => {
    pushResult({ rowCount: 1 });
    const ok = await deleteIoc('i-1', 'u-1');
    expect(ok).toBe(true);
    expect(calls[0]!.params).toEqual(['i-1', 'u-1']);
  });
});

describe('searchIocs', () => {
  it('filters by kind, threatType, and q', async () => {
    pushResult({ rows: [iocRow()] });
    await searchIocs({ ownerId: 'u-1', kind: 'ipv4', threatType: 'c2', q: 'evil' });
    const sql = calls[0]!.sql;
    expect(sql).toContain('kind = $');
    expect(sql).toContain('threat_type = $');
    expect(sql).toContain('value ILIKE');
    expect(calls[0]!.params).toContain('ipv4');
    expect(calls[0]!.params).toContain('c2');
    expect(calls[0]!.params).toContain('%evil%');
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for POST /api/auth/login.
 *
 * Mocks pg, @platform/auth, @platform/auth/cookies, and next/headers.
 */

const dbQuery = vi.fn();
const dbConnect = vi.fn();

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: dbQuery,
    connect: dbConnect,
  })),
}));

const verifyPasswordMock = vi.fn();
const hashPasswordMock = vi.fn();
const createSessionMock = vi.fn();
const setSessionCookieMock = vi.fn();

vi.mock('@platform/auth', () => ({
  hashPassword: hashPasswordMock,
  verifyPassword: verifyPasswordMock,
  createSession: createSessionMock,
}));

vi.mock('@platform/auth/cookies', () => ({
  setSessionCookie: setSessionCookieMock,
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({}),
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  dbQuery.mockReset();
  dbConnect.mockReset();
  verifyPasswordMock.mockReset();
  hashPasswordMock.mockReset();
  createSessionMock.mockReset();
  setSessionCookieMock.mockReset();
  process.env['DATABASE_URL'] = 'postgres://test';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

async function callRoute(body: unknown) {
  const mod = await import('@/app/api/auth/login/route');
  const req = new Request('http://test/api/auth/login', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  return mod.POST(req);
}

describe('POST /api/auth/login', () => {
  it('returns 400 on invalid JSON', async () => {
    const res = await callRoute('not-json');
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing fields', async () => {
    const res = await callRoute({ email: 'a@b.c' });
    expect(res.status).toBe(400);
  });

  it('returns 401 on unknown user (and runs constant-time hash)', async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });
    const res = await callRoute({ email: 'x@y.z', password: 'something' });
    expect(res.status).toBe(401);
    expect(hashPasswordMock).toHaveBeenCalled();
  });

  it('returns 401 on bad password', async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: 'u1', hash: 'h1' }] });
    verifyPasswordMock.mockResolvedValueOnce(false);
    const res = await callRoute({ email: 'x@y.z', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('returns 200 + sets cookie on success', async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: 'u1', hash: 'h1' }] });
    verifyPasswordMock.mockResolvedValueOnce(true);
    createSessionMock.mockResolvedValueOnce({ token: 'tok-1' });
    const res = await callRoute({ email: 'x@y.z', password: 'right' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('u1');
    expect(setSessionCookieMock).toHaveBeenCalled();
  });
});

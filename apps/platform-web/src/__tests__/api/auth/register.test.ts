import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for POST /api/auth/register.
 */

const dbQuery = vi.fn();
const dbConnect = vi.fn();

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: dbQuery,
    connect: dbConnect,
  })),
}));

const hashPasswordMock = vi.fn();
const createSessionMock = vi.fn();
const setSessionCookieMock = vi.fn();

vi.mock('@platform/auth', () => ({
  hashPassword: hashPasswordMock,
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
  hashPasswordMock.mockReset();
  createSessionMock.mockReset();
  setSessionCookieMock.mockReset();
  process.env['DATABASE_URL'] = 'postgres://test';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

async function callRoute(body: unknown) {
  const mod = await import('@/app/api/auth/register/route');
  const req = new Request('http://test/api/auth/register', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  return mod.POST(req);
}

describe('POST /api/auth/register', () => {
  it('returns 400 on invalid JSON', async () => {
    const res = await callRoute('not-json');
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing/short password', async () => {
    const res = await callRoute({ email: 'a@b.c', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('returns 409 if email already exists', async () => {
    dbQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'existing' }] });
    const res = await callRoute({ email: 'a@b.c', password: 'longenough' });
    expect(res.status).toBe(409);
  });

  it('returns 201 + sets cookie on success', async () => {
    // existence check
    dbQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    // hash, then transaction client
    hashPasswordMock.mockResolvedValueOnce('h1');
    const txQuery = vi.fn();
    const txRelease = vi.fn();
    dbConnect.mockResolvedValueOnce({ query: txQuery, release: txRelease });
    txQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'u-new' }] }) // INSERT users
      .mockResolvedValueOnce({}) // INSERT password_credentials
      .mockResolvedValueOnce({}); // COMMIT
    createSessionMock.mockResolvedValueOnce({ token: 'tok' });

    const res = await callRoute({ email: 'a@b.c', password: 'longenough' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.userId).toBe('u-new');
    expect(setSessionCookieMock).toHaveBeenCalled();
    expect(txRelease).toHaveBeenCalled();
  });

  it('returns 500 + rolls back on insert failure', async () => {
    dbQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    hashPasswordMock.mockResolvedValueOnce('h1');
    const txQuery = vi.fn();
    const txRelease = vi.fn();
    dbConnect.mockResolvedValueOnce({ query: txQuery, release: txRelease });
    txQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(new Error('boom')) // INSERT users fails
      .mockResolvedValueOnce({}); // ROLLBACK

    const res = await callRoute({ email: 'a@b.c', password: 'longenough' });
    expect(res.status).toBe(500);
    expect(txRelease).toHaveBeenCalled();
  });
});

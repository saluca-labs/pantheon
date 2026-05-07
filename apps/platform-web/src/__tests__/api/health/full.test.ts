import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for /api/health/full readiness aggregator.
 *
 * Mocks `pg` and global `fetch` so the route runs without a live DB,
 * platform-api, or memory-service.
 */

// Mock the pg Pool to control DB query outcomes per-test.
const dbQuery = vi.fn();
vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: dbQuery,
  })),
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  dbQuery.mockReset();
  process.env['TIRESIAS_API_URL'] = 'http://platform-api:8900';
  process.env['MEMORY_SERVICE_URL'] = 'http://memory-service:8910';
  process.env['DATABASE_URL'] = 'postgres://test';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

async function callRoute() {
  // Re-import inside each test so the mocked Pool is freshly used.
  const mod = await import('@/app/api/health/full/route');
  return mod.GET();
}

describe('GET /api/health/full', () => {
  it('returns 200 with status=ready when all components are healthy', async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ready' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await callRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ready');
    expect(body.components.database.status).toBe('ready');
    expect(body.components.platform_api.status).toBe('ready');
    expect(body.components.memory_service.status).toBe('ready');
    // Both upstream URLs were called.
    const calledUrls = fetchMock.mock.calls.map((c) => c[0]);
    expect(calledUrls).toContain('http://platform-api:8900/health/ready');
    expect(calledUrls).toContain('http://memory-service:8910/health/ready');
  });

  it('returns 503 when the database is down', async () => {
    dbQuery.mockRejectedValueOnce(new Error('connection refused'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    );

    const res = await callRoute();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('not_ready');
    expect(body.components.database.status).toBe('not_ready');
    expect(body.components.database.error).toContain('connection refused');
  });

  it('returns 503 when platform-api returns non-OK', async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string) => {
        if (url.includes('platform-api')) {
          return new Response('boom', { status: 500 });
        }
        return new Response('{}', { status: 200 });
      });
    vi.stubGlobal('fetch', fetchMock);

    const res = await callRoute();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.components.platform_api.status).toBe('not_ready');
    expect(body.components.platform_api.error).toBe('HTTP 500');
    expect(body.components.memory_service.status).toBe('ready');
  });

  it('returns 503 when memory-service throws', async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string) => {
        if (url.includes('memory-service')) {
          throw new TypeError('fetch failed');
        }
        return new Response('{}', { status: 200 });
      });
    vi.stubGlobal('fetch', fetchMock);

    const res = await callRoute();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.components.memory_service.status).toBe('not_ready');
    expect(body.components.memory_service.error).toContain('fetch failed');
  });

  it('reports latency_ms as a number for every component', async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    );

    const res = await callRoute();
    const body = await res.json();
    for (const component of Object.values(body.components) as Array<{
      latency_ms: unknown;
    }>) {
      expect(typeof component.latency_ms).toBe('number');
    }
  });
});

/**
 * Agentic OS — summary endpoint unit tests.
 *
 * Tests:
 *   1. In-memory cache: TTL is respected; separate users are isolated.
 *   2. Failed sub-query produces an `error` entry without affecting others.
 *
 * We extract the pure cache logic and fan-out wiring into testable units
 * rather than calling the Next.js route handler directly (which requires
 * the full Next.js runtime). The tests mock the db query function.
 *
 * @license MIT — Tiresias platform (internal).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Inline the cache logic so tests don't depend on Next.js internals ────────

const CACHE_TTL_MS = 30_000;

interface OsSummaryEntry {
  count: number;
  lastUpdated: string | null;
  error?: string;
}

interface CacheEntry {
  ts: number;
  data: Record<string, OsSummaryEntry>;
}

function makeCache() {
  const cache = new Map<string, CacheEntry>();

  function getCached(userId: string): Record<string, OsSummaryEntry> | null {
    const entry = cache.get(userId);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
      cache.delete(userId);
      return null;
    }
    return entry.data;
  }

  function setCached(userId: string, data: Record<string, OsSummaryEntry>): void {
    cache.set(userId, { ts: Date.now(), data });
  }

  return { getCached, setCached };
}

// ─── Fan-out helper mirroring the real getOsSummary logic ────────────────────

interface OsQueryDef {
  slug: string;
  queryFn: (userId: string) => Promise<OsSummaryEntry>;
}

async function fanOut(
  defs: OsQueryDef[],
  userId: string,
  cache: ReturnType<typeof makeCache>,
): Promise<Record<string, OsSummaryEntry>> {
  const cached = cache.getCached(userId);
  if (cached) return cached;

  const results = await Promise.allSettled(defs.map((d) => d.queryFn(userId)));

  const summary: Record<string, OsSummaryEntry> = {};
  results.forEach((result, i) => {
    const def = defs[i]!;
    if (result.status === 'fulfilled') {
      summary[def.slug] = result.value;
    } else {
      summary[def.slug] = {
        count: 0,
        lastUpdated: null,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
    }
  });

  cache.setCached(userId, summary);
  return summary;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('In-memory cache', () => {
  let cache: ReturnType<typeof makeCache>;

  beforeEach(() => {
    cache = makeCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for an unknown userId', () => {
    expect(cache.getCached('user-a')).toBeNull();
  });

  it('returns cached data immediately after set', () => {
    const data = { health: { count: 1, lastUpdated: null } };
    cache.setCached('user-a', data);
    expect(cache.getCached('user-a')).toEqual(data);
  });

  it('returns null after the 30-second TTL has elapsed', () => {
    const data = { maker: { count: 5, lastUpdated: '2024-01-01T00:00:00.000Z' } };
    cache.setCached('user-a', data);
    vi.advanceTimersByTime(CACHE_TTL_MS + 1);
    expect(cache.getCached('user-a')).toBeNull();
  });

  it('still returns data before the TTL has elapsed', () => {
    const data = { maker: { count: 5, lastUpdated: null } };
    cache.setCached('user-a', data);
    vi.advanceTimersByTime(CACHE_TTL_MS - 100);
    expect(cache.getCached('user-a')).toEqual(data);
  });

  it('isolates data between different userIds', () => {
    const dataA = { research: { count: 2, lastUpdated: null } };
    const dataB = { research: { count: 99, lastUpdated: null } };
    cache.setCached('user-a', dataA);
    cache.setCached('user-b', dataB);
    expect(cache.getCached('user-a')).toEqual(dataA);
    expect(cache.getCached('user-b')).toEqual(dataB);
  });

  it('evicting user-a cache does not affect user-b set at a different time', () => {
    cache.setCached('user-a', { health: { count: 1, lastUpdated: null } });
    vi.advanceTimersByTime(10_000);
    cache.setCached('user-b', { health: { count: 2, lastUpdated: null } });
    // user-a (10s+21s=31s) expired; user-b (21s) still valid
    vi.advanceTimersByTime(21_000);
    expect(cache.getCached('user-a')).toBeNull();
    expect(cache.getCached('user-b')).not.toBeNull();
  });
});

describe('Fan-out query resilience', () => {
  let cache: ReturnType<typeof makeCache>;

  beforeEach(() => {
    cache = makeCache();
  });

  it('returns count and lastUpdated for successful queries', async () => {
    const defs: OsQueryDef[] = [
      { slug: 'maker',    queryFn: async () => ({ count: 7, lastUpdated: '2024-06-01T00:00:00.000Z' }) },
      { slug: 'research', queryFn: async () => ({ count: 3, lastUpdated: null }) },
    ];
    const result = await fanOut(defs, 'user-x', cache);
    expect(result['maker']).toEqual({ count: 7, lastUpdated: '2024-06-01T00:00:00.000Z' });
    expect(result['research']).toEqual({ count: 3, lastUpdated: null });
  });

  it('produces an error entry for a failed sub-query without affecting others', async () => {
    const defs: OsQueryDef[] = [
      { slug: 'health',    queryFn: async () => ({ count: 1, lastUpdated: '2024-01-01T00:00:00.000Z' }) },
      { slug: 'broken-os', queryFn: async () => { throw new Error('relation "agos_broken_table" does not exist'); } },
      { slug: 'cyber',     queryFn: async () => ({ count: 12, lastUpdated: '2024-05-01T00:00:00.000Z' }) },
    ];
    const result = await fanOut(defs, 'user-y', cache);
    // Successful slugs are unaffected
    expect(result['health']).toEqual({ count: 1, lastUpdated: '2024-01-01T00:00:00.000Z' });
    expect(result['cyber']).toEqual({ count: 12, lastUpdated: '2024-05-01T00:00:00.000Z' });
    // Failed slug has error set
    expect(result['broken-os']!.count).toBe(0);
    expect(result['broken-os']!.lastUpdated).toBeNull();
    expect(result['broken-os']!.error).toContain('agos_broken_table');
  });

  it('handles non-Error rejections gracefully', async () => {
    const defs: OsQueryDef[] = [
      { slug: 'weird-fail', queryFn: async () => Promise.reject('string rejection') },
    ];
    const result = await fanOut(defs, 'user-z', cache);
    expect(result['weird-fail']!.error).toBe('string rejection');
    expect(result['weird-fail']!.count).toBe(0);
  });

  it('returns cached result on second call without re-running queries', async () => {
    let callCount = 0;
    const defs: OsQueryDef[] = [
      { slug: 'maker', queryFn: async () => { callCount++; return { count: 5, lastUpdated: null }; } },
    ];
    await fanOut(defs, 'user-cached', cache);
    await fanOut(defs, 'user-cached', cache);
    expect(callCount).toBe(1);
  });

  it('all 9 failing sub-queries produce 9 error entries without crashing', async () => {
    const slugs = ['health', 'maker', 'research', 'secure-dev', 'cyber', 'filmmaker', 'autobiographer', 'business', 'creator'];
    const defs: OsQueryDef[] = slugs.map((slug) => ({
      slug,
      queryFn: async () => { throw new Error(`${slug} query failed`); },
    }));
    const result = await fanOut(defs, 'user-all-fail', cache);
    for (const slug of slugs) {
      expect(result[slug]!.error).toContain(`${slug} query failed`);
      expect(result[slug]!.count).toBe(0);
    }
  });
});

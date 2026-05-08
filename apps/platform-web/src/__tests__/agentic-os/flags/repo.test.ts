/**
 * Agentic OS feature flags — repository unit tests.
 *
 * Tests pure logic (default-true behavior, slug validation) using an
 * in-memory mock of the pg Pool. No live database is required.
 *
 * @license MIT — Tiresias Agentic OS (internal).
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ── Mock 'server-only' so it doesn't throw in test environment ────────────
vi.mock('server-only', () => ({}));

// ── Mock the health session pool ─────────────────────────────────────────
const mockQuery: Mock = vi.fn();
vi.mock('@/lib/agentic-os/health/session', () => ({
  getHealthPool: () => ({ query: mockQuery }),
}));

// Import after mocks are set up.
const { getFlags, setFlag, ALL_SLUGS: SLUGS } = await import('@/lib/agentic-os/flags/repo');

// ── Helpers ───────────────────────────────────────────────────────────────

function makeQueryResult(rows: Array<{ os_slug: string; enabled: boolean }>) {
  return { rows, rowCount: rows.length };
}

const TEST_USER = 'user-uuid-1234';

// ── Tests ─────────────────────────────────────────────────────────────────

describe('ALL_SLUGS', () => {
  it('contains exactly 9 known slugs', () => {
    expect(SLUGS).toHaveLength(9);
  });

  it('includes all expected OS slugs', () => {
    const expected = [
      'health', 'maker', 'research', 'secure-dev',
      'filmmaker', 'cyber', 'autobiographer', 'business', 'creator',
    ];
    for (const slug of expected) {
      expect(SLUGS).toContain(slug);
    }
  });
});

describe('getFlags — default-true behavior', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns all 9 slugs as true when no rows exist', async () => {
    mockQuery.mockResolvedValueOnce(makeQueryResult([]));

    const flags = await getFlags(TEST_USER);

    expect(Object.keys(flags)).toHaveLength(9);
    for (const slug of SLUGS) {
      expect(flags[slug]).toBe(true);
    }
  });

  it('overrides only the stored slug; others remain true', async () => {
    mockQuery.mockResolvedValueOnce(
      makeQueryResult([{ os_slug: 'maker', enabled: false }]),
    );

    const flags = await getFlags(TEST_USER);

    expect(flags['maker']).toBe(false);
    // All other slugs should still be true.
    for (const slug of SLUGS) {
      if (slug !== 'maker') {
        expect(flags[slug]).toBe(true);
      }
    }
  });

  it('returns true for a slug that was explicitly set to true', async () => {
    mockQuery.mockResolvedValueOnce(
      makeQueryResult([{ os_slug: 'health', enabled: true }]),
    );

    const flags = await getFlags(TEST_USER);
    expect(flags['health']).toBe(true);
  });

  it('handles all 9 slugs being disabled', async () => {
    mockQuery.mockResolvedValueOnce(
      makeQueryResult(
        (SLUGS as string[]).map((slug) => ({ os_slug: slug, enabled: false })),
      ),
    );

    const flags = await getFlags(TEST_USER);
    for (const slug of SLUGS) {
      expect(flags[slug]).toBe(false);
    }
  });

  it('ignores unknown slugs returned from DB', async () => {
    mockQuery.mockResolvedValueOnce(
      makeQueryResult([{ os_slug: 'unknown-os', enabled: false }]),
    );

    const flags = await getFlags(TEST_USER);
    expect('unknown-os' in flags).toBe(false);
    // All real slugs still default to true.
    for (const slug of SLUGS) {
      expect(flags[slug]).toBe(true);
    }
  });
});

describe('setFlag — slug validation', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('rejects an unknown slug', async () => {
    await expect(setFlag(TEST_USER, 'nonexistent-os', true)).rejects.toThrow(
      /Unknown OS slug/,
    );
    // DB should NOT have been called.
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects an empty slug', async () => {
    await expect(setFlag(TEST_USER, '', false)).rejects.toThrow(/Unknown OS slug/);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('accepts all known slugs', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    for (const slug of SLUGS) {
      await expect(setFlag(TEST_USER, slug, true)).resolves.toBeUndefined();
    }
    expect(mockQuery).toHaveBeenCalledTimes(SLUGS.length);
  });
});

describe('setFlag — upsert semantics', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('issues an INSERT ... ON CONFLICT DO UPDATE query', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await setFlag(TEST_USER, 'maker', false);

    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/ON CONFLICT.*DO UPDATE/i);
    expect(params).toContain(TEST_USER);
    expect(params).toContain('maker');
    expect(params).toContain(false);
  });

  it('can toggle the same slug twice (disable then re-enable)', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await setFlag(TEST_USER, 'health', false);
    await setFlag(TEST_USER, 'health', true);

    expect(mockQuery).toHaveBeenCalledTimes(2);
    const secondCall = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(secondCall[1]).toContain(true);
  });
});

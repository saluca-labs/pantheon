/**
 * Health OS Phase 3 — meditation catalog + plan generator + session
 * persistence. Coverage:
 *
 *   - Static catalog filter + lookup helpers.
 *   - Meditation plan generator: rules cover anxiety/sleep/focus paths.
 *   - Plan generator returns 7 day-slots with valid catalog slugs.
 *   - Catalog falls back to static when remote API path produces no JSON.
 *   - Session schemas (`MeditationSessionBody`, `MeditationPlanBody`).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  filterMeditationCatalog,
  getMeditationEntry,
  MEDITATION_CATALOG,
} from '@/lib/agentic-os/health/meditation-catalog';
import { planFromSignals } from '@/lib/agentic-os/health/repo';
import {
  MeditationPlanBody,
  MeditationSessionBody,
} from '@/lib/agentic-os/health/schemas';

interface PgResult {
  rows: unknown[];
  rowCount: number;
}

const queue: PgResult[] = [];

function pushResult(r: Partial<PgResult>): void {
  queue.push({
    rows: r.rows ?? [],
    rowCount: r.rowCount ?? r.rows?.length ?? 0,
  });
}

vi.mock('@/lib/agentic-os/health/session', () => ({
  getHealthPool: () => ({
    query: vi.fn(async () => queue.shift() ?? { rows: [], rowCount: 0 }),
  }),
}));

beforeEach(() => {
  queue.length = 0;
});

describe('Meditation static catalog', () => {
  it('contains entries for stress, sleep, focus, and general goals', () => {
    expect(filterMeditationCatalog('stress').length).toBeGreaterThan(0);
    expect(filterMeditationCatalog('sleep').length).toBeGreaterThan(0);
    expect(filterMeditationCatalog('focus').length).toBeGreaterThan(0);
    expect(filterMeditationCatalog('general').length).toBeGreaterThan(0);
  });

  it('returns the full catalog when no filter passed', () => {
    expect(filterMeditationCatalog().length).toBe(MEDITATION_CATALOG.length);
  });

  it('looks up an entry by slug', () => {
    const entry = getMeditationEntry('breath-awareness-10');
    expect(entry).not.toBeNull();
    expect(entry?.title).toMatch(/breath/i);
  });

  it('returns null for unknown slug', () => {
    expect(getMeditationEntry('nonexistent')).toBeNull();
  });
});

describe('planFromSignals (rules-based plan generator)', () => {
  function isCatalogSlug(slug: string): boolean {
    return MEDITATION_CATALOG.some((e) => e.slug === slug);
  }

  it('produces exactly 7 day-slots with catalog slugs', () => {
    const slots = planFromSignals([], null);
    expect(slots.length).toBe(7);
    for (const s of slots) {
      expect(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']).toContain(s.day);
      expect(isCatalogSlug(s.session_slug)).toBe(true);
      expect(s.duration_min).toBeGreaterThan(0);
    }
  });

  it('high anxiety → biases toward stress sessions', () => {
    const moods = [
      { anxiety_score: 8, energy_score: 5, sleep_quality: 'good' },
      { anxiety_score: 9, energy_score: 6, sleep_quality: 'good' },
      { anxiety_score: 7, energy_score: 5, sleep_quality: 'good' },
    ];
    const slots = planFromSignals(moods, null);
    // First few slots should reference stress-tagged catalog entries.
    const stressSlugs = new Set(
      MEDITATION_CATALOG.filter((c) => c.tags.includes('stress')).map(
        (c) => c.slug,
      ),
    );
    expect(stressSlugs.has(slots[0]!.session_slug)).toBe(true);
  });

  it('high baseline stress → biases toward stress sessions even without mood entries', () => {
    const slots = planFromSignals([], { stress_baseline: 8 });
    const stressSlugs = new Set(
      MEDITATION_CATALOG.filter((c) => c.tags.includes('stress')).map(
        (c) => c.slug,
      ),
    );
    expect(stressSlugs.has(slots[0]!.session_slug)).toBe(true);
  });

  it('poor sleep → last slots are sleep-focused', () => {
    const slots = planFromSignals([], { sleep_quality: 'poor' });
    expect(slots[5]!.focus).toBe('sleep');
    expect(slots[6]!.focus).toBe('sleep');
    const sleepSlugs = new Set(
      MEDITATION_CATALOG.filter((c) => c.tags.includes('sleep')).map(
        (c) => c.slug,
      ),
    );
    expect(sleepSlugs.has(slots[5]!.session_slug)).toBe(true);
    expect(sleepSlugs.has(slots[6]!.session_slug)).toBe(true);
  });

  it('low energy → focus path picked', () => {
    const moods = [
      { anxiety_score: 2, energy_score: 2, sleep_quality: 'good' },
      { anxiety_score: 3, energy_score: 3, sleep_quality: 'good' },
      { anxiety_score: 2, energy_score: 4, sleep_quality: 'good' },
    ];
    const slots = planFromSignals(moods, null);
    expect(slots[0]!.focus).toBe('focus');
  });

  it('explicit goal override beats inferred signals', () => {
    const moods = [
      { anxiety_score: 9, energy_score: 5, sleep_quality: 'good' },
    ];
    const slots = planFromSignals(moods, null, { goal: 'general' });
    expect(slots[0]!.focus).toBe('general');
  });
});

describe('Meditation Zod schemas', () => {
  it('MeditationSessionBody accepts a valid session', () => {
    const r = MeditationSessionBody.safeParse({
      source: 'medito',
      sourceRef: 'breath-awareness-10',
      durationMin: 10,
      moodBefore: 4,
      moodAfter: 6,
    });
    expect(r.success).toBe(true);
  });
  it('MeditationSessionBody rejects unknown source', () => {
    const r = MeditationSessionBody.safeParse({
      source: 'youtube' as never,
      durationMin: 10,
    });
    expect(r.success).toBe(false);
  });
  it('MeditationSessionBody rejects 0-minute session', () => {
    const r = MeditationSessionBody.safeParse({
      source: 'manual',
      durationMin: 0,
    });
    expect(r.success).toBe(false);
  });
  it('MeditationPlanBody accepts an empty body (auto-infer)', () => {
    expect(MeditationPlanBody.safeParse({}).success).toBe(true);
  });
  it('MeditationPlanBody rejects unknown goal', () => {
    expect(
      MeditationPlanBody.safeParse({ goal: 'mindfulness' as never }).success,
    ).toBe(false);
  });
});

describe('Medito catalog fallback', () => {
  /**
   * The catalog route is shaped so `tryMeditoApi()` returns null on
   * unreachable / malformed remote — and the route then renders
   * `MEDITATION_CATALOG` (static). We test the static fallback shape
   * here. The integration with the route handler is exercised by the
   * route tests under the BFF contract layer (out of scope for unit).
   */
  it('static catalog has the required shape (slug + tags + duration)', () => {
    for (const entry of MEDITATION_CATALOG) {
      expect(typeof entry.slug).toBe('string');
      expect(entry.slug.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.tags)).toBe(true);
      expect(entry.tags.length).toBeGreaterThan(0);
      expect(entry.durationMin).toBeGreaterThan(0);
    }
  });

  it('every plan slot resolves to an entry in the static catalog', () => {
    const slots = planFromSignals(
      [{ anxiety_score: 8, energy_score: 5, sleep_quality: 'poor' }],
      { stress_baseline: 7, sleep_quality: 'poor' },
    );
    for (const slot of slots) {
      expect(getMeditationEntry(slot.session_slug)).not.toBeNull();
    }
  });
});

describe('Meditation lifecycle smoke', () => {
  it('record → list → get → delete via mocked pool', async () => {
    const id = 'mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm';
    pushResult({
      rows: [
        {
          id,
          user_id: 'u',
          tenant_id: 't',
          source: 'manual',
          source_ref: null,
          duration_min: 10,
          completed_at: new Date(),
          mood_before: null,
          mood_after: null,
          notes: null,
          created_at: new Date(),
        },
      ],
    });
    pushResult({
      rows: [
        {
          id,
          user_id: 'u',
          tenant_id: 't',
          source: 'manual',
          source_ref: null,
          duration_min: 10,
          completed_at: new Date(),
          mood_before: null,
          mood_after: null,
          notes: null,
          created_at: new Date(),
        },
      ],
    });
    pushResult({
      rows: [
        {
          id,
          user_id: 'u',
          tenant_id: 't',
          source: 'manual',
          source_ref: null,
          duration_min: 10,
          completed_at: new Date(),
          mood_before: null,
          mood_after: null,
          notes: null,
          created_at: new Date(),
        },
      ],
    });
    pushResult({ rows: [], rowCount: 1 });

    const repo = await import('@/lib/agentic-os/health/repo');
    const created = await repo.recordMeditationSession('u', 't', {
      source: 'manual',
      durationMin: 10,
    });
    expect(created.id).toBe(id);
    const listed = await repo.listMeditationSessions('u');
    expect(listed.length).toBe(1);
    const got = await repo.getMeditationSession(id, 'u');
    expect(got?.id).toBe(id);
    const deleted = await repo.deleteMeditationSession(id, 'u');
    expect(deleted).toBe(true);
  });
});

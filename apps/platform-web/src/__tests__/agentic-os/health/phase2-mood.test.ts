/**
 * Health OS Phase 2 — mood + tag persistence and Zod schema regression.
 *
 * Coverage:
 *   - Mood entry persistence (mocked pg pool) round-trips correct columns.
 *   - Tag attach/detach SQL hits the join table with owner-scope check.
 *   - Mood entry → list → delete → list-empty smoke flow via the repo.
 *   - Zod schema rejects out-of-range scores and over-long notes.
 *   - PSS-10 risk-flag thresholds (low / moderate / severe bands).
 *   - Referral prompt evaluator surfaces the standard 3 resources for
 *     PHQ-9 ≥ 10, GAD-7 ≥ 10, PSS ≥ 14, with reasons.
 *
 * The repo is exercised against a fake `Pool` (vi.mock of session.ts so
 * `getHealthPool` returns our queue-driven double) — same approach as
 * the Phase 1 audit.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateOnScreener, evaluateReferralPrompt } from '@/lib/agentic-os/health/risk-flags';
import {
  MoodEntryBody,
  MoodEntryUpdateBody,
  MoodTagBody,
} from '@/lib/agentic-os/health/schemas';

// ─── Repo via mocked pool ─────────────────────────────────────────────────

interface PgResult {
  rows: any[];
  rowCount: number;
}

const queue: PgResult[] = [];
const calls: { sql: string; params: any[] }[] = [];

function pushResult(r: Partial<PgResult>): void {
  queue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) });
}

vi.mock('@/lib/agentic-os/health/session', () => ({
  getHealthPool: () => ({
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return queue.shift() ?? { rows: [], rowCount: 0 };
    }),
  }),
}));

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

describe('MoodEntryBody schema', () => {
  it('accepts a fully-specified entry', () => {
    const r = MoodEntryBody.safeParse({
      moodScore: 7,
      energyScore: 4,
      anxietyScore: 3,
      sleepQuality: 'good',
      notes: 'Slept badly but coffee helped.',
      tagIds: ['00000000-0000-0000-0000-000000000001'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects scores outside 1..10', () => {
    expect(MoodEntryBody.safeParse({ moodScore: 0 }).success).toBe(false);
    expect(MoodEntryBody.safeParse({ moodScore: 11 }).success).toBe(false);
    expect(MoodEntryBody.safeParse({ moodScore: 1.5 }).success).toBe(false);
  });

  it('rejects unknown sleep_quality values', () => {
    const r = MoodEntryBody.safeParse({ sleepQuality: 'amazing' as any });
    expect(r.success).toBe(false);
  });

  it('caps notes length at 4000', () => {
    expect(
      MoodEntryBody.safeParse({ notes: 'x'.repeat(4001) }).success,
    ).toBe(false);
    expect(
      MoodEntryBody.safeParse({ notes: 'x'.repeat(4000) }).success,
    ).toBe(true);
  });

  it('partial update body accepts the empty patch', () => {
    expect(MoodEntryUpdateBody.safeParse({}).success).toBe(true);
  });
});

describe('MoodTagBody schema', () => {
  it('trims and accepts a name', () => {
    const r = MoodTagBody.safeParse({ name: '  hopeful  ' });
    expect(r.success).toBe(true);
    expect(r.success && r.data.name).toBe('hopeful');
  });
  it('rejects empty / over-long names', () => {
    expect(MoodTagBody.safeParse({ name: '' }).success).toBe(false);
    expect(MoodTagBody.safeParse({ name: 'x'.repeat(65) }).success).toBe(false);
  });
});

describe('repo.recordMoodEntry + tag attach', () => {
  it('inserts mood entry then attaches each owned tag', async () => {
    // Arrange the response queue: insert returns the row, then for each
    // tag attach we expect (a) ownership SELECT then (b) join INSERT.
    const moodId = '11111111-1111-1111-1111-111111111111';
    pushResult({
      rows: [
        {
          id: moodId,
          user_id: 'u',
          tenant_id: 't',
          mood_score: 7,
          energy_score: 4,
          anxiety_score: 3,
          sleep_quality: 'good',
          notes: 'ok',
          entry_at: new Date('2026-05-10T12:00:00Z'),
          created_at: new Date('2026-05-10T12:00:00Z'),
          updated_at: new Date('2026-05-10T12:00:00Z'),
        },
      ],
    });
    // Tag-ownership check returns one tag.
    pushResult({
      rows: [{ id: 'tag-1' }],
    });
    // Join INSERT — empty rows is fine.
    pushResult({ rows: [] });

    const { recordMoodEntry } = await import('@/lib/agentic-os/health/repo');
    const entry = await recordMoodEntry('u', 't', {
      moodScore: 7,
      energyScore: 4,
      anxietyScore: 3,
      sleepQuality: 'good',
      notes: 'ok',
      tagIds: ['tag-1'],
    });

    expect(entry.id).toBe(moodId);
    expect(entry.moodScore).toBe(7);
    // 1 INSERT mood + 1 owner SELECT + 1 join INSERT
    expect(calls).toHaveLength(3);
    expect(calls[0]?.sql).toMatch(/INSERT INTO agos_mh_mood_entry/);
    expect(calls[1]?.sql).toMatch(/SELECT id FROM agos_mh_mood_tag/);
    expect(calls[2]?.sql).toMatch(
      /INSERT INTO agos_mh_mood_entry_tag/,
    );
  });

  it('detachTagsFromEntry no-ops when caller does not own the entry', async () => {
    pushResult({ rows: [], rowCount: 0 }); // owner check fails
    const { detachTagsFromEntry } = await import(
      '@/lib/agentic-os/health/repo'
    );
    await detachTagsFromEntry('mood-x', 'u', ['tag-1']);
    // Only the owner-check ran — no DELETE was issued.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toMatch(/SELECT 1 FROM agos_mh_mood_entry/);
  });
});

describe('repo.recordMoodEntry → list → delete → list-empty (smoke)', () => {
  it('walks the lifecycle end-to-end', async () => {
    const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    // 1) insert returns the row
    pushResult({
      rows: [
        {
          id,
          user_id: 'u',
          tenant_id: 't',
          mood_score: 6,
          energy_score: null,
          anxiety_score: null,
          sleep_quality: null,
          notes: null,
          entry_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    // 2) list returns one row
    pushResult({
      rows: [
        {
          id,
          user_id: 'u',
          tenant_id: 't',
          mood_score: 6,
          energy_score: null,
          anxiety_score: null,
          sleep_quality: null,
          notes: null,
          entry_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    // 3) delete returns rowCount=1
    pushResult({ rows: [], rowCount: 1 });
    // 4) list returns nothing
    pushResult({ rows: [] });

    const { recordMoodEntry, listMoodEntries, deleteMoodEntry } =
      await import('@/lib/agentic-os/health/repo');

    const created = await recordMoodEntry('u', 't', { moodScore: 6 });
    expect(created.id).toBe(id);

    const after = await listMoodEntries('u');
    expect(after).toHaveLength(1);

    const ok = await deleteMoodEntry(id, 'u');
    expect(ok).toBe(true);

    const empty = await listMoodEntries('u');
    expect(empty).toHaveLength(0);
  });
});

describe('evaluateOnScreener — PSS-10 thresholds', () => {
  it('emits no flag below 14', () => {
    expect(evaluateOnScreener('pss', 13)).toEqual([]);
    expect(evaluateOnScreener('pss', 0)).toEqual([]);
  });

  it('emits pss-moderate (low severity) on 14..26', () => {
    for (const score of [14, 20, 26]) {
      const flags = evaluateOnScreener('pss', score);
      const main = flags.find((f) => f.kind === 'pss-moderate');
      expect(main).toBeDefined();
      expect(main?.severity).toBe('low');
    }
  });

  it('emits pss-severe (high severity) at >= 27', () => {
    for (const score of [27, 35, 40]) {
      const flags = evaluateOnScreener('pss', score);
      const main = flags.find((f) => f.kind === 'pss-severe');
      expect(main).toBeDefined();
      expect(main?.severity).toBe('high');
    }
  });
});

describe('evaluateReferralPrompt', () => {
  it('does not surface when all scores are sub-threshold', () => {
    const r = evaluateReferralPrompt({ phq9: 8, gad7: 9, pss: 13 });
    expect(r.shouldSurface).toBe(false);
    expect(r.reasons).toEqual([]);
    expect(r.resources).toHaveLength(3);
  });

  it('surfaces with reason when PHQ-9 hits moderate (>= 10)', () => {
    const r = evaluateReferralPrompt({ phq9: 10 });
    expect(r.shouldSurface).toBe(true);
    expect(r.reasons).toContain('phq9-moderate-or-worse');
  });

  it('surfaces with reason when GAD-7 hits moderate (>= 10)', () => {
    const r = evaluateReferralPrompt({ gad7: 12 });
    expect(r.shouldSurface).toBe(true);
    expect(r.reasons).toContain('gad7-moderate-or-worse');
  });

  it('surfaces with reason when PSS hits the project moderate band (>= 14)', () => {
    const r = evaluateReferralPrompt({ pss: 14 });
    expect(r.shouldSurface).toBe(true);
    expect(r.reasons).toContain('pss-moderate-or-worse');
  });

  it('returns the standard SAMHSA + Psychology Today + 988 resources', () => {
    const r = evaluateReferralPrompt({ phq9: 20 });
    const urls = r.resources.map((res) => res.url);
    expect(urls.some((u) => u.includes('samhsa.gov'))).toBe(true);
    expect(urls.some((u) => u.includes('psychologytoday.com'))).toBe(true);
    expect(urls.some((u) => u.includes('988lifeline.org'))).toBe(true);
  });

  it('uses the prescribed nudge copy', () => {
    const r = evaluateReferralPrompt({ phq9: 25 });
    expect(r.nudge).toBe('Reaching out is a strong move.');
  });
});

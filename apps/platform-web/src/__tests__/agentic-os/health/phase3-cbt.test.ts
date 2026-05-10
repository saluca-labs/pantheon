/**
 * Health OS Phase 3 — CBT exercises catalog + per-kind log persistence.
 *
 * Coverage:
 *   - All seven CBT data-shape Zod validators (valid + invalid inputs).
 *   - The `CbtLogBody` discriminated union dispatches on `kind`.
 *   - Mood-drop pattern detector across recent logs (cross-OS shared
 *     `_shared/safety/cbt-mood-watch`).
 *   - `evaluateOnCbtLog` emits a `cbt-mood-drop` flag when the threshold
 *     is crossed and a `crisis-language` flag on prose-likely fields.
 *   - `withCrisisGuard` wraps the thought-record automatic_thought
 *     field (regression — same pattern as journal in Phase 2).
 *   - CBT lifecycle smoke: record → list → get → delete → list-empty.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CbtBehavioralActivationData,
  CbtGratitudeData,
  CbtGroundingData,
  CbtLogBody,
  CbtSleepHygieneData,
  CbtThoughtRecordData,
  CbtValuesData,
  CbtWorryTimeData,
} from '@/lib/agentic-os/health/schemas';
import { detectMoodDropPattern } from '@/lib/agentic-os/_shared/safety/cbt-mood-watch';
import { evaluateOnCbtLog } from '@/lib/agentic-os/health/risk-flags';
import { withCrisisGuard } from '@/lib/agentic-os/_shared/safety/crisis-guard';
import type { CbtLog } from '@/lib/agentic-os/health/repo';

// ─── Fake pool — same pattern as Phase 2 ────────────────────────────────────

interface PgResult {
  rows: any[];
  rowCount: number;
}

const queue: PgResult[] = [];
const calls: { sql: string; params: any[] }[] = [];

function pushResult(r: Partial<PgResult>): void {
  queue.push({
    rows: r.rows ?? [],
    rowCount: r.rowCount ?? r.rows?.length ?? 0,
  });
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

// ─── Per-kind data-shape Zod validators ────────────────────────────────────

describe('CBT per-kind Zod validators', () => {
  it('thought-record accepts a complete payload', () => {
    expect(
      CbtThoughtRecordData.safeParse({
        situation: 'Email from boss.',
        automatic_thought: 'I am about to be fired.',
        evidence_for: 'Tone seemed terse.',
        evidence_against: 'No prior negative feedback.',
        balanced_thought: 'Probably routine; will know after the meeting.',
        mood_before: 3,
        mood_after: 6,
      }).success,
    ).toBe(true);
  });
  it('thought-record rejects empty situation', () => {
    expect(
      CbtThoughtRecordData.safeParse({
        situation: '',
        automatic_thought: 'x',
        balanced_thought: 'y',
      }).success,
    ).toBe(false);
  });

  it('behavioral-activation accepts a minimal payload', () => {
    expect(
      CbtBehavioralActivationData.safeParse({
        activity: 'Walk',
        scheduled_for: 'Tomorrow 9am',
      }).success,
    ).toBe(true);
  });
  it('behavioral-activation rejects empty activity', () => {
    expect(
      CbtBehavioralActivationData.safeParse({
        activity: '',
        scheduled_for: 'Tomorrow 9am',
      }).success,
    ).toBe(false);
  });

  it('worry-time requires at least one worry', () => {
    expect(
      CbtWorryTimeData.safeParse({
        scheduled_at: 'Today 6pm',
        duration_min: 15,
        worries: [],
      }).success,
    ).toBe(false);
    expect(
      CbtWorryTimeData.safeParse({
        scheduled_at: 'Today 6pm',
        duration_min: 15,
        worries: ['the project'],
      }).success,
    ).toBe(true);
  });
  it('worry-time rejects 0-minute duration', () => {
    expect(
      CbtWorryTimeData.safeParse({
        scheduled_at: 'now',
        duration_min: 0,
        worries: ['x'],
      }).success,
    ).toBe(false);
  });

  it('grounding requires exact tuple lengths', () => {
    const ok = {
      five_see: ['a', 'b', 'c', 'd', 'e'],
      four_feel: ['a', 'b', 'c', 'd'],
      three_hear: ['a', 'b', 'c'],
      two_smell: ['a', 'b'],
      one_taste: ['a'],
    };
    expect(CbtGroundingData.safeParse(ok).success).toBe(true);
    expect(
      CbtGroundingData.safeParse({ ...ok, five_see: ['a', 'b', 'c', 'd'] })
        .success,
    ).toBe(false);
  });

  it('gratitude requires exactly three entries', () => {
    expect(
      CbtGratitudeData.safeParse({ entries: ['a', 'b', 'c'] }).success,
    ).toBe(true);
    expect(CbtGratitudeData.safeParse({ entries: ['a', 'b'] }).success).toBe(
      false,
    );
    expect(
      CbtGratitudeData.safeParse({ entries: ['a', 'b', 'c', 'd'] }).success,
    ).toBe(false);
  });

  it('values requires at least one row with full fields', () => {
    expect(
      CbtValuesData.safeParse({
        values: [
          {
            domain: 'Family',
            importance: 8,
            current_alignment: 5,
            action: 'Call dad',
          },
        ],
      }).success,
    ).toBe(true);
    // Importance out of range.
    expect(
      CbtValuesData.safeParse({
        values: [
          {
            domain: 'Family',
            importance: 11,
            current_alignment: 5,
            action: 'x',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('sleep-hygiene requires at least one checklist item', () => {
    expect(
      CbtSleepHygieneData.safeParse({
        checklist: [{ item: 'Cool room', met: true }],
      }).success,
    ).toBe(true);
    expect(
      CbtSleepHygieneData.safeParse({ checklist: [] }).success,
    ).toBe(false);
  });
});

describe('CbtLogBody discriminated union', () => {
  it('routes a thought-record body to the matching schema', () => {
    const r = CbtLogBody.safeParse({
      kind: 'thought-record',
      data: {
        situation: 'a',
        automatic_thought: 'b',
        balanced_thought: 'c',
      },
    });
    expect(r.success).toBe(true);
  });
  it('rejects a thought-record body with the wrong data shape', () => {
    const r = CbtLogBody.safeParse({
      kind: 'thought-record',
      data: { entries: ['a', 'b', 'c'] },
    });
    expect(r.success).toBe(false);
  });
  it('rejects an unknown kind', () => {
    const r = CbtLogBody.safeParse({ kind: 'meditation', data: {} } as any);
    expect(r.success).toBe(false);
  });
});

// ─── Mood-drop detector ────────────────────────────────────────────────────

describe('detectMoodDropPattern', () => {
  const now = new Date('2026-05-10T12:00:00Z');

  it('triggers at 3 drops of >=3 in the last 7 days', () => {
    const r = detectMoodDropPattern(
      [
        { id: 'a', at: '2026-05-09T12:00:00Z', moodBefore: 8, moodAfter: 4 },
        { id: 'b', at: '2026-05-08T12:00:00Z', moodBefore: 7, moodAfter: 3 },
        { id: 'c', at: '2026-05-07T12:00:00Z', moodBefore: 9, moodAfter: 5 },
        // Outside window.
        { id: 'd', at: '2026-04-20T12:00:00Z', moodBefore: 9, moodAfter: 1 },
      ],
      { now },
    );
    expect(r.triggered).toBe(true);
    expect(r.matchCount).toBe(3);
    expect(r.matchIds).toContain('a');
  });

  it('does not trigger at 2 drops (below threshold)', () => {
    const r = detectMoodDropPattern(
      [
        { id: 'a', at: '2026-05-09T12:00:00Z', moodBefore: 8, moodAfter: 4 },
        { id: 'b', at: '2026-05-08T12:00:00Z', moodBefore: 7, moodAfter: 3 },
        { id: 'c', at: '2026-05-07T12:00:00Z', moodBefore: 5, moodAfter: 5 },
      ],
      { now },
    );
    expect(r.triggered).toBe(false);
    expect(r.matchCount).toBe(2);
  });

  it('ignores logs with missing mood fields', () => {
    const r = detectMoodDropPattern(
      [
        { id: 'a', at: '2026-05-09T12:00:00Z', moodBefore: 8, moodAfter: null },
        { id: 'b', at: '2026-05-08T12:00:00Z', moodBefore: null, moodAfter: 3 },
        { id: 'c', at: '2026-05-07T12:00:00Z', moodBefore: 9, moodAfter: 5 },
      ],
      { now },
    );
    expect(r.matchCount).toBe(1);
    expect(r.triggered).toBe(false);
  });

  it('ignores logs whose drop is below dropMagnitude', () => {
    const r = detectMoodDropPattern(
      [
        { id: 'a', at: '2026-05-09T12:00:00Z', moodBefore: 6, moodAfter: 4 }, // -2
        { id: 'b', at: '2026-05-08T12:00:00Z', moodBefore: 5, moodAfter: 3 }, // -2
        { id: 'c', at: '2026-05-07T12:00:00Z', moodBefore: 7, moodAfter: 5 }, // -2
      ],
      { now, dropMagnitude: 3 },
    );
    expect(r.triggered).toBe(false);
    expect(r.matchCount).toBe(0);
  });
});

// ─── evaluateOnCbtLog ──────────────────────────────────────────────────────

function makeLog(partial: Partial<CbtLog>): CbtLog {
  return {
    id: partial.id ?? 'l',
    userId: 'u',
    tenantId: 't',
    kind: partial.kind ?? 'thought-record',
    exerciseId: null,
    startedAt: partial.startedAt ?? '2026-05-10T12:00:00.000Z',
    completedAt: partial.completedAt ?? '2026-05-10T12:00:00.000Z',
    moodBefore: partial.moodBefore ?? null,
    moodAfter: partial.moodAfter ?? null,
    data: partial.data ?? {},
    notes: partial.notes ?? null,
    createdAt: '2026-05-10T12:00:00.000Z',
    updatedAt: '2026-05-10T12:00:00.000Z',
  };
}

describe('evaluateOnCbtLog', () => {
  const now = new Date('2026-05-10T12:00:00Z');

  it('emits crisis-language when automatic_thought contains a match', () => {
    const log = makeLog({
      kind: 'thought-record',
      data: {
        situation: 'a long day',
        automatic_thought: 'I want to die, nothing helps anymore',
        balanced_thought: 'b',
      },
    });
    const flags = evaluateOnCbtLog(log, [], { now });
    const crisis = flags.find((f) => f.kind === 'crisis-language');
    expect(crisis).toBeDefined();
    expect(crisis?.severity).toBe('critical');
  });

  it('does not emit crisis-language on benign sense-tokens (grounding)', () => {
    const log = makeLog({
      kind: 'grounding-54321',
      data: {
        five_see: ['die-cast model car', 'lamp', 'desk', 'mug', 'plant'],
        four_feel: ['x', 'y', 'z', 'w'],
        three_hear: ['x', 'y', 'z'],
        two_smell: ['x', 'y'],
        one_taste: ['mint'],
      },
    });
    const flags = evaluateOnCbtLog(log, [], { now });
    expect(flags.find((f) => f.kind === 'crisis-language')).toBeUndefined();
  });

  it('emits cbt-mood-drop when 3 recent logs in 7 days drop by ≥3', () => {
    const log = makeLog({
      id: 'new',
      moodBefore: 7,
      moodAfter: 3,
      completedAt: now.toISOString(),
    });
    const recent: CbtLog[] = [
      makeLog({
        id: 'r1',
        moodBefore: 8,
        moodAfter: 4,
        completedAt: '2026-05-09T12:00:00.000Z',
      }),
      makeLog({
        id: 'r2',
        moodBefore: 9,
        moodAfter: 5,
        completedAt: '2026-05-08T12:00:00.000Z',
      }),
    ];
    const flags = evaluateOnCbtLog(log, recent, { now });
    const drop = flags.find((f) => f.kind === 'cbt-mood-drop');
    expect(drop).toBeDefined();
    expect(drop?.severity).toBe('medium');
  });

  it('does not emit cbt-mood-drop on a single bad log', () => {
    const log = makeLog({
      id: 'new',
      moodBefore: 7,
      moodAfter: 3,
      completedAt: now.toISOString(),
    });
    const flags = evaluateOnCbtLog(log, [], { now });
    expect(flags.find((f) => f.kind === 'cbt-mood-drop')).toBeUndefined();
  });
});

// ─── Crisis-guard regression on thought-record automatic_thought ───────────

describe('withCrisisGuard on thought-record automatic_thought (regression)', () => {
  it('persists crisis-language when automatic_thought matches and still completes the save', async () => {
    const persistFlag = vi.fn().mockResolvedValue(undefined);
    const handler = vi.fn().mockResolvedValue({ id: 'cbt-1' });

    interface Body {
      kind: 'thought-record';
      data: {
        situation: string;
        automatic_thought: string;
        balanced_thought: string;
      };
      notes?: string | null;
    }

    const body: Body = {
      kind: 'thought-record',
      data: {
        situation: 'long day',
        automatic_thought: 'I want to kill myself, no point anymore',
        balanced_thought: '...',
      },
      notes: null,
    };

    const result = await withCrisisGuard<Body, { id: string }>(
      body,
      {
        osSlug: 'health',
        source: 'cbt-thought-record',
        extractText: (b) => [
          b.notes,
          b.data.situation,
          b.data.automatic_thought,
          b.data.balanced_thought,
        ],
        persistFlag,
      },
      handler,
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('cbt-1');
    expect(persistFlag).toHaveBeenCalledTimes(1);
    const flag = persistFlag.mock.calls[0]?.[0];
    expect(flag.kind).toBe('crisis-language');
    expect(flag.severity).toBe('critical');
    expect(flag.source).toBe('cbt-thought-record');
  });

  it('does not block when thought-record fields are benign', async () => {
    const persistFlag = vi.fn();
    const handler = vi.fn().mockResolvedValue('saved');
    const result = await withCrisisGuard<{ data: { x: string } }, string>(
      { data: { x: 'I had a tough morning but recovered.' } },
      {
        osSlug: 'health',
        source: 'cbt-thought-record',
        extractText: (b) => [b.data.x],
        persistFlag,
      },
      handler,
    );
    expect(result).toBe('saved');
    expect(persistFlag).not.toHaveBeenCalled();
  });
});

// ─── Lifecycle smoke (mocked pool) ──────────────────────────────────────────

describe('CBT lifecycle smoke', () => {
  it('record → list → get → delete → list-empty all hit the right SQL', async () => {
    const id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    // recordCbtLog → INSERT … RETURNING …
    pushResult({
      rows: [
        {
          id,
          user_id: 'u',
          tenant_id: 't',
          kind: 'thought-record',
          exercise_id: null,
          started_at: new Date(),
          completed_at: new Date(),
          mood_before: 5,
          mood_after: 7,
          data: { situation: 'a', automatic_thought: 'b', balanced_thought: 'c' },
          notes: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    // listCbtLogs (1 result)
    pushResult({
      rows: [
        {
          id,
          user_id: 'u',
          tenant_id: 't',
          kind: 'thought-record',
          exercise_id: null,
          started_at: new Date(),
          completed_at: new Date(),
          mood_before: 5,
          mood_after: 7,
          data: {},
          notes: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    // getCbtLog
    pushResult({
      rows: [
        {
          id,
          user_id: 'u',
          tenant_id: 't',
          kind: 'thought-record',
          exercise_id: null,
          started_at: new Date(),
          completed_at: new Date(),
          mood_before: 5,
          mood_after: 7,
          data: {},
          notes: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    // deleteCbtLog
    pushResult({ rows: [], rowCount: 1 });
    // listCbtLogs (empty)
    pushResult({ rows: [], rowCount: 0 });

    const repo = await import('@/lib/agentic-os/health/repo');
    const created = await repo.recordCbtLog('u', 't', {
      kind: 'thought-record',
      data: {
        situation: 'a',
        automatic_thought: 'b',
        balanced_thought: 'c',
      },
      moodBefore: 5,
      moodAfter: 7,
    });
    expect(created.id).toBe(id);

    const listed = await repo.listCbtLogs('u');
    expect(listed.length).toBe(1);

    const got = await repo.getCbtLog(id, 'u');
    expect(got?.id).toBe(id);

    const ok = await repo.deleteCbtLog(id, 'u');
    expect(ok).toBe(true);

    const empty = await repo.listCbtLogs('u');
    expect(empty.length).toBe(0);

    expect(calls[0]?.sql).toMatch(/INSERT INTO agos_mh_cbt_log/);
    expect(calls[3]?.sql).toMatch(/DELETE FROM agos_mh_cbt_log/);
  });
});

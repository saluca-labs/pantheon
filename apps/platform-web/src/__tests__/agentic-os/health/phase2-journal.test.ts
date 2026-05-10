/**
 * Health OS Phase 2 — journal entry persistence + crisis-guard regression.
 *
 * Coverage:
 *   - Journal entry persistence with and without prompt_id.
 *   - Zod schema rejects empty body, accepts up to 50_000 chars.
 *   - Crisis-guard wrapper triggers on a journal body containing crisis
 *     language → flag persisted, request still completes (regression on
 *     the safety-critical contract).
 *   - PSS-10 scoring helper: known sample inputs → known total + severity.
 *   - PSS-10 reverse-scored items 4, 5, 7, 8 are subtracted from 4.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withCrisisGuard } from '@/lib/agentic-os/_shared/safety/crisis-guard';
import {
  scorePss10,
  scoreScreener,
  PSS10_REVERSE_ITEMS,
} from '@/lib/agentic-os/health/screeners';
import {
  JournalEntryBody,
  JournalEntryUpdateBody,
} from '@/lib/agentic-os/health/schemas';

// ─── Fake pool, same pattern as phase2-mood.test.ts ────────────────────────

interface PgResult {
  rows: any[];
  rowCount: number;
}

const queue: PgResult[] = [];
const calls: { sql: string; params: any[] }[] = [];

function pushResult(r: Partial<PgResult>): void {
  queue.push({
    rows: r.rows ?? [],
    rowCount: r.rowCount ?? (r.rows?.length ?? 0),
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

describe('JournalEntryBody schema', () => {
  it('accepts a basic entry without prompt', () => {
    const r = JournalEntryBody.safeParse({ body: 'A reflection.' });
    expect(r.success).toBe(true);
  });
  it('accepts a prompted entry with title', () => {
    const r = JournalEntryBody.safeParse({
      body: 'Long form thoughts.',
      title: 'Tuesday',
      promptId: '00000000-0000-0000-0000-000000000001',
    });
    expect(r.success).toBe(true);
  });
  it('rejects empty body', () => {
    const r = JournalEntryBody.safeParse({ body: '' });
    expect(r.success).toBe(false);
  });
  it('rejects body over 50_000 chars', () => {
    const r = JournalEntryBody.safeParse({ body: 'x'.repeat(50_001) });
    expect(r.success).toBe(false);
  });
  it('update body allows partial body or no body', () => {
    expect(JournalEntryUpdateBody.safeParse({}).success).toBe(true);
    expect(
      JournalEntryUpdateBody.safeParse({ title: 'Just a title change' })
        .success,
    ).toBe(true);
  });
});

describe('repo.recordJournalEntry', () => {
  it('persists a journal entry without prompt_id', async () => {
    const id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    pushResult({
      rows: [
        {
          id,
          user_id: 'u',
          tenant_id: 't',
          prompt_id: null,
          title: null,
          body: 'A neutral reflection.',
          entry_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    const { recordJournalEntry } = await import(
      '@/lib/agentic-os/health/repo'
    );
    const entry = await recordJournalEntry('u', 't', {
      body: 'A neutral reflection.',
    });
    expect(entry.id).toBe(id);
    expect(entry.promptId).toBeNull();
    expect(calls[0]?.sql).toMatch(/INSERT INTO agos_mh_journal_entry/);
    // 4th param is prompt_id; should be null.
    expect(calls[0]?.params[3]).toBeNull();
  });

  it('persists a journal entry with a prompt_id', async () => {
    const id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const promptId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    pushResult({
      rows: [
        {
          id,
          user_id: 'u',
          tenant_id: 't',
          prompt_id: promptId,
          title: 'Thought record',
          body: 'My evidence is...',
          entry_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    const { recordJournalEntry } = await import(
      '@/lib/agentic-os/health/repo'
    );
    const entry = await recordJournalEntry('u', 't', {
      body: 'My evidence is...',
      title: 'Thought record',
      promptId,
    });
    expect(entry.promptId).toBe(promptId);
    // prompt_id is the 4th positional param.
    expect(calls[0]?.params[3]).toBe(promptId);
  });
});

describe('withCrisisGuard on journal body — safety-critical regression', () => {
  it('persists a critical crisis-language flag and still completes the save', async () => {
    const persistFlag = vi.fn().mockResolvedValue(undefined);
    const handler = vi.fn().mockResolvedValue({ id: 'journal-1', body: '...' });

    interface JournalBody {
      title?: string | null;
      body: string;
    }

    const result = await withCrisisGuard<JournalBody, { id: string; body: string }>(
      { body: 'I want to kill myself, nothing helps anymore' },
      {
        osSlug: 'health',
        source: 'journal-entry',
        extractText: (b) => [b.title, b.body],
        persistFlag,
      },
      handler,
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('journal-1');
    expect(persistFlag).toHaveBeenCalledTimes(1);
    const flag = persistFlag.mock.calls[0]?.[0];
    expect(flag.kind).toBe('crisis-language');
    expect(flag.severity).toBe('critical');
    expect(flag.source).toBe('journal-entry');
  });

  it('does not block when journal body is benign', async () => {
    const persistFlag = vi.fn();
    const handler = vi.fn().mockResolvedValue('saved');
    const result = await withCrisisGuard<{ body: string }, string>(
      { body: 'Today I noticed I was anxious before the meeting.' },
      {
        osSlug: 'health',
        source: 'journal-entry',
        extractText: (b) => [b.body],
        persistFlag,
      },
      handler,
    );
    expect(result).toBe('saved');
    expect(persistFlag).not.toHaveBeenCalled();
  });
});

describe('scorePss10', () => {
  it('reverse-scores items 4, 5, 7, 8', () => {
    expect(PSS10_REVERSE_ITEMS).toEqual([4, 5, 7, 8]);
    // All zeros: items 4/5/7/8 invert to 4 each → 16. Items 1/2/3/6/9/10 stay 0.
    const r = scorePss10([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.totalScore).toBe(16);
    expect(r.severity).toBe('moderate');
  });

  it('all-fours produces total 24 (mod from inverted halves)', () => {
    // Forward items (1,2,3,6,9,10) = 6 items * 4 = 24
    // Reverse items (4,5,7,8) = 4 items, each becomes 4 - 4 = 0 → +0
    const r = scorePss10([4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
    expect(r.totalScore).toBe(24);
    expect(r.severity).toBe('moderate');
  });

  it('asymmetric high-stress example crosses high (>= 27)', () => {
    // Forward 4s + reverse 0s → forward sum 24 + reverse contribution 16 = 40 (max)
    const r = scorePss10([4, 4, 4, 0, 0, 4, 0, 0, 4, 4]);
    expect(r.totalScore).toBe(40);
    expect(r.severity).toBe('high');
  });

  it('all-zeros forward + all-fours reverse yields the project-low band', () => {
    // Forward items 0 → 0. Reverse items 4 → 4 - 4 = 0 each.
    const r = scorePss10([0, 0, 0, 4, 4, 0, 4, 4, 0, 0]);
    expect(r.totalScore).toBe(0);
    expect(r.severity).toBe('low');
  });

  it('rejects malformed answer arrays', () => {
    expect(() => scorePss10([0, 0, 0])).toThrow();
    expect(() => scorePss10([5, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toThrow();
    expect(() => scorePss10([-1, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toThrow();
  });
});

describe('scoreScreener("pss", ...)', () => {
  it('lifts the PSS scoring into the shared envelope', () => {
    // Same 0-array case: total 16 → moderate
    const r = scoreScreener('pss', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.score).toBe(16);
    expect(r.severity).toBe('moderate');
    expect(r.crisisFlag).toBe(false);
  });

  it('maps the project high band to the shared "severe" severity', () => {
    const r = scoreScreener('pss', [4, 4, 4, 0, 0, 4, 0, 0, 4, 4]);
    expect(r.score).toBe(40);
    expect(r.severity).toBe('severe');
  });
});

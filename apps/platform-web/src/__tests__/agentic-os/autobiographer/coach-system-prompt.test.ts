/**
 * Autobiographer OS Phase 7 — system-prompt builder tests.
 *
 * Covers:
 *   - SYSTEM_PROMPT_VERSION pinning (bump test).
 *   - HARD_RULES contains the 4 expected hard rules.
 *   - Per-mode role framing presence.
 *   - chapter_drafter prompt includes the cited-paragraph format note.
 *   - Sensitive footer instructions reified at the prompt level
 *     (generic vs. professional-reader escalation).
 *   - Context rendering doesn't crash on edge cases (empty arrays).
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  HARD_RULES,
  SYSTEM_PROMPT_VERSION,
  activeSensitiveKinds,
  buildSystemPrompt,
} from '@/lib/agentic-os/autobiographer/coach/system-prompt';
import type { AutobiographerCoachContext } from '@/lib/agentic-os/autobiographer/coach/context';

const EMPTY_BOOK = {
  id: 'b-1',
  title: 'Test Book',
  subtitle: null,
  status: 'drafting',
  target_completion_date: null,
  target_audience: null,
  tags: [],
  description: null,
  phase_progress_avg: 0,
};

describe('SYSTEM_PROMPT_VERSION', () => {
  it('is pinned at v1 for the Phase 7 ship', () => {
    expect(SYSTEM_PROMPT_VERSION).toBe('v1');
  });

  it('is a versioned string the route can stamp into session metadata', () => {
    expect(typeof SYSTEM_PROMPT_VERSION).toBe('string');
    expect(SYSTEM_PROMPT_VERSION.length).toBeGreaterThan(0);
  });
});

describe('HARD_RULES', () => {
  it('declares Rule 1: NO FABRICATION', () => {
    expect(HARD_RULES).toMatch(/NO FABRICATION/);
    expect(HARD_RULES).toMatch(/invent memories, names, dates/i);
  });

  it('declares Rule 2: HONOR CONSENT', () => {
    expect(HARD_RULES).toMatch(/HONOR CONSENT/);
    expect(HARD_RULES).toMatch(/consent_to_publish/);
    expect(HARD_RULES).toMatch(/pending|withheld/);
    expect(HARD_RULES).toMatch(/deceased|public_figure/);
  });

  it('declares Rule 3: SENSITIVE-CONTENT FOOTER', () => {
    expect(HARD_RULES).toMatch(/SENSITIVE-CONTENT FOOTER/);
    expect(HARD_RULES).toMatch(/sensitive_kind tag/);
  });

  it('declares Rule 4: PROFESSIONAL-READER RECOMMENDATION', () => {
    expect(HARD_RULES).toMatch(/PROFESSIONAL-READER RECOMMENDATION/);
    expect(HARD_RULES).toMatch(/sexual, abuse, mental_health/);
    expect(HARD_RULES).toMatch(/licensed professional/);
    expect(HARD_RULES).toMatch(/not a refusal/);
  });

  it('emphasizes the no-AI-boilerplate output rule', () => {
    expect(HARD_RULES).toMatch(/Output plain markdown/);
    expect(HARD_RULES).toMatch(/No "as an AI" boilerplate/);
  });
});

describe('buildSystemPrompt: per-mode framing', () => {
  it('interviewer framing mentions sensory / open-ended questions', () => {
    const ctx: AutobiographerCoachContext = {
      mode: 'interviewer',
      data: {
        book: EMPTY_BOOK,
        person: null,
        recent_memories: [],
        person_memories: [],
        workshop_counts: { memory_count: 0, book_count: 0, person_count: 0 },
      },
    };
    const out = buildSystemPrompt(ctx, 'interviewer');
    expect(out).toMatch(/empathetic memoir interviewer/i);
    expect(out).toMatch(/open-ended|sensory/i);
  });

  it('chapter_drafter framing mentions one paragraph at a time + citation format', () => {
    const ctx: AutobiographerCoachContext = {
      mode: 'chapter_drafter',
      data: {
        book: EMPTY_BOOK,
        chapter: null,
        source_memories: [],
        voice_profile: null,
        people: [],
        pseudonyms: [],
        sensitive_kinds: [],
      },
    };
    const out = buildSystemPrompt(ctx, 'chapter_drafter');
    expect(out).toMatch(/ONE PARAGRAPH AT A TIME/);
    expect(out).toMatch(/\[cites: memory_id_1/);
    expect(out).toMatch(/NEVER write a paragraph that has no citation/);
  });

  it('narrative_critic framing mentions pacing / repetition / voice drift', () => {
    const ctx: AutobiographerCoachContext = {
      mode: 'narrative_critic',
      data: {
        book: EMPTY_BOOK,
        chapters: [],
        arcs: [],
        primary_arc_id: null,
      },
    };
    const out = buildSystemPrompt(ctx, 'narrative_critic');
    expect(out).toMatch(/Pacing/i);
    expect(out).toMatch(/Repetition/i);
    expect(out).toMatch(/Voice drift/i);
  });

  it('general framing mentions stuck-author + suggests mode switch', () => {
    const ctx: AutobiographerCoachContext = {
      mode: 'general',
      data: {
        book: null,
        counts: {
          chapter_count: 0,
          memory_count: 0,
          book_count: 0,
          voice_sample_count: 0,
          person_count: 0,
        },
      },
    };
    const out = buildSystemPrompt(ctx, 'general');
    expect(out).toMatch(/stuck-author/i);
    expect(out).toMatch(/chapter_drafter|narrative_critic|interviewer/);
  });
});

describe('buildSystemPrompt: sensitive footer reification', () => {
  function drafterCtx(kinds: string[]): AutobiographerCoachContext {
    return {
      mode: 'chapter_drafter',
      data: {
        book: EMPTY_BOOK,
        chapter: null,
        source_memories: [],
        voice_profile: null,
        people: [],
        pseudonyms: [],
        sensitive_kinds: kinds as never,
      },
    };
  }

  it('omits the footer block when sensitive_kinds is empty', () => {
    const out = buildSystemPrompt(drafterCtx([]), 'chapter_drafter');
    expect(out).not.toMatch(/Footer instruction \(this turn\)/);
  });

  it('reifies the SENSITIVE-CONTENT footer for non-trauma kinds', () => {
    const out = buildSystemPrompt(drafterCtx(['legal']), 'chapter_drafter');
    expect(out).toMatch(/Footer instruction \(this turn\)/);
    expect(out).toMatch(/SENSITIVE-CONTENT footer per Rule 3/);
    expect(out).not.toMatch(/PROFESSIONAL-READER footer/);
  });

  it('escalates to PROFESSIONAL-READER footer for trauma-facing kinds', () => {
    for (const k of ['sexual', 'abuse', 'mental_health']) {
      const out = buildSystemPrompt(drafterCtx([k]), 'chapter_drafter');
      expect(out).toMatch(/PROFESSIONAL-READER footer per Rule 4/);
    }
  });

  it('escalates when any trauma kind is in a mixed set', () => {
    const out = buildSystemPrompt(
      drafterCtx(['legal', 'mental_health']),
      'chapter_drafter',
    );
    expect(out).toMatch(/PROFESSIONAL-READER footer per Rule 4/);
  });
});

describe('activeSensitiveKinds', () => {
  it('returns [] for interviewer mode', () => {
    expect(
      activeSensitiveKinds({
        mode: 'interviewer',
        data: {
          book: null,
          person: null,
          recent_memories: [],
          person_memories: [],
          workshop_counts: { memory_count: 0, book_count: 0, person_count: 0 },
        },
      }),
    ).toEqual([]);
  });

  it('returns [] for narrative_critic mode', () => {
    expect(
      activeSensitiveKinds({
        mode: 'narrative_critic',
        data: { book: EMPTY_BOOK, chapters: [], arcs: [], primary_arc_id: null },
      }),
    ).toEqual([]);
  });

  it('returns [] for general mode', () => {
    expect(
      activeSensitiveKinds({
        mode: 'general',
        data: {
          book: null,
          counts: {
            chapter_count: 0,
            memory_count: 0,
            book_count: 0,
            voice_sample_count: 0,
            person_count: 0,
          },
        },
      }),
    ).toEqual([]);
  });

  it('returns the chapter_drafter sensitive_kinds set', () => {
    expect(
      activeSensitiveKinds({
        mode: 'chapter_drafter',
        data: {
          book: EMPTY_BOOK,
          chapter: null,
          source_memories: [],
          voice_profile: null,
          people: [],
          pseudonyms: [],
          sensitive_kinds: ['legal', 'death'] as never,
        },
      }),
    ).toEqual(['legal', 'death']);
  });
});

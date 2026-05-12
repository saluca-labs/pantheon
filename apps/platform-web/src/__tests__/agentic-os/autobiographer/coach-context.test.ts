/**
 * Autobiographer OS Phase 7 — coach context loader tests.
 *
 * Covers:
 *   - Per-mode dispatch (interviewer / chapter_drafter / narrative_critic / general).
 *   - Selectivity: each mode loads only the data its system prompt
 *     consumes.
 *   - 404 when bookId doesn't belong to user (chapter_drafter +
 *     narrative_critic throw, surfacing to a route-level 400).
 *   - Per-mode truncation drop order (interviewer / chapter_drafter /
 *     narrative_critic / general).
 *   - Workshop-scoped interviewer / general paths.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const repoMocks = vi.hoisted(() => ({
  getBookWithCounts: vi.fn(),
  listBooks: vi.fn(),
  listMemories: vi.fn(),
  listMemoriesForBook: vi.fn(),
  getPerson: vi.fn(),
  listMemoriesForPerson: vi.fn(),
  listChaptersForBook: vi.fn(),
  listSourcesForChapter: vi.fn(),
  getActiveVoiceProfile: vi.fn(),
  listArcsForBook: vi.fn(),
  getPrimaryArcForBook: vi.fn(),
  listChaptersForArc: vi.fn(),
  listPseudonymsForBook: vi.fn(),
  listPeople: vi.fn(),
}));

vi.mock('@/lib/agentic-os/autobiographer/books-repo', () => ({
  getBookWithCounts: repoMocks.getBookWithCounts,
  listBooks: repoMocks.listBooks,
}));
vi.mock('@/lib/agentic-os/autobiographer/memories-repo', () => ({
  listMemories: repoMocks.listMemories,
  listMemoriesForBook: repoMocks.listMemoriesForBook,
}));
vi.mock('@/lib/agentic-os/autobiographer/people-repo', () => ({
  getPerson: repoMocks.getPerson,
  listPeople: repoMocks.listPeople,
}));
vi.mock('@/lib/agentic-os/autobiographer/memory-people-repo', () => ({
  listMemoriesForPerson: repoMocks.listMemoriesForPerson,
}));
vi.mock('@/lib/agentic-os/autobiographer/chapters-repo', () => ({
  listChaptersForBook: repoMocks.listChaptersForBook,
}));
vi.mock('@/lib/agentic-os/autobiographer/chapter-sources-repo', () => ({
  listSourcesForChapter: repoMocks.listSourcesForChapter,
}));
vi.mock('@/lib/agentic-os/autobiographer/voice-profiles-repo', () => ({
  getActiveVoiceProfile: repoMocks.getActiveVoiceProfile,
}));
vi.mock('@/lib/agentic-os/autobiographer/arcs-repo', () => ({
  listArcsForBook: repoMocks.listArcsForBook,
  getPrimaryArcForBook: repoMocks.getPrimaryArcForBook,
}));
vi.mock('@/lib/agentic-os/autobiographer/arc-chapters-repo', () => ({
  listChaptersForArc: repoMocks.listChaptersForArc,
}));
vi.mock('@/lib/agentic-os/autobiographer/pseudonyms-repo', () => ({
  listPseudonymsForBook: repoMocks.listPseudonymsForBook,
}));
vi.mock('@/lib/agentic-os/autobiographer/session', () => ({
  getAutobiographerPool: () => ({ query: vi.fn() }),
}));

import {
  buildCoachContext,
  truncateChapterDrafter,
  truncateInterviewer,
  truncateNarrativeCritic,
  MAX_CONTEXT_BYTES,
  type CoachInterviewerContext,
  type CoachChapterDrafterContext,
  type CoachNarrativeCriticContext,
} from '@/lib/agentic-os/autobiographer/coach/context';

beforeEach(() => {
  for (const m of Object.values(repoMocks)) (m as any).mockReset();
});

function makeBook(over: Record<string, any> = {}): any {
  return {
    id: 'b-1',
    userId: 'u-1',
    title: 'My Memoir',
    subtitle: null,
    coverImageUrl: null,
    description: 'A life story',
    status: 'drafting',
    targetCompletionDate: '2026-12-31',
    targetAudience: 'family',
    tags: ['memoir'],
    phaseProgress: {
      capture: 70,
      structure: 40,
      drafting: 20,
      revision: 0,
    },
    metadata: {},
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-12T10:00:00Z',
    memoryCount: 25,
    ...over,
  };
}

function makeMemory(over: Record<string, any> = {}): any {
  return {
    id: 'm-1',
    userId: 'u-1',
    bookId: 'b-1',
    title: 'First day of school',
    bodyMarkdown: 'I remember the smell of pencil shavings.',
    transcript: null,
    audioUrl: null,
    photoUrls: [],
    whenInLife: 'age 6',
    eraDateEstimate: '1990-09-01',
    location: 'Albuquerque',
    emotionTags: ['nervous'],
    contentTags: ['school'],
    isSensitive: false,
    source: 'text',
    sensitiveKinds: [],
    metadata: {},
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    ...over,
  };
}

// ═════════ interviewer ═════════════════════════════════════════════════════

describe('buildCoachContext: interviewer', () => {
  beforeEach(() => {
    repoMocks.listMemories.mockResolvedValue([makeMemory()]);
    repoMocks.listMemoriesForBook.mockResolvedValue([makeMemory()]);
    repoMocks.listBooks.mockResolvedValue([makeBook()]);
    repoMocks.listPeople.mockResolvedValue([]);
  });

  it('loads workshop-scoped data when no bookId', async () => {
    const { context, truncated } = await buildCoachContext({
      userId: 'u-1',
      mode: 'interviewer',
    });
    expect(context.mode).toBe('interviewer');
    expect(repoMocks.listMemories).toHaveBeenCalled();
    expect(repoMocks.listMemoriesForBook).not.toHaveBeenCalled();
    expect(truncated).toBe(false);
  });

  it('loads book-scoped memories when bookId set', async () => {
    repoMocks.getBookWithCounts.mockResolvedValue(makeBook());
    const { context } = await buildCoachContext({
      userId: 'u-1',
      mode: 'interviewer',
      bookId: 'b-1',
    });
    expect(repoMocks.listMemoriesForBook).toHaveBeenCalledWith(
      'b-1',
      'u-1',
      { limit: 10 },
    );
    expect((context.data as CoachInterviewerContext).book).toBeTruthy();
    expect((context.data as CoachInterviewerContext).book!.title).toBe(
      'My Memoir',
    );
  });

  it('loads person row + their referencing memories when personId set', async () => {
    repoMocks.getPerson.mockResolvedValue({
      id: 'p-1',
      userId: 'u-1',
      canonicalName: 'Aunt Maria',
      aliases: [],
      relation: 'aunt',
      birthYear: 1950,
      deathYear: null,
      consentToPublish: 'granted',
      consentRecordedAt: null,
      consentRecordedBy: null,
      notes: null,
      imageUrl: null,
      metadata: {},
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-01T00:00:00Z',
    });
    repoMocks.listMemoriesForPerson.mockResolvedValue([
      { memoryId: 'm-1', bookId: 'b-1', title: 'Family dinner' },
    ]);
    repoMocks.listMemories.mockResolvedValue([makeMemory({ id: 'm-1' })]);
    const { context } = await buildCoachContext({
      userId: 'u-1',
      mode: 'interviewer',
      personId: 'p-1',
    });
    const data = context.data as CoachInterviewerContext;
    expect(data.person).toBeTruthy();
    expect(data.person!.canonical_name).toBe('Aunt Maria');
    expect(data.person_memories.length).toBe(1);
  });

  it('sorts recent_memories chronologically (era_date ASC, nulls last)', async () => {
    repoMocks.listMemories.mockResolvedValue([
      makeMemory({ id: 'm-2', eraDateEstimate: '2000-01-01' }),
      makeMemory({ id: 'm-1', eraDateEstimate: '1990-09-01' }),
      makeMemory({ id: 'm-3', eraDateEstimate: null }),
    ]);
    const { context } = await buildCoachContext({
      userId: 'u-1',
      mode: 'interviewer',
    });
    const data = context.data as CoachInterviewerContext;
    expect(data.recent_memories[0].id).toBe('m-1');
    expect(data.recent_memories[1].id).toBe('m-2');
    expect(data.recent_memories[2].id).toBe('m-3');
  });
});

// ═════════ chapter_drafter ═════════════════════════════════════════════════

describe('buildCoachContext: chapter_drafter', () => {
  beforeEach(() => {
    repoMocks.getBookWithCounts.mockResolvedValue(makeBook());
    repoMocks.listChaptersForBook.mockResolvedValue([
      {
        id: 'c-1',
        userId: 'u-1',
        bookId: 'b-1',
        title: 'Chapter 1',
        slug: 'chapter-1',
        position: 0,
        status: 'drafting',
        summary: 'opener',
        targetWordCount: 2000,
        metadata: {},
        createdAt: '',
        updatedAt: '',
      },
    ]);
    repoMocks.listSourcesForChapter.mockResolvedValue([
      {
        id: 's-1',
        chapterId: 'c-1',
        memoryId: 'm-1',
        weight: 1.0,
        notes: null,
        memoryTitle: 'First day',
        memoryWhenInLife: 'age 6',
        memoryEraDate: '1990-09-01',
        paragraphCitationCount: 0,
      },
    ]);
    repoMocks.listMemoriesForBook.mockResolvedValue([
      makeMemory({ sensitiveKinds: ['legal'] }),
    ]);
    repoMocks.getActiveVoiceProfile.mockResolvedValue({
      id: 'v-1',
      userId: 'u-1',
      version: 3,
      isActive: true,
      styleSummary: 'Wistful, deliberate, sensory.',
      styleAdjectives: ['wistful'],
      styleRules: ['no semicolons'],
      exampleOpenings: ['It was a summer like any other.'],
      sampleCount: 12,
      sampleWordCount: 5_000,
      builtAt: '2026-05-01T00:00:00Z',
      builder: 'anthropic',
      metadata: {},
    });
    repoMocks.listPseudonymsForBook.mockResolvedValue([]);
    repoMocks.listPeople.mockResolvedValue([]);
  });

  it('throws when no bookId', async () => {
    await expect(
      buildCoachContext({ userId: 'u-1', mode: 'chapter_drafter' }),
    ).rejects.toThrow(/chapter_drafter requires a bookId/);
  });

  it('throws when book not owned (getBookWithCounts returns null)', async () => {
    repoMocks.getBookWithCounts.mockResolvedValue(null);
    await expect(
      buildCoachContext({
        userId: 'u-1',
        mode: 'chapter_drafter',
        bookId: 'b-1',
      }),
    ).rejects.toThrow(/Book not found/);
  });

  it('loads chapter + sources + voice + pseudonyms + people in one payload', async () => {
    const { context } = await buildCoachContext({
      userId: 'u-1',
      mode: 'chapter_drafter',
      bookId: 'b-1',
      chapterId: 'c-1',
    });
    const data = context.data as CoachChapterDrafterContext;
    expect(data.chapter!.id).toBe('c-1');
    expect(data.source_memories.length).toBe(1);
    expect(data.voice_profile!.version).toBe(3);
    expect(data.book.title).toBe('My Memoir');
  });

  it('hydrates source_memories.sensitive_kinds from full memory rows', async () => {
    const { context } = await buildCoachContext({
      userId: 'u-1',
      mode: 'chapter_drafter',
      bookId: 'b-1',
      chapterId: 'c-1',
    });
    const data = context.data as CoachChapterDrafterContext;
    expect(data.source_memories[0].sensitive_kinds).toEqual(['legal']);
    expect(data.sensitive_kinds).toEqual(['legal']);
  });

  it('returns null voice_profile when none active', async () => {
    repoMocks.getActiveVoiceProfile.mockResolvedValue(null);
    const { context } = await buildCoachContext({
      userId: 'u-1',
      mode: 'chapter_drafter',
      bookId: 'b-1',
      chapterId: 'c-1',
    });
    expect((context.data as CoachChapterDrafterContext).voice_profile).toBeNull();
  });
});

// ═════════ narrative_critic ════════════════════════════════════════════════

describe('buildCoachContext: narrative_critic', () => {
  beforeEach(() => {
    repoMocks.getBookWithCounts.mockResolvedValue(makeBook());
    repoMocks.listChaptersForBook.mockResolvedValue([
      {
        id: 'c-1',
        userId: 'u-1',
        bookId: 'b-1',
        title: 'Chapter 1',
        slug: 'chapter-1',
        position: 0,
        status: 'drafting',
        summary: 'opener',
        targetWordCount: 2000,
        metadata: {},
        createdAt: '',
        updatedAt: '',
      },
    ]);
    repoMocks.listArcsForBook.mockResolvedValue([
      {
        id: 'a-1',
        userId: 'u-1',
        bookId: 'b-1',
        title: 'Main arc',
        kind: 'chronological',
        description: 'Birth to now',
        isPrimary: true,
        metadata: {},
        createdAt: '',
        updatedAt: '',
      },
    ]);
    repoMocks.getPrimaryArcForBook.mockResolvedValue({
      id: 'a-1',
      isPrimary: true,
    });
    repoMocks.listChaptersForArc.mockResolvedValue([{ chapterId: 'c-1' }]);
  });

  it('throws when no bookId', async () => {
    await expect(
      buildCoachContext({ userId: 'u-1', mode: 'narrative_critic' }),
    ).rejects.toThrow(/narrative_critic requires a bookId/);
  });

  it('throws when book not owned', async () => {
    repoMocks.getBookWithCounts.mockResolvedValue(null);
    await expect(
      buildCoachContext({
        userId: 'u-1',
        mode: 'narrative_critic',
        bookId: 'b-1',
      }),
    ).rejects.toThrow(/Book not found/);
  });

  it('loads chapter list + arcs + primary arc id', async () => {
    const { context } = await buildCoachContext({
      userId: 'u-1',
      mode: 'narrative_critic',
      bookId: 'b-1',
    });
    const data = context.data as CoachNarrativeCriticContext;
    expect(data.chapters.length).toBe(1);
    expect(data.arcs.length).toBe(1);
    expect(data.arcs[0].is_primary).toBe(true);
    expect(data.primary_arc_id).toBe('a-1');
  });

  it('annotates each arc with its chapter_count', async () => {
    const { context } = await buildCoachContext({
      userId: 'u-1',
      mode: 'narrative_critic',
      bookId: 'b-1',
    });
    const data = context.data as CoachNarrativeCriticContext;
    expect(data.arcs[0].chapter_count).toBe(1);
  });
});

// ═════════ general ═════════════════════════════════════════════════════════

describe('buildCoachContext: general', () => {
  beforeEach(() => {
    repoMocks.listBooks.mockResolvedValue([makeBook(), makeBook({ id: 'b-2' })]);
    repoMocks.listMemories.mockResolvedValue([makeMemory()]);
    repoMocks.listMemoriesForBook.mockResolvedValue([makeMemory()]);
    repoMocks.listChaptersForBook.mockResolvedValue([
      { id: 'c-1' },
      { id: 'c-2' },
    ] as any);
    repoMocks.listPeople.mockResolvedValue([]);
  });

  it('returns counts only when workshop-scoped (no bookId)', async () => {
    const { context } = await buildCoachContext({
      userId: 'u-1',
      mode: 'general',
    });
    expect(context.mode).toBe('general');
    expect((context.data as any).book).toBeNull();
    expect((context.data as any).counts.book_count).toBe(2);
  });

  it('returns book-scoped counts when bookId set', async () => {
    repoMocks.getBookWithCounts.mockResolvedValue(makeBook());
    const { context } = await buildCoachContext({
      userId: 'u-1',
      mode: 'general',
      bookId: 'b-1',
    });
    expect((context.data as any).book.title).toBe('My Memoir');
    expect((context.data as any).counts.chapter_count).toBe(2);
    expect((context.data as any).counts.memory_count).toBe(1);
  });
});

// ═════════ Truncation: interviewer ═════════════════════════════════════════

describe('truncateInterviewer drop order', () => {
  it('drops oldest recent_memories first', () => {
    const big = 'x'.repeat(10_000);
    const data: CoachInterviewerContext = {
      book: null,
      person: { id: 'p-1', canonical_name: 'X', aliases: [], relation: null, consent_to_publish: 'granted', birth_year: null, death_year: null, notes: null },
      recent_memories: Array.from({ length: 10 }, (_, i) => ({
        id: `m-${i}`,
        title: `Memory ${i}`,
        era_date_estimate: null,
        when_in_life: null,
        location: null,
        body_snippet: big,
        emotion_tags: [],
        content_tags: [],
        sensitive_kinds: [] as any,
        source: 'text',
      })),
      person_memories: [],
      workshop_counts: { memory_count: 0, book_count: 0, person_count: 0 },
    };
    const out = truncateInterviewer(data);
    expect(out.truncated).toBe(true);
    expect(JSON.stringify(out.data).length).toBeLessThanOrEqual(MAX_CONTEXT_BYTES);
    expect(out.data.recent_memories.length).toBeLessThan(10);
    // Person row should still be present until recent_memories runs out.
    expect(out.data.person).toBeTruthy();
  });

  it('drops the person row only after all memories are gone', () => {
    const big = 'x'.repeat(60_000);
    const data: CoachInterviewerContext = {
      book: null,
      person: { id: 'p-1', canonical_name: 'X', aliases: [], relation: null, consent_to_publish: 'granted', birth_year: null, death_year: null, notes: big },
      recent_memories: [],
      person_memories: [],
      workshop_counts: { memory_count: 0, book_count: 0, person_count: 0 },
    };
    const out = truncateInterviewer(data);
    expect(out.truncated).toBe(true);
    expect(out.data.person).toBeNull();
  });

  it('returns unchanged when under cap', () => {
    const data: CoachInterviewerContext = {
      book: null,
      person: null,
      recent_memories: [],
      person_memories: [],
      workshop_counts: { memory_count: 0, book_count: 0, person_count: 0 },
    };
    const out = truncateInterviewer(data);
    expect(out.truncated).toBe(false);
    expect(out.data).toEqual(data);
  });
});

// ═════════ Truncation: chapter_drafter ═════════════════════════════════════

describe('truncateChapterDrafter drop order', () => {
  const baseBook = {
    id: 'b-1',
    title: 't',
    subtitle: null,
    status: 's',
    target_completion_date: null,
    target_audience: null,
    tags: [],
    description: null,
    phase_progress_avg: 0,
  };

  it('drops voice_profile.example_openings first (keeps style_summary + rules)', () => {
    const big = 'x'.repeat(60_000);
    const data: CoachChapterDrafterContext = {
      book: baseBook,
      chapter: null,
      source_memories: [],
      voice_profile: {
        id: 'v-1',
        version: 1,
        style_summary: 'Wistful.',
        style_adjectives: ['wistful'],
        style_rules: ['rule1'],
        example_openings: [big, big],
        sample_count: 1,
        sample_word_count: 1,
      },
      people: [],
      pseudonyms: [],
      sensitive_kinds: [],
    };
    const out = truncateChapterDrafter(data);
    expect(out.truncated).toBe(true);
    expect(out.data.voice_profile!.example_openings).toEqual([]);
    expect(out.data.voice_profile!.style_summary).toBe('Wistful.');
    expect(out.data.voice_profile!.style_rules).toEqual(['rule1']);
  });

  it('then strips people detail down to canonical_name only', () => {
    const big = 'x'.repeat(50_000);
    const data: CoachChapterDrafterContext = {
      book: baseBook,
      chapter: null,
      source_memories: [],
      voice_profile: null,
      people: [
        {
          id: 'p-1',
          canonical_name: 'Alice',
          aliases: ['A1', 'A2'],
          relation: 'sister',
          consent_to_publish: 'granted',
          birth_year: 1990,
          death_year: null,
          notes: big,
        },
      ],
      pseudonyms: [],
      sensitive_kinds: [],
    };
    const out = truncateChapterDrafter(data);
    expect(out.truncated).toBe(true);
    expect(out.data.people[0].canonical_name).toBe('Alice');
    expect(out.data.people[0].notes).toBeNull();
    expect(out.data.people[0].aliases).toEqual([]);
  });

  it('then drops oldest source_memories last', () => {
    const big = 'x'.repeat(10_000);
    const data: CoachChapterDrafterContext = {
      book: baseBook,
      chapter: null,
      source_memories: Array.from({ length: 20 }, (_, i) => ({
        memory_id: `m-${i}`,
        memory_title: `Memory ${i}`,
        memory_when_in_life: null,
        memory_era_date: null,
        weight: 1,
        notes: big,
        sensitive_kinds: [] as any,
      })),
      voice_profile: null,
      people: [],
      pseudonyms: [],
      sensitive_kinds: [],
    };
    const out = truncateChapterDrafter(data);
    expect(out.truncated).toBe(true);
    expect(out.data.source_memories.length).toBeLessThan(20);
    expect(JSON.stringify(out.data).length).toBeLessThanOrEqual(MAX_CONTEXT_BYTES);
  });
});

// ═════════ Truncation: narrative_critic ════════════════════════════════════

describe('truncateNarrativeCritic drop order', () => {
  const baseBook = {
    id: 'b-1',
    title: 't',
    subtitle: null,
    status: 's',
    target_completion_date: null,
    target_audience: null,
    tags: [],
    description: null,
    phase_progress_avg: 0,
  };

  it('drops oldest chapters first', () => {
    const big = 'x'.repeat(2_000);
    const data: CoachNarrativeCriticContext = {
      book: baseBook,
      chapters: Array.from({ length: 100 }, (_, i) => ({
        id: `c-${i}`,
        title: `Chapter ${i}`,
        slug: null,
        position: i,
        status: 'drafting',
        summary: big,
        target_word_count: null,
      })),
      arcs: [],
      primary_arc_id: null,
    };
    const out = truncateNarrativeCritic(data);
    expect(out.truncated).toBe(true);
    expect(out.data.chapters.length).toBeLessThan(100);
  });

  it('drops arc descriptions only after chapters run out', () => {
    const big = 'x'.repeat(60_000);
    const data: CoachNarrativeCriticContext = {
      book: baseBook,
      chapters: [],
      arcs: [
        {
          id: 'a-1',
          title: 'main',
          kind: 'chronological',
          is_primary: true,
          description: big,
          chapter_count: 0,
        },
      ],
      primary_arc_id: 'a-1',
    };
    const out = truncateNarrativeCritic(data);
    expect(out.truncated).toBe(true);
    expect(out.data.arcs[0].description).toBeNull();
    expect(out.data.arcs[0].title).toBe('main');
    expect(out.data.arcs[0].kind).toBe('chronological');
  });
});

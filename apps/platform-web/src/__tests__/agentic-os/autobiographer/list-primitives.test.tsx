/**
 * Autobiographer OS Wave C-3b — list-page primitive adoption render tests.
 *
 * Locks the Wave C-3b swaps on the Autobiographer list surfaces:
 *  - BookList         → EmptyState (zero-data + filtered-empty)
 *  - MemoryList       → EmptyState
 *  - PersonList       → EntitySearch (via PersonFilters) + EmptyState
 *  - ChapterList      → EmptyState
 *  - VoiceSampleList  → EntitySearch + EmptyState
 *  - VoiceProfileList → EmptyState
 *  - TimelineList     → EmptyState
 *
 * Behaviour-preserving: with data present the cards still render and the
 * empty state stays out of the tree.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Card components reach for the App Router; a benign stub keeps the
// list shells renderable in isolation.
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/dashboard/os/autobiographer',
  useSearchParams: () => new URLSearchParams(),
}));

import { BookList } from '@/components/agentic-os/autobiographer/book-list';
import { MemoryList } from '@/components/agentic-os/autobiographer/memory-list';
import { PersonList } from '@/components/agentic-os/autobiographer/person-list';
import { ChapterList } from '@/components/agentic-os/autobiographer/chapter-list';
import { VoiceSampleList } from '@/components/agentic-os/autobiographer/voice-sample-list';
import { VoiceProfileList } from '@/components/agentic-os/autobiographer/voice-profile-list';
import { TimelineList } from '@/components/agentic-os/autobiographer/timeline-list';
import type { BookCardData } from '@/components/agentic-os/autobiographer/book-card';
import type { MemoryCardData } from '@/components/agentic-os/autobiographer/memory-card';
import type { PersonCardData } from '@/components/agentic-os/autobiographer/person-card';
import type { ChapterCardData } from '@/components/agentic-os/autobiographer/chapter-card';
import type { VoiceSampleCardData } from '@/components/agentic-os/autobiographer/voice-sample-card';
import type { TimelineMemory } from '@/lib/agentic-os/autobiographer/timeline';
import { bookPhaseProgressDefault } from '@/lib/agentic-os/autobiographer/books';

function mkBook(overrides: Partial<BookCardData> = {}): BookCardData {
  return {
    id: 'book-1',
    title: 'My Life',
    subtitle: null,
    description: null,
    status: 'drafting',
    tags: [],
    coverImageUrl: null,
    targetCompletionDate: null,
    phaseProgress: bookPhaseProgressDefault(),
    ...overrides,
  };
}

function mkMemory(overrides: Partial<MemoryCardData> = {}): MemoryCardData {
  return {
    id: 'mem-1',
    bookId: null,
    title: 'Summer at the lake',
    bodyMarkdown: 'It was warm.',
    whenInLife: null,
    eraDateEstimate: null,
    location: null,
    contentTags: [],
    emotionTags: [],
    isSensitive: false,
    source: 'text',
    photoUrls: [],
    audioUrl: null,
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function mkPerson(overrides: Partial<PersonCardData> = {}): PersonCardData {
  return {
    id: 'p-1',
    canonicalName: 'Jane Doe',
    aliases: [],
    relation: null,
    birthYear: null,
    deathYear: null,
    consentToPublish: 'pending',
    imageUrl: null,
    notes: null,
    ...overrides,
  };
}

function mkChapter(overrides: Partial<ChapterCardData> = {}): ChapterCardData {
  return {
    id: 'ch-1',
    title: 'Chapter One',
    slug: 'chapter-one',
    position: 0,
    status: 'outline',
    summary: null,
    targetWordCount: null,
    latestWordCount: 0,
    revisionCount: 0,
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function mkSample(
  overrides: Partial<VoiceSampleCardData> = {},
): VoiceSampleCardData {
  return {
    id: 's-1',
    title: 'A paragraph',
    bodyText: 'Some of my own writing.',
    wordCount: 5,
    isArchived: false,
    memoryId: null,
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function mkTimelineMemory(
  overrides: Partial<TimelineMemory> = {},
): TimelineMemory {
  return {
    id: 'tm-1',
    bookId: null,
    bookTitle: null,
    title: 'A memory',
    bodyMarkdown: 'It happened.',
    whenInLife: null,
    eraDateEstimate: '1990-06-01',
    location: null,
    emotionTags: [],
    contentTags: [],
    isSensitive: false,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    themes: [],
    arcs: [],
    ...overrides,
  };
}

describe('BookList — primitive adoption', () => {
  it('renders the EmptyState door when there are no books', () => {
    render(<BookList initial={[]} />);
    const empty = screen.getByTestId('empty-state');
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toContain('No books yet');
  });

  it('still renders book cards when there is data', () => {
    render(<BookList initial={[mkBook()]} />);
    expect(screen.getByText('My Life')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });
});

describe('MemoryList — primitive adoption', () => {
  it('renders the EmptyState when there are no memories', () => {
    render(<MemoryList initial={[]} books={[]} />);
    const empty = screen.getByTestId('empty-state');
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toContain('No memories yet');
  });

  it('still renders memory cards when there is data', () => {
    render(<MemoryList initial={[mkMemory()]} books={[]} />);
    expect(screen.getByText('Summer at the lake')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });
});

describe('PersonList — primitive adoption', () => {
  it('renders the EntitySearch search box via PersonFilters', () => {
    render(<PersonList initial={[mkPerson()]} />);
    expect(
      screen.getByRole('searchbox', { name: /search by name or alias/i }),
    ).toBeInTheDocument();
  });

  it('renders the EmptyState when there are no people', () => {
    render(<PersonList initial={[]} />);
    const empty = screen.getByTestId('empty-state');
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toContain('No people yet');
  });
});

describe('ChapterList — primitive adoption', () => {
  it('renders the EmptyState when there are no chapters', () => {
    render(
      <ChapterList initial={[]} books={[]} chapterBookIds={{}} />,
    );
    const empty = screen.getByTestId('empty-state');
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toContain('No chapters yet');
  });

  it('still renders chapter cards when there is data', () => {
    render(
      <ChapterList
        initial={[mkChapter()]}
        books={[]}
        chapterBookIds={{ 'ch-1': 'book-1' }}
      />,
    );
    expect(screen.getByText('Chapter One')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });
});

describe('VoiceSampleList — primitive adoption', () => {
  it('renders the EntitySearch search box', () => {
    render(<VoiceSampleList initial={[mkSample()]} />);
    expect(
      screen.getByRole('searchbox', { name: /search samples/i }),
    ).toBeInTheDocument();
  });

  it('renders the EmptyState when there are no samples', () => {
    render(<VoiceSampleList initial={[]} />);
    const empty = screen.getByTestId('empty-state');
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toContain('No voice samples yet');
  });
});

describe('VoiceProfileList — primitive adoption', () => {
  it('renders the EmptyState when there are no profiles', () => {
    render(<VoiceProfileList initial={[]} />);
    const empty = screen.getByTestId('empty-state');
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toContain('No voice profiles built yet');
  });
});

describe('TimelineList — primitive adoption', () => {
  it('renders the EmptyState when there are no memories on the timeline', () => {
    render(<TimelineList memories={[]} />);
    const empty = screen.getByTestId('empty-state');
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toContain('No memories on the timeline');
  });

  it('still renders timeline cards when there is data', () => {
    render(<TimelineList memories={[mkTimelineMemory()]} />);
    expect(screen.getByText('A memory')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });
});

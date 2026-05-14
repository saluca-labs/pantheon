/**
 * Autobiographer OS Wave C-3b — AutobiographerHubWidgets render tests.
 *
 * Locks the hub dashboard-widget strip: four `DashboardWidget` tiles
 * (books / chapters / memory captures / people) derived purely from
 * props, with the books tile reporting active count, drafting count,
 * archived footer, and a per-status mix.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AutobiographerHubWidgets } from '@/components/agentic-os/autobiographer/autobiographer-hub-widgets';
import type { AutobiographerBook } from '@/lib/agentic-os/autobiographer/books-repo';
import { bookPhaseProgressDefault } from '@/lib/agentic-os/autobiographer/books';

function mkBook(overrides: Partial<AutobiographerBook> = {}): AutobiographerBook {
  return {
    id: 'book-1',
    userId: 'u-1',
    title: 'My Life',
    subtitle: null,
    coverImageUrl: null,
    description: null,
    status: 'drafting',
    targetCompletionDate: null,
    targetAudience: null,
    tags: [],
    phaseProgress: bookPhaseProgressDefault(),
    metadata: {},
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('AutobiographerHubWidgets', () => {
  it('renders the four-widget strip', () => {
    render(
      <AutobiographerHubWidgets
        books={[mkBook()]}
        chapterCount={0}
        memoryCount={0}
        peopleCount={0}
      />,
    );
    expect(
      screen.getByTestId('autobiographer-hub-widgets'),
    ).toBeInTheDocument();
    expect(screen.getByText('Books')).toBeInTheDocument();
    expect(screen.getByText('Chapters')).toBeInTheDocument();
    expect(screen.getByText('Memory captures')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
  });

  it('counts only active books and reports drafting + archived', () => {
    render(
      <AutobiographerHubWidgets
        books={[
          mkBook({ id: 'a', status: 'drafting' }),
          mkBook({ id: 'b', status: 'revising' }),
          mkBook({ id: 'c', status: 'archived' }),
        ]}
        chapterCount={12}
        memoryCount={40}
        peopleCount={7}
      />,
    );
    // 2 active, 1 drafting.
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1 drafting')).toBeInTheDocument();
    expect(screen.getByText('1 archived')).toBeInTheDocument();
    // Aggregate counts surface verbatim.
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('shows the all-active footer when no book is archived', () => {
    render(
      <AutobiographerHubWidgets
        books={[mkBook()]}
        chapterCount={0}
        memoryCount={0}
        peopleCount={0}
      />,
    );
    expect(screen.getByText('All books active')).toBeInTheDocument();
  });

  it('renders a status-mix chip for each active status bucket', () => {
    render(
      <AutobiographerHubWidgets
        books={[
          mkBook({ id: 'a', status: 'drafting' }),
          mkBook({ id: 'b', status: 'revising' }),
        ]}
        chapterCount={0}
        memoryCount={0}
        peopleCount={0}
      />,
    );
    expect(screen.getByText('Drafting')).toBeInTheDocument();
    expect(screen.getByText('Revising')).toBeInTheDocument();
  });
});

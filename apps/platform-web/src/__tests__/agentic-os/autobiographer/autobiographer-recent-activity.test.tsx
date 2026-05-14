/**
 * Autobiographer OS Wave C-3b — AutobiographerRecentActivity render tests.
 *
 * Locks the hub recent-activity feed: merges recently-updated books,
 * memory captures, and chapters into a single `ActivityFeed`, and falls
 * back to the friendly EmptyState when there's nothing to show.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AutobiographerRecentActivity } from '@/components/agentic-os/autobiographer/autobiographer-recent-activity';

describe('AutobiographerRecentActivity', () => {
  it('renders merged book / memory / chapter events', () => {
    render(
      <AutobiographerRecentActivity
        books={[
          { id: 'b-1', title: 'My Life', updatedAt: '2026-05-13T10:00:00.000Z' },
        ]}
        memories={[
          {
            id: 'm-1',
            title: 'Summer at the lake',
            updatedAt: '2026-05-13T11:00:00.000Z',
          },
        ]}
        chapters={[
          {
            id: 'c-1',
            title: 'Chapter One',
            updatedAt: '2026-05-13T12:00:00.000Z',
          },
        ]}
      />,
    );
    expect(
      screen.getByTestId('autobiographer-recent-activity'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
    expect(screen.getByText('My Life')).toBeInTheDocument();
    expect(screen.getByText('Summer at the lake')).toBeInTheDocument();
    expect(screen.getByText('Chapter One')).toBeInTheDocument();
  });

  it('links each event to its detail route', () => {
    render(
      <AutobiographerRecentActivity
        books={[
          { id: 'b-1', title: 'My Life', updatedAt: '2026-05-13T10:00:00.000Z' },
        ]}
        memories={[]}
        chapters={[]}
      />,
    );
    const link = screen.getByTestId('activity-event-book-b-1');
    expect(link).toHaveAttribute(
      'href',
      '/dashboard/os/autobiographer/books/b-1',
    );
  });

  it('renders the friendly EmptyState when there is no activity', () => {
    render(
      <AutobiographerRecentActivity books={[]} memories={[]} chapters={[]} />,
    );
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('Nothing captured yet')).toBeInTheDocument();
  });
});

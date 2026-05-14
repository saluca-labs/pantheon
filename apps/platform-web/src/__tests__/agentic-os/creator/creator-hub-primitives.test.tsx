/**
 * Creator OS Wave C-4a — hub primitive-adoption render tests.
 *
 * Locks the Wave C-4a hub swaps:
 *  - CreatorHubWidgets    → four `DashboardWidget` tiles derived purely
 *                           from props (notes / publishing / books /
 *                           subscribers), with status mixes + footers.
 *  - CreatorRecentActivity → merges recently-updated notes, posts, and
 *                           books into a single `ActivityFeed`, falling
 *                           back to the friendly `EmptyState` when empty.
 *
 * @license MIT — Tiresias Creator OS (internal).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CreatorHubWidgets } from '@/components/agentic-os/creator/creator-hub-widgets';
import { CreatorRecentActivity } from '@/components/agentic-os/creator/creator-recent-activity';
import type { CreatorNote } from '@/lib/agentic-os/creator/notes';
import type { CreatorPost } from '@/lib/agentic-os/creator/posts';
import type { CreatorBook } from '@/lib/agentic-os/creator/books';
import type { CreatorSubscriber } from '@/lib/agentic-os/creator/subscribers';

function mkNote(overrides: Partial<CreatorNote> = {}): CreatorNote {
  return {
    id: 'note-1',
    userId: 'u-1',
    title: 'A note',
    content: {},
    icon: null,
    coverImageUrl: null,
    parentId: null,
    position: 0,
    tags: [],
    isPinned: false,
    archivedAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function mkPost(overrides: Partial<CreatorPost> = {}): CreatorPost {
  return {
    id: 'post-1',
    userId: 'u-1',
    title: 'A post',
    slug: 'a-post',
    excerpt: null,
    content: {},
    coverImageUrl: null,
    status: 'draft',
    scheduledAt: null,
    publishedAt: null,
    tags: [],
    notesMd: null,
    publishAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function mkBook(overrides: Partial<CreatorBook> = {}): CreatorBook {
  return {
    id: 'book-1',
    userId: 'u-1',
    title: 'A book',
    description: null,
    coverImageUrl: null,
    status: 'draft',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function mkSub(overrides: Partial<CreatorSubscriber> = {}): CreatorSubscriber {
  return {
    id: 'sub-1',
    userId: 'u-1',
    email: 'reader@example.com',
    name: null,
    status: 'active',
    source: 'manual',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('CreatorHubWidgets', () => {
  it('renders the four-widget strip', () => {
    render(
      <CreatorHubWidgets
        notes={[mkNote()]}
        pinnedCount={0}
        posts={[]}
        books={[]}
        subscribers={[]}
      />,
    );
    expect(screen.getByTestId('creator-hub-widgets')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('Publishing')).toBeInTheDocument();
    expect(screen.getByText('Books')).toBeInTheDocument();
    expect(screen.getByText('Subscribers')).toBeInTheDocument();
  });

  it('derives publishing counts and a status mix from posts', () => {
    render(
      <CreatorHubWidgets
        notes={[]}
        pinnedCount={0}
        posts={[
          mkPost({ id: 'a', status: 'published' }),
          mkPost({ id: 'b', status: 'scheduled' }),
          mkPost({ id: 'c', status: 'draft' }),
          mkPost({ id: 'd', status: 'idea' }),
        ]}
        books={[]}
        subscribers={[]}
      />,
    );
    // 4 total posts, 1 published.
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('1 published')).toBeInTheDocument();
    // draft + idea collapse into the Drafts bucket (2), scheduled = 1.
    expect(screen.getByText('Drafts')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('1 scheduled')).toBeInTheDocument();
  });

  it('reports active subscribers and pinned notes', () => {
    render(
      <CreatorHubWidgets
        notes={[mkNote(), mkNote({ id: 'n2' })]}
        pinnedCount={2}
        posts={[]}
        books={[]}
        subscribers={[
          mkSub({ id: 's1', status: 'active' }),
          mkSub({ id: 's2', status: 'unsubscribed' }),
        ]}
      />,
    );
    expect(screen.getByText('2 pinned')).toBeInTheDocument();
    expect(screen.getByText('2 on the list')).toBeInTheDocument();
    // One active subscriber.
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});

describe('CreatorRecentActivity', () => {
  it('renders merged note / post / book events', () => {
    render(
      <CreatorRecentActivity
        notes={[mkNote({ id: 'n-1', title: 'My note' })]}
        posts={[mkPost({ id: 'p-1', title: 'My post' })]}
        books={[mkBook({ id: 'b-1', title: 'My book' })]}
      />,
    );
    expect(screen.getByTestId('creator-recent-activity')).toBeInTheDocument();
    expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
    expect(screen.getByText('My note')).toBeInTheDocument();
    expect(screen.getByText('My post')).toBeInTheDocument();
    expect(screen.getByText('My book')).toBeInTheDocument();
  });

  it('links each event to its detail route', () => {
    render(
      <CreatorRecentActivity
        notes={[mkNote({ id: 'n-1', title: 'My note' })]}
        posts={[]}
        books={[]}
      />,
    );
    const link = screen.getByTestId('activity-event-note-n-1');
    expect(link).toHaveAttribute(
      'href',
      '/dashboard/os/creator/notes/n-1',
    );
  });

  it('renders the friendly EmptyState when there is no activity', () => {
    render(<CreatorRecentActivity notes={[]} posts={[]} books={[]} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });
});

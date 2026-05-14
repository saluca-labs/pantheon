/**
 * Creator OS Wave C-4a — list-page primitive-adoption render tests.
 *
 * Locks the Wave C-4a swaps on the Creator list surfaces:
 *  - PostList         → EntitySearch + SavedViews (status presets) + EmptyState
 *  - SubscriberTable  → EntitySearch + BulkActionsBar + EmptyState
 *  - BookList         → EntitySearch + EmptyState
 *  - VideoList        → EntitySearch + EmptyState
 *  - EpisodeList      → EntitySearch + EmptyState (incl. no-podcast door)
 *  - EditorialCalendar→ EmptyState; Wave D-4b adopts CalendarView for the
 *                       calendar display (additive — the bespoke plan-a-post
 *                       form + inline status picker + ISO-week list are kept).
 *
 * Behaviour-preserving: with data present the rows still render and the
 * empty state stays out of the tree.
 *
 * @license MIT — Tiresias Creator OS (internal).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// List components reach for the App Router; a benign stub keeps the
// shells renderable in isolation.
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/dashboard/os/creator',
  useSearchParams: () => new URLSearchParams(),
}));

import { PostList } from '@/components/agentic-os/creator/post-list';
import { SubscriberTable } from '@/components/agentic-os/creator/subscriber-table';
import { BookList } from '@/components/agentic-os/creator/book-list';
import { VideoList } from '@/components/agentic-os/creator/video-list';
import { EpisodeList } from '@/components/agentic-os/creator/episode-list';
import { EditorialCalendar } from '@/components/agentic-os/creator/editorial-calendar';
import type { CreatorPost } from '@/lib/agentic-os/creator/posts';
import type { CreatorSubscriber } from '@/lib/agentic-os/creator/subscribers';
import type { CreatorBook } from '@/lib/agentic-os/creator/books';
import type { CreatorVideoAsset } from '@/lib/agentic-os/creator/video';
import type {
  CreatorEpisode,
  CreatorPodcast,
} from '@/lib/agentic-os/creator/podcast';

function mkPost(overrides: Partial<CreatorPost> = {}): CreatorPost {
  return {
    id: 'post-1',
    userId: 'u-1',
    title: 'My post',
    slug: 'my-post',
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

function mkBook(overrides: Partial<CreatorBook> = {}): CreatorBook {
  return {
    id: 'book-1',
    userId: 'u-1',
    title: 'My book',
    description: null,
    coverImageUrl: null,
    status: 'draft',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function mkVideo(
  overrides: Partial<CreatorVideoAsset> = {},
): CreatorVideoAsset {
  return {
    id: 'video-1',
    userId: 'u-1',
    title: 'My video',
    description: null,
    url: 'https://example.com/v.m3u8',
    thumbnailUrl: null,
    durationSeconds: null,
    status: 'ready',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function mkPodcast(
  overrides: Partial<CreatorPodcast> = {},
): CreatorPodcast {
  return {
    id: 'pod-1',
    userId: 'u-1',
    title: 'My show',
    description: null,
    author: 'Me',
    coverImageUrl: null,
    language: 'en',
    category: null,
    explicit: false,
    websiteUrl: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function mkEpisode(
  overrides: Partial<CreatorEpisode> = {},
): CreatorEpisode {
  return {
    id: 'ep-1',
    podcastId: 'pod-1',
    title: 'Episode One',
    description: null,
    notesMd: null,
    audioFileUrl: null,
    durationSeconds: null,
    fileSizeBytes: null,
    mimeType: null,
    seasonNumber: null,
    episodeNumber: null,
    episodeType: 'full',
    status: 'draft',
    publishedAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('PostList — primitive adoption', () => {
  it('renders the EntitySearch box and SavedViews presets', () => {
    render(<PostList posts={[mkPost()]} />);
    expect(
      screen.getByRole('searchbox', { name: /search posts/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Drafts')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
  });

  it('renders the EmptyState door when there are no posts', () => {
    render(<PostList posts={[]} />);
    const empty = screen.getByTestId('empty-state');
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toContain('No posts yet');
  });

  it('still renders post rows when there is data', () => {
    render(<PostList posts={[mkPost()]} />);
    expect(screen.getByText('My post')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });
});

describe('SubscriberTable — primitive adoption', () => {
  it('renders the EntitySearch box', () => {
    render(<SubscriberTable subscribers={[mkSub()]} />);
    expect(
      screen.getByRole('searchbox', { name: /search by email or name/i }),
    ).toBeInTheDocument();
  });

  it('renders the EmptyState when there are no subscribers', () => {
    render(<SubscriberTable subscribers={[]} />);
    const empty = screen.getByTestId('empty-state');
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toContain('No subscribers yet');
  });

  it('still renders subscriber rows when there is data', () => {
    render(<SubscriberTable subscribers={[mkSub()]} />);
    expect(screen.getByText('reader@example.com')).toBeInTheDocument();
    // BulkActionsBar is contextual — nothing rendered with no selection.
    expect(screen.queryByTestId('bulk-actions-bar')).toBeNull();
  });
});

describe('BookList — primitive adoption', () => {
  it('renders the EmptyState door when there are no books', () => {
    render(<BookList books={[]} />);
    const empty = screen.getByTestId('empty-state');
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toContain('No books yet');
  });

  it('renders the EntitySearch box and cards when there is data', () => {
    render(<BookList books={[mkBook()]} />);
    expect(
      screen.getByRole('searchbox', { name: /search books/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('My book')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });
});

describe('VideoList — primitive adoption', () => {
  it('renders the EmptyState door when there are no videos', () => {
    render(<VideoList videos={[]} />);
    const empty = screen.getByTestId('empty-state');
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toContain('No videos yet');
  });

  it('renders the EntitySearch box and cards when there is data', () => {
    render(<VideoList videos={[mkVideo()]} />);
    expect(
      screen.getByRole('searchbox', { name: /search videos/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('My video')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });
});

describe('EpisodeList — primitive adoption', () => {
  it('renders the no-podcast EmptyState door with a configure CTA', () => {
    render(<EpisodeList episodes={[]} podcast={null} />);
    const empty = screen.getByTestId('empty-state');
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toContain('No podcast configured yet');
    expect(
      screen.getByTestId('empty-state-cta-primary'),
    ).toHaveAttribute('href', '/dashboard/os/creator/podcast/settings');
  });

  it('renders the no-episodes EmptyState when the podcast exists but is empty', () => {
    render(<EpisodeList episodes={[]} podcast={mkPodcast()} />);
    const empty = screen.getByTestId('empty-state');
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toContain('No episodes yet');
  });

  it('renders the EntitySearch box and rows when there is data', () => {
    render(
      <EpisodeList episodes={[mkEpisode()]} podcast={mkPodcast()} />,
    );
    expect(
      screen.getByRole('searchbox', { name: /search episodes/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Episode One')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });
});

describe('EditorialCalendar — CalendarView adoption (Wave D-4b)', () => {
  it('renders the EmptyState when there are no posts on the calendar', () => {
    render(<EditorialCalendar initial={[]} />);
    const empty = screen.getByTestId('empty-state');
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toContain('No posts on the calendar yet');
  });

  it('renders the shared CalendarView grid by default when there is data', () => {
    render(
      <EditorialCalendar
        initial={[
          mkPost({ title: 'Scheduled piece', scheduledAt: '2026-05-13T09:00:00Z' }),
        ]}
      />,
    );
    // CalendarView primitive is mounted and the post chip lands on the grid.
    expect(screen.getByTestId('calendar-view')).toBeInTheDocument();
    expect(screen.getByText('Scheduled piece')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });

  it('keeps the inline status picker on each post chip', () => {
    render(
      <EditorialCalendar
        initial={[
          mkPost({ title: 'Scheduled piece', scheduledAt: '2026-05-13T09:00:00Z' }),
        ]}
      />,
    );
    expect(
      screen.getByLabelText('Status for Scheduled piece'),
    ).toBeInTheDocument();
  });

  it('preserves the bespoke ISO-week list behind the Week list toggle', () => {
    render(
      <EditorialCalendar
        initial={[
          mkPost({ title: 'Scheduled piece', scheduledAt: '2026-05-13T09:00:00Z' }),
        ]}
      />,
    );
    fireEvent.click(screen.getByText('Week list'));
    // The bespoke ISO-week grouping still renders the post.
    expect(screen.getByText('Scheduled piece')).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-view')).toBeNull();
  });

  it('keeps the bespoke Plan a post form', () => {
    render(<EditorialCalendar initial={[]} />);
    expect(screen.getByText('Plan a post')).toBeInTheDocument();
    expect(screen.getByText('Add to calendar')).toBeInTheDocument();
  });
});

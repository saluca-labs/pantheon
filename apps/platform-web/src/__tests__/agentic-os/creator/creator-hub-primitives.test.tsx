/**
 * Creator OS — hub convergence render tests.
 *
 * Wave C-4a converted the Creator hub from a directory into a dashboard
 * (the four `DashboardWidget` stat tiles + the merged `ActivityFeed` of
 * recent work). Wave E-3 (coherence pass) retired the bespoke `CreatorHub`
 * client component for the shared `_shared/DashboardHub` shell: the icon /
 * name / status badge / tagline / description header and the registry
 * feature grid now come from the hub shell, and the dashboard region —
 * quick-create action, the four stat tiles, the recent-activity feed, and
 * the pinned + recent-notes sections — renders through the hub's
 * `dashboardSlot` escape hatch as `CreatorDashboard`.
 *
 * These tests lock that convergence:
 *  - `CreatorDashboard`  → four `DashboardWidget` tiles (built by the pure
 *                          `buildCreatorDashboardWidgets` adapter) with
 *                          status mixes + footers, the merged
 *                          `ActivityFeed` (events from the pure
 *                          `buildCreatorActivityEvents` adapter), the
 *                          pinned-notes grid, and the recent-notes list
 *                          with its quick-create `EmptyState`.
 *  - `DashboardHub`      → renders the shared header + registry feature
 *                          grid + the Creator dashboard slot.
 *
 * Same data, same routes, same counts, same status mixes, same empty
 * states as the bespoke hub — just the shared shell.
 *
 * @license MIT — Tiresias Creator OS (internal).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

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

import { CreatorDashboard } from '@/components/agentic-os/creator/creator-dashboard';
import { DashboardHub } from '@/components/agentic-os/_shared/dashboard-hub';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';
import type { AgenticOsModule } from '@/lib/agentic-os/registry';
import type { CreatorNote } from '@/lib/agentic-os/creator/notes';
import type { CreatorPost } from '@/lib/agentic-os/creator/posts';
import type { CreatorBook } from '@/lib/agentic-os/creator/books';
import type { CreatorSubscriber } from '@/lib/agentic-os/creator/subscribers';

const creatorModule = findAgenticOsModule('creator') as AgenticOsModule;

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

/** Render the Creator dashboard region in isolation. */
function renderCreatorDashboard(overrides: Partial<{
  pinnedNotes: CreatorNote[];
  recentNotes: CreatorNote[];
  posts: CreatorPost[];
  books: CreatorBook[];
  subscribers: CreatorSubscriber[];
}> = {}) {
  return render(
    <CreatorDashboard
      pinnedNotes={overrides.pinnedNotes ?? []}
      recentNotes={overrides.recentNotes ?? []}
      posts={overrides.posts ?? []}
      books={overrides.books ?? []}
      subscribers={overrides.subscribers ?? []}
    />,
  );
}

describe('CreatorDashboard — DashboardWidget strip', () => {
  it('renders the four-widget strip', () => {
    renderCreatorDashboard({ recentNotes: [mkNote()] });
    expect(screen.getByTestId('creator-hub-widgets')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('Publishing')).toBeInTheDocument();
    expect(screen.getByText('Books')).toBeInTheDocument();
    expect(screen.getByText('Subscribers')).toBeInTheDocument();
  });

  it('derives publishing counts and a status mix from posts', () => {
    renderCreatorDashboard({
      posts: [
        mkPost({ id: 'a', status: 'published' }),
        mkPost({ id: 'b', status: 'scheduled' }),
        mkPost({ id: 'c', status: 'draft' }),
        mkPost({ id: 'd', status: 'idea' }),
      ],
    });
    // 4 total posts, 1 published.
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('1 published')).toBeInTheDocument();
    // draft + idea collapse into the Drafts bucket (2), scheduled = 1.
    expect(screen.getByText('Drafts')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('1 scheduled')).toBeInTheDocument();
  });

  it('reports active subscribers and pinned notes', () => {
    renderCreatorDashboard({
      recentNotes: [mkNote(), mkNote({ id: 'n2' })],
      pinnedNotes: [mkNote({ id: 'p1', isPinned: true }), mkNote({ id: 'p2', isPinned: true })],
      subscribers: [
        mkSub({ id: 's1', status: 'active' }),
        mkSub({ id: 's2', status: 'unsubscribed' }),
      ],
    });
    expect(screen.getByText('2 pinned')).toBeInTheDocument();
    expect(screen.getByText('2 on the list')).toBeInTheDocument();
    // One active subscriber.
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('widget tiles link to the same routes as before', () => {
    renderCreatorDashboard();
    expect(screen.getByTestId('creator-hub-notes')).toHaveAttribute(
      'href',
      '/dashboard/os/creator/notes',
    );
    expect(screen.getByTestId('creator-hub-publishing')).toHaveAttribute(
      'href',
      '/dashboard/os/creator/posts',
    );
    expect(screen.getByTestId('creator-hub-books')).toHaveAttribute(
      'href',
      '/dashboard/os/creator/books',
    );
    expect(screen.getByTestId('creator-hub-subscribers')).toHaveAttribute(
      'href',
      '/dashboard/os/creator/subscribers',
    );
  });
});

describe('CreatorDashboard — recent activity feed', () => {
  it('renders merged note / post / book events', () => {
    renderCreatorDashboard({
      recentNotes: [mkNote({ id: 'n-1', title: 'My note' })],
      posts: [mkPost({ id: 'p-1', title: 'My post' })],
      books: [mkBook({ id: 'b-1', title: 'My book' })],
    });
    const feed = within(screen.getByTestId('creator-recent-activity'));
    expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
    // Note title also appears in the recent-notes list, so scope to the feed.
    expect(feed.getByText('My note')).toBeInTheDocument();
    expect(feed.getByText('My post')).toBeInTheDocument();
    expect(feed.getByText('My book')).toBeInTheDocument();
  });

  it('links each event to its detail route', () => {
    renderCreatorDashboard({
      recentNotes: [mkNote({ id: 'n-1', title: 'My note' })],
    });
    const link = screen.getByTestId('activity-event-note-n-1');
    expect(link).toHaveAttribute('href', '/dashboard/os/creator/notes/n-1');
  });

  it('renders the friendly empty state when there is no activity', () => {
    renderCreatorDashboard();
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });
});

describe('CreatorDashboard — pinned + recent notes sections', () => {
  it('renders the pinned-notes grid only when there are pinned notes', () => {
    const { rerender } = renderCreatorDashboard();
    expect(screen.queryByText('Pinned')).toBeNull();
    rerender(
      <CreatorDashboard
        pinnedNotes={[mkNote({ id: 'pin-1', title: 'Pinned note', isPinned: true })]}
        recentNotes={[]}
        posts={[]}
        books={[]}
        subscribers={[]}
      />,
    );
    expect(screen.getByText('Pinned')).toBeInTheDocument();
    expect(screen.getByText('Pinned note')).toBeInTheDocument();
  });

  it('renders the recent-notes list when notes exist', () => {
    renderCreatorDashboard({
      recentNotes: [mkNote({ id: 'r-1', title: 'Recent note' })],
    });
    const section = within(screen.getByTestId('creator-recent-notes'));
    expect(section.getByText('Recent Notes')).toBeInTheDocument();
    // The note also surfaces in the activity feed, so scope to this section.
    const link = section.getByText('Recent note').closest('a');
    expect(link).toHaveAttribute('href', '/dashboard/os/creator/notes/r-1');
  });

  it('renders the quick-create EmptyState when there are no notes', () => {
    renderCreatorDashboard();
    const section = within(screen.getByTestId('creator-recent-notes'));
    expect(section.getByTestId('empty-state')).toBeInTheDocument();
    expect(section.getByText('No notes yet')).toBeInTheDocument();
  });

  it('always offers the quick-create New Note action', () => {
    renderCreatorDashboard({ recentNotes: [mkNote()] });
    expect(
      screen.getByRole('button', { name: /New Note/ }),
    ).toBeInTheDocument();
  });
});

describe('Creator hub — DashboardHub convergence', () => {
  it('renders the shared hub header + registry feature grid + dashboard slot', () => {
    render(
      <DashboardHub
        module={creatorModule}
        dashboardSlot={
          <CreatorDashboard
            pinnedNotes={[]}
            recentNotes={[]}
            posts={[]}
            books={[]}
            subscribers={[]}
          />
        }
      />,
    );
    // Header from the registry module — replaces the bespoke hand-rolled one.
    expect(
      screen.getByRole('heading', { name: 'Creator OS' }),
    ).toBeInTheDocument();
    // The shared shell's back-link to the OS index.
    expect(
      screen.getByRole('link', { name: /All Agentic OS modules/ }),
    ).toBeInTheDocument();
    // The registry feature grid renders every Creator feature. The feature
    // links carry the registry description copy, which disambiguates them
    // from the same-named dashboard widget tiles.
    expect(
      screen.getByRole('link', { name: /Nested workspace with TipTap/ }),
    ).toHaveAttribute('href', '/dashboard/os/creator/notes');
    expect(
      screen.getByRole('link', { name: /Five-mode content coach/ }),
    ).toHaveAttribute('href', '/dashboard/os/creator/coach');
    // The Creator dashboard region renders inside the hub's slot.
    expect(screen.getByTestId('creator-dashboard')).toBeInTheDocument();
    expect(
      screen.getByTestId('dashboard-hub-dashboard-details'),
    ).toBeInTheDocument();
  });
});

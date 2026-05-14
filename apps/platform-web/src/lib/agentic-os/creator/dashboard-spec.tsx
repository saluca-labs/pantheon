/**
 * Creator OS — hub dashboard-spec adapter (Wave E-3, UI Depth Wave).
 *
 * Pure data-shape adapter: turns the Creator repo payloads (notes / posts /
 * books / subscribers) into the declarative pieces the converged hub
 * renders — the four aggregate-stat `DashboardWidget` tiles and the merged
 * recent-activity `ActivityEvent` feed. No DB access, no React component
 * state — the hub server component fetches the data and calls these to
 * assemble the spec; the `CreatorDashboard` slot component renders them.
 *
 * Wave E-3 convergence: the bespoke `CreatorHub` client component
 * (hand-rolled header / back-link / quick-create / pinned + recent
 * sections) is retired for the shared `_shared/DashboardHub` shell. The
 * stat strip + recent-activity feed that lived in `creator-hub-widgets.tsx`
 * and `creator-recent-activity.tsx` are folded into this adapter — same
 * data, same routes, same counts, same status mixes, same empty states.
 * The quick-create button and the pinned-notes / recent-notes sections
 * keep their behavior inside the `CreatorDashboard` slot (rendered through
 * the hub's `dashboardSlot` escape hatch) because they carry client
 * interactivity / extra sections the declarative `dashboard` prop's
 * widgets+chart+activity slots can't express.
 *
 * @license MIT — Tiresias Creator OS (internal).
 */

import { FileText, Pin, Newspaper, BookOpen, Mail } from 'lucide-react';
import type { DashboardWidgetSpec } from '@/components/agentic-os/_shared/dashboard-hub';
import type { ActivityEvent } from '@/components/agentic-os/_shared/views';
import type { CreatorNote } from './notes';
import type { CreatorPost } from './posts';
import type { CreatorBook } from './books';
import type { CreatorSubscriber } from './subscribers';

const CREATOR_SLUG = 'creator' as const;

/**
 * Build the four aggregate-stat `DashboardWidget` tiles for the Creator
 * hub — Notes / Publishing / Books / Subscribers. Mirrors the old
 * `CreatorHubWidgets` component exactly: every count, status mix, footer,
 * and drill-in `href` is preserved; only the wrapping markup moves into
 * the shared hub's widget grid.
 *
 * - `notes`: the recent-notes list the hub already loads (its `.length`
 *   is the headline figure), plus `pinnedCount` for the inline pin badge
 *   and footer copy.
 * - `posts`: total + published headline, with a draft/idea + scheduled
 *   status-mix chip row when either bucket is non-empty.
 * - `books`: the bare total, with a published-count footer.
 * - `subscribers`: active-count headline with an on-the-list footer.
 */
export function buildCreatorDashboardWidgets(args: {
  notes: CreatorNote[];
  pinnedCount: number;
  posts: CreatorPost[];
  books: CreatorBook[];
  subscribers: CreatorSubscriber[];
}): DashboardWidgetSpec[] {
  const { notes, pinnedCount, posts, books, subscribers } = args;

  const publishedPosts = posts.filter((p) => p.status === 'published').length;
  const scheduledPosts = posts.filter((p) => p.status === 'scheduled').length;
  const draftPosts = posts.filter(
    (p) => p.status === 'draft' || p.status === 'idea',
  ).length;

  const activeSubs = subscribers.filter((s) => s.status === 'active').length;
  const publishedBooks = books.filter((b) => b.status === 'published').length;

  return [
    {
      title: 'Notes',
      osSlug: CREATOR_SLUG,
      icon: <FileText className="h-4 w-4" />,
      href: '/dashboard/os/creator/notes',
      'data-testid': 'creator-hub-notes',
      footer:
        pinnedCount > 0 ? `${pinnedCount} pinned` : 'Nothing pinned yet',
      children: (
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums text-text-primary">
            {notes.length}
          </span>
          {pinnedCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
              <Pin className="h-3 w-3" />
              {pinnedCount}
            </span>
          )}
        </div>
      ),
    },
    {
      title: 'Publishing',
      osSlug: CREATOR_SLUG,
      icon: <Newspaper className="h-4 w-4" />,
      href: '/dashboard/os/creator/posts',
      'data-testid': 'creator-hub-publishing',
      footer:
        scheduledPosts > 0
          ? `${scheduledPosts} scheduled`
          : 'No posts queued',
      children: (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-text-primary">
              {posts.length}
            </span>
            <span className="text-xs text-text-secondary">
              {publishedPosts} published
            </span>
          </div>
          {(draftPosts > 0 || scheduledPosts > 0) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {draftPosts > 0 && (
                <span className="rounded bg-surface-3 px-1.5 py-0.5 text-2xs text-text-tertiary">
                  Drafts <span className="tabular-nums">{draftPosts}</span>
                </span>
              )}
              {scheduledPosts > 0 && (
                <span className="rounded bg-surface-3 px-1.5 py-0.5 text-2xs text-text-tertiary">
                  Scheduled{' '}
                  <span className="tabular-nums">{scheduledPosts}</span>
                </span>
              )}
            </div>
          )}
        </>
      ),
    },
    {
      title: 'Books',
      osSlug: CREATOR_SLUG,
      icon: <BookOpen className="h-4 w-4" />,
      href: '/dashboard/os/creator/books',
      'data-testid': 'creator-hub-books',
      footer:
        publishedBooks > 0
          ? `${publishedBooks} published`
          : 'Long-form in progress',
      children: (
        <span className="text-2xl font-semibold tabular-nums text-text-primary">
          {books.length}
        </span>
      ),
    },
    {
      title: 'Subscribers',
      osSlug: CREATOR_SLUG,
      icon: <Mail className="h-4 w-4" />,
      href: '/dashboard/os/creator/subscribers',
      'data-testid': 'creator-hub-subscribers',
      footer:
        subscribers.length > 0
          ? `${subscribers.length} on the list`
          : 'No subscribers yet',
      children: (
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums text-text-primary">
            {activeSubs}
          </span>
          <span className="text-xs text-text-secondary">active</span>
        </div>
      ),
    },
  ];
}

/**
 * Build the merged recent-activity `ActivityEvent[]` for the Creator hub.
 * Mirrors the old `CreatorRecentActivity` component exactly: the recent
 * notes, posts, and books are merged into one chronological feed, each
 * row labelled by kind, tone-coded (published posts go `positive`), and
 * linked to its detail route. `ActivityFeed` sorts + day-groups them.
 */
export function buildCreatorActivityEvents(args: {
  notes: CreatorNote[];
  posts: CreatorPost[];
  books: CreatorBook[];
}): ActivityEvent[] {
  const { notes, posts, books } = args;

  return [
    ...notes.map(
      (n): ActivityEvent => ({
        id: `note-${n.id}`,
        occurredAt: n.updatedAt,
        actor: 'Note',
        summary: n.title || 'Untitled',
        icon: <FileText className="h-3.5 w-3.5" />,
        tone: 'accent',
        href: `/dashboard/os/creator/notes/${n.id}`,
      }),
    ),
    ...posts.map(
      (p): ActivityEvent => ({
        id: `post-${p.id}`,
        occurredAt: p.updatedAt,
        actor: 'Post',
        summary: p.title || 'Untitled',
        icon: <Newspaper className="h-3.5 w-3.5" />,
        tone: p.status === 'published' ? 'positive' : 'neutral',
        href: `/dashboard/os/creator/posts/${p.id}`,
      }),
    ),
    ...books.map(
      (b): ActivityEvent => ({
        id: `book-${b.id}`,
        occurredAt: b.updatedAt,
        actor: 'Book',
        summary: b.title || 'Untitled',
        icon: <BookOpen className="h-3.5 w-3.5" />,
        tone: 'neutral',
        href: `/dashboard/os/creator/books/${b.id}`,
      }),
    ),
  ];
}

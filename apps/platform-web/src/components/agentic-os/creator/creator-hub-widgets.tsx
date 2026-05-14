/**
 * Creator OS — hub dashboard-widget strip.
 *
 * Wave C-4a (UI Depth Wave) — converts the Creator hub from a directory
 * into a dashboard. Renders aggregate-state `DashboardWidget` tiles above
 * the notes section: notes (pinned mix), publishing posts (by status),
 * books, and email subscribers.
 *
 * Pure / presentational: the hub page loads notes + posts + books +
 * subscribers; this component derives every figure from those props with
 * no extra API/DB calls.
 *
 * @license MIT — Tiresias Creator OS (internal).
 */

import { FileText, Pin, Newspaper, BookOpen, Mail } from 'lucide-react';
import { DashboardWidget } from '@/components/agentic-os/_shared/views';
import type { CreatorNote } from '@/lib/agentic-os/creator/notes';
import type { CreatorPost } from '@/lib/agentic-os/creator/posts';
import type { CreatorBook } from '@/lib/agentic-os/creator/books';
import type { CreatorSubscriber } from '@/lib/agentic-os/creator/subscribers';

const CREATOR_SLUG = 'creator' as const;

export interface CreatorHubWidgetsProps {
  notes: CreatorNote[];
  pinnedCount: number;
  posts: CreatorPost[];
  books: CreatorBook[];
  subscribers: CreatorSubscriber[];
}

export function CreatorHubWidgets({
  notes,
  pinnedCount,
  posts,
  books,
  subscribers,
}: CreatorHubWidgetsProps) {
  const publishedPosts = posts.filter((p) => p.status === 'published').length;
  const scheduledPosts = posts.filter((p) => p.status === 'scheduled').length;
  const draftPosts = posts.filter(
    (p) => p.status === 'draft' || p.status === 'idea',
  ).length;

  const activeSubs = subscribers.filter((s) => s.status === 'active').length;
  const publishedBooks = books.filter((b) => b.status === 'published').length;

  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      data-testid="creator-hub-widgets"
    >
      <DashboardWidget
        title="Notes"
        osSlug={CREATOR_SLUG}
        icon={<FileText className="h-4 w-4" />}
        href="/dashboard/os/creator/notes"
        footer={
          pinnedCount > 0 ? `${pinnedCount} pinned` : 'Nothing pinned yet'
        }
      >
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
      </DashboardWidget>

      <DashboardWidget
        title="Publishing"
        osSlug={CREATOR_SLUG}
        icon={<Newspaper className="h-4 w-4" />}
        href="/dashboard/os/creator/posts"
        footer={
          scheduledPosts > 0
            ? `${scheduledPosts} scheduled`
            : 'No posts queued'
        }
      >
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
      </DashboardWidget>

      <DashboardWidget
        title="Books"
        osSlug={CREATOR_SLUG}
        icon={<BookOpen className="h-4 w-4" />}
        href="/dashboard/os/creator/books"
        footer={
          publishedBooks > 0
            ? `${publishedBooks} published`
            : 'Long-form in progress'
        }
      >
        <span className="text-2xl font-semibold tabular-nums text-text-primary">
          {books.length}
        </span>
      </DashboardWidget>

      <DashboardWidget
        title="Subscribers"
        osSlug={CREATOR_SLUG}
        icon={<Mail className="h-4 w-4" />}
        href="/dashboard/os/creator/subscribers"
        footer={
          subscribers.length > 0
            ? `${subscribers.length} on the list`
            : 'No subscribers yet'
        }
      >
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums text-text-primary">
            {activeSubs}
          </span>
          <span className="text-xs text-text-secondary">active</span>
        </div>
      </DashboardWidget>
    </div>
  );
}

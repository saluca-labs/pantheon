/**
 * Creator OS — hub recent-activity feed.
 *
 * Wave C-4a (UI Depth Wave) — wires the shared `ActivityFeed` primitive
 * into the Creator hub. Merges the most recently-updated notes, posts,
 * and books into a single chronological feed so the hub answers "what
 * changed recently?" without leaving the landing page.
 *
 * Pure / presentational: the hub page already loads these rows; this
 * component maps them onto `ActivityEvent`s with no extra API/DB calls.
 *
 * @license MIT — Tiresias Creator OS (internal).
 */

import { FileText, Newspaper, BookOpen } from 'lucide-react';
import { ActivityFeed } from '@/components/agentic-os/_shared/views';
import type { ActivityEvent } from '@/components/agentic-os/_shared/views';
import type { CreatorNote } from '@/lib/agentic-os/creator/notes';
import type { CreatorPost } from '@/lib/agentic-os/creator/posts';
import type { CreatorBook } from '@/lib/agentic-os/creator/books';

export interface CreatorRecentActivityProps {
  notes: CreatorNote[];
  posts: CreatorPost[];
  books: CreatorBook[];
}

export function CreatorRecentActivity({
  notes,
  posts,
  books,
}: CreatorRecentActivityProps) {
  const events: ActivityEvent[] = [
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

  return (
    <div data-testid="creator-recent-activity">
      <ActivityFeed
        events={events}
        grouping="day"
        emptyState={{
          title: 'Nothing here yet',
          description:
            'Write a note, draft a post, or start a book and recent edits will show up here.',
        }}
      />
    </div>
  );
}

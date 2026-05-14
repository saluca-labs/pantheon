/**
 * Autobiographer OS — hub recent-activity feed.
 *
 * Wave C-3b (UI Depth Wave) — wires the shared `ActivityFeed` primitive
 * into the Autobiographer hub. Merges the most recently-updated books,
 * memory captures, and chapters into a single chronological feed so the
 * hub answers "what changed recently?" without leaving the landing page.
 *
 * Pure / presentational: the hub page already loads these rows; this
 * component maps them onto `ActivityEvent`s with no extra API/DB calls.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { BookOpenText, FileText, NotebookPen } from 'lucide-react';
import { ActivityFeed } from '@/components/agentic-os/_shared/views';
import type { ActivityEvent } from '@/components/agentic-os/_shared/views';

export interface RecentActivityBook {
  id: string;
  title: string;
  updatedAt: string;
}

export interface RecentActivityMemory {
  id: string;
  title: string;
  updatedAt: string;
}

export interface RecentActivityChapter {
  id: string;
  title: string;
  updatedAt: string;
}

interface Props {
  books: RecentActivityBook[];
  memories: RecentActivityMemory[];
  chapters: RecentActivityChapter[];
}

export function AutobiographerRecentActivity({
  books,
  memories,
  chapters,
}: Props) {
  const events: ActivityEvent[] = [
    ...books.map(
      (b): ActivityEvent => ({
        id: `book-${b.id}`,
        occurredAt: b.updatedAt,
        actor: 'Book',
        summary: b.title,
        icon: <BookOpenText className="h-3.5 w-3.5" />,
        tone: 'accent',
        href: `/dashboard/os/autobiographer/books/${b.id}`,
      }),
    ),
    ...memories.map(
      (m): ActivityEvent => ({
        id: `memory-${m.id}`,
        occurredAt: m.updatedAt,
        actor: 'Memory',
        summary: m.title,
        icon: <NotebookPen className="h-3.5 w-3.5" />,
        tone: 'neutral',
        href: `/dashboard/os/autobiographer/memories/${m.id}`,
      }),
    ),
    ...chapters.map(
      (c): ActivityEvent => ({
        id: `chapter-${c.id}`,
        occurredAt: c.updatedAt,
        actor: 'Chapter',
        summary: c.title,
        icon: <FileText className="h-3.5 w-3.5" />,
        tone: 'neutral',
        href: `/dashboard/os/autobiographer/chapters/${c.id}`,
      }),
    ),
  ];

  return (
    <div data-testid="autobiographer-recent-activity">
      <ActivityFeed
        events={events}
        grouping="day"
        emptyState={{
          title: 'Nothing captured yet',
          description:
            'Start a book or capture a memory and recent edits will show up here.',
        }}
      />
    </div>
  );
}

/**
 * Autobiographer OS — dashboard region for the hub.
 *
 * Wave E-2 (UI Depth Wave coherence pass): pulls the hub's quick-create
 * action, stat-widget strip, recent-activity feed, and books list into a
 * single composable region so the hub page can render through the shared
 * `DashboardHub` shell like the rest of the suite. The bespoke header,
 * "Workshop" memory/people cards, and "More surfaces" grid are retired —
 * `DashboardHub` supplies the header and the registry-driven features
 * grid in their place.
 *
 * Pure / presentational: every figure is derived from the props the page
 * already loaded.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import Link from 'next/link';
import { DashboardWidget } from '@/components/agentic-os/_shared/views';
import { BookActions } from './book-actions';
import { BookList } from './book-list';
import { AutobiographerHubWidgets } from './autobiographer-hub-widgets';
import {
  AutobiographerRecentActivity,
  type RecentActivityBook,
  type RecentActivityMemory,
  type RecentActivityChapter,
} from './autobiographer-recent-activity';
import type { AutobiographerBook } from '@/lib/agentic-os/autobiographer/books-repo';
import type { AutobiographerMemory } from '@/lib/agentic-os/autobiographer/memories-repo';
import type { AutobiographerPerson } from '@/lib/agentic-os/autobiographer/people-repo';
import type { AutobiographerChapter } from '@/lib/agentic-os/autobiographer/chapters-repo';

interface Props {
  books: AutobiographerBook[];
  recentMemories: AutobiographerMemory[];
  people: AutobiographerPerson[];
  recentChapters: AutobiographerChapter[];
  chapterCount: number;
  memoryCount: number;
  peopleCount: number;
}

export function AutobiographerDashboard({
  books,
  recentMemories,
  people: _people,
  recentChapters,
  chapterCount,
  memoryCount,
  peopleCount,
}: Props) {
  const cards = books.map((b) => ({
    id: b.id,
    title: b.title,
    subtitle: b.subtitle,
    description: b.description,
    status: b.status,
    tags: b.tags,
    coverImageUrl: b.coverImageUrl,
    targetCompletionDate: b.targetCompletionDate,
    phaseProgress: b.phaseProgress,
  }));

  const activityBooks: RecentActivityBook[] = books.slice(0, 5).map((b) => ({
    id: b.id,
    title: b.title,
    updatedAt: b.updatedAt,
  }));
  const activityMemories: RecentActivityMemory[] = recentMemories.map((m) => ({
    id: m.id,
    title: m.title,
    updatedAt: m.updatedAt,
  }));
  const activityChapters: RecentActivityChapter[] = recentChapters.map((c) => ({
    id: c.id,
    title: c.title ?? 'Untitled chapter',
    updatedAt: c.updatedAt,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <BookActions />
      </div>

      <AutobiographerHubWidgets
        books={books}
        chapterCount={chapterCount}
        memoryCount={memoryCount}
        peopleCount={peopleCount}
      />

      <DashboardWidget
        title="Recent activity"
        osSlug="autobiographer"
        footer={
          <Link
            href="/dashboard/os/autobiographer/timeline"
            className="text-text-secondary hover:text-text-primary transition"
          >
            Open the timeline
          </Link>
        }
      >
        <AutobiographerRecentActivity
          books={activityBooks}
          memories={activityMemories}
          chapters={activityChapters}
        />
      </DashboardWidget>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-white">Your books</h2>
          <span className="text-xs text-text-secondary">
            {books.length} {books.length === 1 ? 'book' : 'books'}
          </span>
        </div>
        <BookList initial={cards} />
      </section>
    </div>
  );
}

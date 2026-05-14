/**
 * Autobiographer OS — hub dashboard-widget strip.
 *
 * Wave C-3b (UI Depth Wave) — converts the Autobiographer hub from a
 * directory into a dashboard. Renders aggregate-state `DashboardWidget`
 * tiles above the books grid: book count by status, chapters across the
 * workshop, memory captures, and the people roster.
 *
 * Pure / presentational: the hub page loads books + recent memories +
 * people + the workshop-wide chapter count; this component derives every
 * figure from those props with no extra API/DB calls.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { BookOpenText, FileText, NotebookPen, Users } from 'lucide-react';
import { DashboardWidget } from '@/components/agentic-os/_shared/views';
import type { AutobiographerBook } from '@/lib/agentic-os/autobiographer/books-repo';
import { BOOK_STATUS_LABELS } from '@/lib/agentic-os/autobiographer/books';

interface Props {
  books: AutobiographerBook[];
  chapterCount: number;
  memoryCount: number;
  peopleCount: number;
}

const AUTO_SLUG = 'autobiographer' as const;

export function AutobiographerHubWidgets({
  books,
  chapterCount,
  memoryCount,
  peopleCount,
}: Props) {
  const active = books.filter((b) => b.status !== 'archived');
  const archived = books.length - active.length;
  const drafting = active.filter((b) => b.status === 'drafting').length;

  // Status mix for the books widget body — only non-zero buckets.
  const statusCounts = new Map<string, number>();
  for (const b of active) {
    statusCounts.set(b.status, (statusCounts.get(b.status) ?? 0) + 1);
  }

  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      data-testid="autobiographer-hub-widgets"
    >
      <DashboardWidget
        title="Books"
        osSlug={AUTO_SLUG}
        icon={<BookOpenText className="h-4 w-4" />}
        footer={archived > 0 ? `${archived} archived` : 'All books active'}
      >
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums text-text-primary">
            {active.length}
          </span>
          <span className="text-xs text-text-secondary">
            {drafting} drafting
          </span>
        </div>
        {statusCounts.size > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {Array.from(statusCounts.entries()).map(([status, count]) => (
              <span
                key={status}
                className="rounded bg-surface-3 px-1.5 py-0.5 text-2xs text-text-tertiary"
              >
                {BOOK_STATUS_LABELS[
                  status as keyof typeof BOOK_STATUS_LABELS
                ] ?? status}{' '}
                <span className="tabular-nums">{count}</span>
              </span>
            ))}
          </div>
        )}
      </DashboardWidget>

      <DashboardWidget
        title="Chapters"
        osSlug={AUTO_SLUG}
        icon={<FileText className="h-4 w-4" />}
        href="/dashboard/os/autobiographer/chapters"
        footer="Across every book"
      >
        <span className="text-2xl font-semibold tabular-nums text-text-primary">
          {chapterCount}
        </span>
      </DashboardWidget>

      <DashboardWidget
        title="Memory captures"
        osSlug={AUTO_SLUG}
        icon={<NotebookPen className="h-4 w-4" />}
        href="/dashboard/os/autobiographer/memories"
        footer="Workshop-global atoms"
      >
        <span className="text-2xl font-semibold tabular-nums text-text-primary">
          {memoryCount}
        </span>
      </DashboardWidget>

      <DashboardWidget
        title="People"
        osSlug={AUTO_SLUG}
        icon={<Users className="h-4 w-4" />}
        href="/dashboard/os/autobiographer/people"
        footer="On file across the workshop"
      >
        <span className="text-2xl font-semibold tabular-nums text-text-primary">
          {peopleCount}
        </span>
      </DashboardWidget>
    </div>
  );
}

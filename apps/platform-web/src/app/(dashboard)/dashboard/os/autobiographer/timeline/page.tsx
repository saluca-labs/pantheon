/**
 * Autobiographer OS — Timeline dashboard page.
 *
 * Workshop-wide memory timeline (default scope=workshop). Filters live
 * in the URL query string so the page is bookmarkable. Per-book scope
 * folds the timeline down to a single book.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, History } from 'lucide-react';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { listBooks } from '@/lib/agentic-os/autobiographer/books-repo';
import {
  listAvailableDecades,
  listTimeline,
} from '@/lib/agentic-os/autobiographer/timeline';
import { listThemes } from '@/lib/agentic-os/autobiographer/themes-repo';
import { getAutobiographerPool } from '@/lib/agentic-os/autobiographer/session';
import { TimelineFilters } from '@/components/agentic-os/autobiographer/timeline-filters';
import { TimelineList } from '@/components/agentic-os/autobiographer/timeline-list';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function listDistinctTags(
  userId: string,
  column: 'content_tags' | 'emotion_tags',
): Promise<string[]> {
  const pool = getAutobiographerPool();
  // unnest then DISTINCT — small N so we cap at 200.
  const r = await pool.query(
    `SELECT DISTINCT t
       FROM agos_autobiographer_memories,
            unnest(${column}) AS t
      WHERE user_id = $1
      ORDER BY t ASC
      LIMIT 200`,
    [userId],
  );
  return r.rows.map((row: any) => String(row.t));
}

function pickOne(
  search: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = search[key];
  if (Array.isArray(v)) return v[0];
  return v;
}

function pickMany(
  search: Record<string, string | string[] | undefined>,
  key: string,
): string[] {
  const v = search[key];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') return [v];
  return [];
}

export default async function TimelinePage({ searchParams }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) redirect('/login');
  const search = await searchParams;

  const scope =
    (pickOne(search, 'scope') as 'workshop' | 'book' | undefined) ?? 'workshop';
  const bookIdParam = pickOne(search, 'book_id');
  const themeIds = pickMany(search, 'theme_id');
  const contentTag = pickOne(search, 'content_tag');
  const emotionTag = pickOne(search, 'emotion_tag');
  const decadeRaw = pickOne(search, 'decade');
  const decade =
    decadeRaw && /^[0-9]{4}$/.test(decadeRaw) ? Number(decadeRaw) : undefined;
  const personId = pickOne(search, 'person_id');
  const sensitiveRaw = pickOne(search, 'sensitive');
  const isSensitive =
    sensitiveRaw === 'true'
      ? true
      : sensitiveRaw === 'false'
        ? false
        : undefined;

  const [books, themes, decades, contentTags, emotionTags] = await Promise.all([
    listBooks({ userId: user.userId, limit: 200 }),
    listThemes({ userId: user.userId, limit: 500 }),
    listAvailableDecades(user.userId),
    listDistinctTags(user.userId, 'content_tags'),
    listDistinctTags(user.userId, 'emotion_tags'),
  ]);

  // When scope=book is requested without a book id, leave it dangling
  // (the filter UI presents the book picker; the timeline list shows an
  // empty state).
  const effectiveBookId = scope === 'book' ? bookIdParam ?? null : null;
  const memories =
    scope === 'book' && !effectiveBookId
      ? []
      : await listTimeline({
          userId: user.userId,
          scope,
          bookId: effectiveBookId,
          themeIds: themeIds.length > 0 ? themeIds : undefined,
          contentTag,
          emotionTag,
          decade,
          personId,
          isSensitive,
          limit: 200,
        });

  return (
    <div className="max-w-5xl space-y-5">
      <Link
        href="/dashboard/os/autobiographer"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Autobiographer OS
      </Link>

      <header className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-surface-0 p-2.5 border border-border-subtle">
            <History className="w-6 h-6 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-white mb-1">Timeline</h1>
            <p className="text-sm text-text-secondary leading-relaxed">
              Cross-book memory feed, ordered by year of life. Filter by
              theme, kind, decade, person, or scope to a single book.
              Memories that feed chapters in an arc carry arc-membership
              stripes.
            </p>
          </div>
        </div>
      </header>

      <TimelineFilters
        themes={themes.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          color: t.color,
        }))}
        books={books.map((b) => ({ id: b.id, title: b.title }))}
        decades={decades}
        contentTags={contentTags}
        emotionTags={emotionTags}
      />

      <TimelineList memories={memories} />
    </div>
  );
}

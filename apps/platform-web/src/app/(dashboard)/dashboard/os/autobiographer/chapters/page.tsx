/**
 * Autobiographer OS — workshop-wide chapter index.
 *
 * Phase 4 repurposes this page from the legacy single-chapter editor
 * into a workshop-wide index across every book the user owns. A book
 * filter chip lets the user narrow the list to one book. The legacy
 * single-chapter editor still lives at the same route under
 * `?legacy=1`, but the default surface is now the new chapter index.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, BookOpenText, Info } from 'lucide-react';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { listBooks } from '@/lib/agentic-os/autobiographer/books-repo';
import { listChaptersForUser } from '@/lib/agentic-os/autobiographer/chapters-repo';
import { listRevisionsForChapter } from '@/lib/agentic-os/autobiographer/chapter-revisions-repo';
import { ChapterList } from '@/components/agentic-os/autobiographer/chapter-list';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ book?: string }>;
}

export default async function AutobiographerChaptersPage({
  searchParams,
}: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const bookFilter = params?.book ?? null;

  const [books, chapters] = await Promise.all([
    listBooks({ userId: user.userId, limit: 200 }),
    listChaptersForUser(user.userId, {
      bookId: bookFilter,
      limit: 500,
    }),
  ]);

  const chapterRevisions = await Promise.all(
    chapters.map((c) => listRevisionsForChapter(c.id, user.userId)),
  );

  const chapterCards = chapters.map((c, i) => {
    const revs = chapterRevisions[i] ?? [];
    return {
      id: c.id,
      title: c.title,
      slug: c.slug,
      position: c.position,
      status: c.status,
      summary: c.summary,
      targetWordCount: c.targetWordCount,
      latestWordCount: revs[0]?.wordCount ?? 0,
      revisionCount: revs.length,
      updatedAt: c.updatedAt,
    };
  });

  const chapterBookIds: Record<string, string> = {};
  for (const c of chapters) chapterBookIds[c.id] = c.bookId;

  const bookOptions = books.map((b) => ({ id: b.id, title: b.title }));

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/autobiographer"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Autobiographer OS
      </Link>

      <div className="flex items-center gap-3 mb-1">
        <BookOpenText className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">Chapters</h1>
      </div>
      <p className="text-sm text-text-secondary mb-4">
        Workshop-wide chapter index across every book. Pick a book chip to
        narrow the view, or click a chapter to open its detail page with the
        revision history, prose editor, and source-memory panel.
      </p>

      <div className="rounded-xl border border-border-subtle bg-surface-2 p-3 mb-5 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
        <div className="text-xs text-text-primary leading-relaxed">
          The legacy single-chapter editor is still reachable but no longer
          the default surface. Phase 4 introduces book-scoped chapters with
          versioned revisions and the provenance join back to source
          memories — open a{' '}
          <Link
            href="/dashboard/os/autobiographer"
            className="text-accent hover:underline"
          >
            book
          </Link>{' '}
          to create one.
        </div>
      </div>

      <ChapterList
        initial={chapterCards}
        books={bookOptions}
        initialBookId={bookFilter}
        chapterBookIds={chapterBookIds}
      />
    </div>
  );
}

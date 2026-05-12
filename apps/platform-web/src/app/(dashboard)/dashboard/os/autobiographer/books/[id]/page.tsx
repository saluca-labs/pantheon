/**
 * Autobiographer OS — per-book detail page.
 *
 * Phase 4 redesign: chapters become a first-class section with status
 * pills, word counts, last-updated stamps, and drag-to-reorder.
 *
 * Phase 5 activation: when the book has a primary arc, the chapter
 * list orders by that arc and the position-reorder handles render in
 * disabled state. The Arcs section below the chapter list lets the
 * author create, edit, and re-order arcs (and pick the primary).
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowLeft,
  BookOpenText,
  Calendar,
  FileText,
  Users,
  Tag as TagIcon,
  Download,
  Sparkles,
} from 'lucide-react';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import {
  getBookWithCounts,
  listBooks,
} from '@/lib/agentic-os/autobiographer/books-repo';
import { listMemoriesForBook } from '@/lib/agentic-os/autobiographer/memories-repo';
import {
  listChaptersForBook,
  getBookWordCount,
} from '@/lib/agentic-os/autobiographer/chapters-repo';
import { listRevisionsForChapter } from '@/lib/agentic-os/autobiographer/chapter-revisions-repo';
import {
  getPrimaryArcForBook,
  listArcsForBook,
} from '@/lib/agentic-os/autobiographer/arcs-repo';
import { ArcList } from '@/components/agentic-os/autobiographer/arc-list';
import {
  BOOK_STATUS_LABELS,
  bookPhaseAvg,
} from '@/lib/agentic-os/autobiographer/books';
import { BOOK_STATUS_COLOR } from '@/components/agentic-os/autobiographer/book-card';
import { MemoryList } from '@/components/agentic-os/autobiographer/memory-list';
import { MemoryActions } from '@/components/agentic-os/autobiographer/memory-actions';
import { BookChapterList } from '@/components/agentic-os/autobiographer/book-chapter-list';
import { ChapterEditButton } from '@/components/agentic-os/autobiographer/chapter-edit-button';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function BookDetailPage({ params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const book = await getBookWithCounts(id, user.userId);
  if (!book) notFound();

  // Phase 5 activation: when a primary arc exists, chapter list defers
  // to it for ordering; otherwise we keep the Phase 4 position default.
  const primaryArc = await getPrimaryArcForBook(book.id, user.userId);
  const [memories, allBooks, chapters, totalWords, arcs] = await Promise.all([
    listMemoriesForBook(book.id, user.userId, { limit: 100 }),
    listBooks({ userId: user.userId, limit: 50 }),
    listChaptersForBook({
      userId: user.userId,
      bookId: book.id,
      order: primaryArc ? 'arc' : 'position',
    }),
    getBookWordCount(book.id, user.userId),
    listArcsForBook(book.id, user.userId),
  ]);

  // Per-chapter revision summary (count + latest word_count). Phase 4
  // pulls these in parallel; small N (typically < 30 chapters per book)
  // keeps this cheap. Phase 5 may consolidate into a single SQL.
  const chapterRevisions = await Promise.all(
    chapters.map((c) => listRevisionsForChapter(c.id, user.userId)),
  );

  const chapterCards = chapters.map((c, i) => {
    const revs = chapterRevisions[i] ?? [];
    const latestWordCount = revs[0]?.wordCount ?? 0;
    return {
      id: c.id,
      title: c.title,
      slug: c.slug,
      position: c.position,
      status: c.status,
      summary: c.summary,
      targetWordCount: c.targetWordCount,
      latestWordCount,
      revisionCount: revs.length,
      updatedAt: c.updatedAt,
    };
  });

  const memoryCards = memories.map((m) => ({
    id: m.id,
    bookId: m.bookId,
    title: m.title,
    bodyMarkdown: m.bodyMarkdown,
    whenInLife: m.whenInLife,
    eraDateEstimate: m.eraDateEstimate,
    location: m.location,
    contentTags: m.contentTags,
    emotionTags: m.emotionTags,
    isSensitive: m.isSensitive,
    source: m.source,
    photoUrls: m.photoUrls,
    audioUrl: m.audioUrl,
    updatedAt: m.updatedAt,
  }));

  const bookOptions = allBooks.map((b) => ({ id: b.id, title: b.title }));
  const avg = bookPhaseAvg(book.phaseProgress);

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        href="/dashboard/os/autobiographer"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Autobiographer OS
      </Link>

      {/* Header */}
      <header className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] overflow-hidden">
        <div className="flex">
          {book.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={book.coverImageUrl}
              alt=""
              className="w-40 h-48 object-cover border-r border-[#2a2d3e] shrink-0"
            />
          ) : (
            <div className="w-40 h-48 shrink-0 border-r border-[#2a2d3e] bg-gradient-to-br from-[#4361EE]/15 to-[#1a1d27] flex items-center justify-center">
              <BookOpenText className="w-12 h-12 text-[#4361EE]/50" />
            </div>
          )}
          <div className="flex-1 p-5 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-white">{book.title}</h1>
              <span
                className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${BOOK_STATUS_COLOR[book.status]}`}
              >
                {BOOK_STATUS_LABELS[book.status]}
              </span>
            </div>
            {book.subtitle && (
              <p className="text-sm text-[#cbd5e1]/90">{book.subtitle}</p>
            )}
            {book.description && (
              <p className="text-sm text-[#94a3b8] leading-relaxed">
                {book.description}
              </p>
            )}

            <div className="flex flex-wrap gap-3 text-xs text-[#94a3b8] pt-1">
              {book.targetCompletionDate && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Target {book.targetCompletionDate}
                </span>
              )}
              {book.targetAudience && (
                <span className="inline-flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {book.targetAudience}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" />
                {chapters.length}{' '}
                {chapters.length === 1 ? 'chapter' : 'chapters'} ·{' '}
                {totalWords.toLocaleString()} words
              </span>
              <span className="inline-flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" />
                {book.memoryCount}{' '}
                {book.memoryCount === 1 ? 'memory' : 'memories'}
              </span>
            </div>

            {book.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 pt-1">
                <TagIcon className="w-3 h-3 text-[#64748b]" />
                {book.tags.map((t) => (
                  <span
                    key={t}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-[#0f1117] border border-[#2a2d3e] text-[#cbd5e1]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            <div className="pt-2">
              <div className="flex items-center justify-between text-[10px] text-[#94a3b8] mb-1">
                <span>Overall progress</span>
                <span className="text-white font-medium">{avg}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-[#0f1117] overflow-hidden max-w-md">
                <div
                  className="h-full bg-[#4361EE] transition-all"
                  style={{ width: `${avg}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Chapters */}
      <section id="chapters">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-white">Chapters</h2>
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/os/autobiographer/coach?book_id=${book.id}&mode=chapter_drafter`}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-[#4361EE]/40 bg-[#4361EE]/10 text-[#cbd5e1] hover:bg-[#4361EE]/20 hover:text-white"
              title="Open the AI coach scoped to this book"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#4361EE]" />
              AI Coach
            </Link>
            <a
              href={`/api/tiresias/agentic-os/autobiographer/books/${book.id}/export.pdf`}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-[#2a2d3e] bg-[#0f1117] text-[#cbd5e1] hover:border-[#4361EE]/40"
              title="Export the entire book as a PDF"
            >
              <Download className="w-3.5 h-3.5" />
              Export book PDF
            </a>
            <ChapterEditButton
              initial={{ bookId: book.id }}
              variant="primary"
            />
          </div>
        </div>
        <BookChapterList
          chapters={chapterCards}
          primaryArcIsDefault={Boolean(primaryArc)}
        />
      </section>

      {/* Arcs */}
      <section id="arcs">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-white">Arcs</h2>
          <span className="text-xs text-[#94a3b8]">
            {arcs.length} {arcs.length === 1 ? 'arc' : 'arcs'} ·{' '}
            {primaryArc
              ? `Primary: ${primaryArc.title}`
              : 'No primary arc — chapters order by position'}
          </span>
        </div>
        <ArcList bookId={book.id} arcs={arcs} />
      </section>

      {/* Memories */}
      <section id="memories">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-white">
            Memories attached to this book
          </h2>
          <MemoryActions
            books={bookOptions}
            lockedBookId={book.id}
            label="Capture for this book"
          />
        </div>
        <MemoryList
          initial={memoryCards}
          books={bookOptions}
          scopedBookId={book.id}
        />
      </section>
    </div>
  );
}

/**
 * Autobiographer OS — per-book detail page.
 *
 * Tabs:
 *   - Overview: book meta (cover, status, target date, description)
 *   - Memories: per-book memory list (filtered to this book)
 *   - Chapters: placeholder pointing at the Phase 4 work
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
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
} from 'lucide-react';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import {
  getBookWithCounts,
  listBooks,
} from '@/lib/agentic-os/autobiographer/books-repo';
import { listMemoriesForBook } from '@/lib/agentic-os/autobiographer/memories-repo';
import {
  BOOK_STATUS_LABELS,
  bookPhaseAvg,
} from '@/lib/agentic-os/autobiographer/books';
import { BOOK_STATUS_COLOR } from '@/components/agentic-os/autobiographer/book-card';
import { MemoryList } from '@/components/agentic-os/autobiographer/memory-list';
import { MemoryActions } from '@/components/agentic-os/autobiographer/memory-actions';

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

  const [memories, allBooks] = await Promise.all([
    listMemoriesForBook(book.id, user.userId, { limit: 100 }),
    listBooks({ userId: user.userId, limit: 50 }),
  ]);

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

      {/* Tabs — server-rendered hash-anchored sections (no client tab state) */}
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

      <section id="chapters">
        <h2 className="text-base font-semibold text-white mb-3">Chapters</h2>
        <div className="rounded-xl border border-dashed border-[#2a2d3e] bg-[#1a1d27]/50 p-6">
          <p className="text-sm font-medium text-white mb-1">
            Chapters arrive in Phase 4
          </p>
          <p className="text-xs text-[#94a3b8] leading-relaxed">
            Phase 4 introduces the chapter entity scoped to this book, versioned
            revisions, and the provenance join back to source memories. For
            now, the legacy{' '}
            <Link
              href="/dashboard/os/autobiographer/chapters"
              className="text-[#4361EE] hover:underline"
            >
              chapter editor
            </Link>{' '}
            stays available as a single-chapter workspace until that surface
            ships.
          </p>
        </div>
      </section>
    </div>
  );
}

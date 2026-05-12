/**
 * Autobiographer OS — chapter detail page.
 *
 * Three-column layout per Phase 4 spec:
 *   - Left:   revision history rail (versions + author chips +
 *             "New revision" button)
 *   - Center: active-revision body editor with live word count and
 *             a save action that PATCHes the revision
 *   - Right:  source memories with paragraph-citation count + add /
 *             unlink affordances
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Download, FileText } from 'lucide-react';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { getBook } from '@/lib/agentic-os/autobiographer/books-repo';
import { getChapter } from '@/lib/agentic-os/autobiographer/chapters-repo';
import { listRevisionsForChapter } from '@/lib/agentic-os/autobiographer/chapter-revisions-repo';
import { listSourcesForChapter } from '@/lib/agentic-os/autobiographer/chapter-sources-repo';
import { ChapterStatusPill } from '@/components/agentic-os/autobiographer/chapter-status-pill';
import { ChapterEditButton } from '@/components/agentic-os/autobiographer/chapter-edit-button';
import { ChapterDetailView } from '@/components/agentic-os/autobiographer/chapter-detail-view';
import { ChapterThemesSection } from '@/components/agentic-os/autobiographer/chapter-themes-section';
import { LockChapterButton } from '@/components/agentic-os/autobiographer/lock-chapter-button';
import { SensitiveKindsBadges } from '@/components/agentic-os/autobiographer/sensitive-kinds-badges';
import { SensitiveKindsPicker } from '@/components/agentic-os/autobiographer/sensitive-kinds-picker';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ChapterDetailPage({ params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const chapter = await getChapter(id, user.userId);
  if (!chapter) notFound();
  const book = await getBook(chapter.bookId, user.userId);
  if (!book) notFound();

  const [revisions, sources] = await Promise.all([
    listRevisionsForChapter(id, user.userId),
    listSourcesForChapter(id, user.userId),
  ]);

  const positionLabel = `Ch ${String(chapter.position + 1).padStart(2, '0')}`;
  const latestRevision = revisions[0];
  const latestSensitiveKinds = latestRevision?.sensitiveKinds ?? [];

  return (
    <div className="max-w-7xl space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link
          href={`/dashboard/os/autobiographer/books/${book.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {book.title}
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          <LockChapterButton
            chapterId={chapter.id}
            bookId={book.id}
            locked={chapter.status === 'locked'}
          />
          <a
            href={`/api/tiresias/agentic-os/autobiographer/chapters/${chapter.id}/export.pdf`}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-[#2a2d3e] bg-[#0f1117] text-[#cbd5e1] hover:border-[#4361EE]/40"
            title="Export this chapter as a PDF"
          >
            <Download className="w-3.5 h-3.5" />
            Export chapter PDF
          </a>
          <ChapterEditButton
            initial={{
              id: chapter.id,
              bookId: book.id,
              title: chapter.title,
              slug: chapter.slug,
              status: chapter.status,
              summary: chapter.summary,
              targetWordCount: chapter.targetWordCount,
            }}
            label="Edit chapter"
          />
        </div>
      </div>

      <header className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 space-y-2">
        <div className="flex items-center gap-2 text-xs text-[#94a3b8]">
          <span className="font-mono">{positionLabel}</span>
          {chapter.slug ? (
            <span className="font-mono text-[#64748b]">· {chapter.slug}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-semibold text-white">
            {chapter.title ?? 'Untitled chapter'}
          </h1>
          <ChapterStatusPill status={chapter.status} />
        </div>
        {chapter.summary ? (
          <p className="text-sm text-[#cbd5e1] leading-relaxed">
            {chapter.summary}
          </p>
        ) : null}
        <div className="flex items-center gap-3 text-xs text-[#94a3b8]">
          <span className="inline-flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" />
            {revisions.length}{' '}
            {revisions.length === 1 ? 'revision' : 'revisions'}
          </span>
          <span>
            {sources.length}{' '}
            {sources.length === 1 ? 'source memory' : 'source memories'}
          </span>
          {chapter.targetWordCount ? (
            <span>
              Target {chapter.targetWordCount.toLocaleString()} words
            </span>
          ) : null}
        </div>
      </header>

      {latestSensitiveKinds.length > 0 && (
        <SensitiveKindsBadges kinds={latestSensitiveKinds} variant="expanded" />
      )}

      {latestRevision && (
        <SensitiveKindsPicker
          endpoint={`/api/tiresias/agentic-os/autobiographer/chapters/${chapter.id}/revisions/${latestRevision.id}`}
          initial={latestSensitiveKinds}
          label="Sensitive content on the latest revision"
        />
      )}

      <ChapterDetailView
        chapterId={chapter.id}
        revisions={revisions.map((r) => ({
          id: r.id,
          version: r.version,
          author: r.author,
          bodyText: r.bodyText,
          summary: r.summary,
          wordCount: r.wordCount,
          createdAt: r.createdAt,
        }))}
        sources={sources.map((s) => ({
          id: s.id,
          memoryId: s.memoryId,
          memoryTitle: s.memoryTitle,
          memoryWhenInLife: s.memoryWhenInLife,
          weight: s.weight,
          paragraphCitationCount: s.paragraphCitationCount,
          notes: s.notes,
        }))}
      />

      <ChapterThemesSection chapterId={chapter.id} />
    </div>
  );
}

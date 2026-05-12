/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/chapters/[id]/export.pdf
 *
 * GET — render the chapter's latest revision (or `?revision=N`) as a
 *       PDF. Content-Type `application/pdf`, filename
 *       `<book-slug>-ch<NN>-<chapter-slug>-<YYYY-MM-DD>.pdf`. Returns
 *       400 when the chapter has no revisions.
 *
 * Audit row carries the chapterId + bookId. Bridge PII filter is a
 * Phase 6 deliverable; revision body_text is rendered as-is per the
 * Phase 3 precedent for workshop-global text.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import * as React from 'react';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { getBook } from '@/lib/agentic-os/autobiographer/books-repo';
import { getChapter } from '@/lib/agentic-os/autobiographer/chapters-repo';
import {
  getLatestRevisionForChapter,
  getRevisionByVersion,
} from '@/lib/agentic-os/autobiographer/chapter-revisions-repo';
import { citationsMemoryIds } from '@/lib/agentic-os/autobiographer/chapter-revisions';
import { getMemoriesByIds } from '@/lib/agentic-os/autobiographer/memories-repo';
import { renderPdfToBuffer } from '@/lib/agentic-os/_shared/pdf/render';
import { ChapterExportPdf } from '@/lib/agentic-os/autobiographer/pdf/chapter-export';
import { chapterSlug } from '@/lib/agentic-os/autobiographer/chapters';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

function bookSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'book'
  );
}

export async function GET(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: chapterId } = await params;
  const chapter = await getChapter(chapterId, user.userId);
  if (!chapter) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const book = await getBook(chapter.bookId, user.userId);
  if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const url = new URL(request.url);
  const versionParam = url.searchParams.get('revision');
  const requestedVersion = versionParam ? Number(versionParam) : null;
  if (versionParam !== null && (!Number.isFinite(requestedVersion!) || (requestedVersion ?? 0) < 1)) {
    return NextResponse.json({ error: 'Invalid revision' }, { status: 400 });
  }

  const revision = requestedVersion
    ? await getRevisionByVersion(chapterId, requestedVersion, user.userId)
    : await getLatestRevisionForChapter(chapterId, user.userId);
  if (!revision) {
    return NextResponse.json(
      {
        error: requestedVersion
          ? `No revision v${requestedVersion} found for this chapter.`
          : 'This chapter has no revisions yet — nothing to export.',
      },
      { status: requestedVersion ? 404 : 400 },
    );
  }

  // Resolve every cited memory id in one shot.
  const memoryIds = citationsMemoryIds(revision.citations);
  const memories = await getMemoriesByIds(memoryIds, user.userId);

  const buffer = await renderPdfToBuffer(
    React.createElement(ChapterExportPdf, {
      book: { title: book.title, subtitle: book.subtitle },
      chapter: {
        title: chapter.title,
        slug: chapter.slug,
        position: chapter.position,
        status: chapter.status,
        summary: chapter.summary,
      },
      revision: {
        version: revision.version,
        author: revision.author,
        bodyText: revision.bodyText,
        wordCount: revision.wordCount,
        citations: revision.citations,
        createdAt: revision.createdAt,
      },
      memories: memories.map((m) => ({
        id: m.id,
        title: m.title,
        whenInLife: m.whenInLife,
      })),
    }),
  );

  const stamp = new Date().toISOString().slice(0, 10);
  const chSlug =
    chapter.slug ??
    (chapterSlug(chapter.title ?? '') || `ch-${chapter.position + 1}`);
  const positionStr = String(chapter.position + 1).padStart(2, '0');
  const filename = `${bookSlug(book.title)}-ch${positionStr}-${chSlug}-${stamp}.pdf`;

  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.chapter.exported_pdf',
    payload: {
      chapterId,
      bookId: book.id,
      revisionId: revision.id,
      version: revision.version,
      wordCount: revision.wordCount,
      citedMemories: memoryIds.length,
    },
    projectId: book.id,
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

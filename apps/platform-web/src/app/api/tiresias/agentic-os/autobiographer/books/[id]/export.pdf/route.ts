/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/books/[id]/export.pdf
 *
 * GET — render the entire book as a single PDF. Chapters appear in
 *       `position` order. Each chapter's latest revision is rendered
 *       with paragraph-level footnotes; the final page is a provenance
 *       appendix listing every cited memory with the chapters that
 *       cite it.
 *
 * Phase 5 seam: when arcs ship, this route will swap the chapter
 * ordering loader from `listChaptersForBook({order:'position'})` to an
 * arc-aware iterator. The route signature stays the same. The TODO
 * below marks the seam.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import * as React from 'react';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { getBook } from '@/lib/agentic-os/autobiographer/books-repo';
import { listChaptersForBook } from '@/lib/agentic-os/autobiographer/chapters-repo';
import { getLatestRevisionForChapter } from '@/lib/agentic-os/autobiographer/chapter-revisions-repo';
import { citationsMemoryIds } from '@/lib/agentic-os/autobiographer/chapter-revisions';
import { getMemoriesByIds } from '@/lib/agentic-os/autobiographer/memories-repo';
import { listProvenanceForBook } from '@/lib/agentic-os/autobiographer/chapter-sources-repo';
import { renderPdfToBuffer } from '@/lib/agentic-os/_shared/pdf/render';
import { BookExportPdf } from '@/lib/agentic-os/autobiographer/pdf/book-export';
import { BOOK_STATUS_LABELS } from '@/lib/agentic-os/autobiographer/books';
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

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: bookId } = await params;
  const book = await getBook(bookId, user.userId);
  if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // TODO(Phase 5): swap this loader to an arc-aware iterator when arcs
  // land. The chapter list shape returned here is consumed verbatim by
  // BookExportPdf, so Phase 5 can re-implement ordering without
  // touching the template.
  const chapters = await listChaptersForBook({
    userId: user.userId,
    bookId,
  });

  // Resolve every latest revision in parallel.
  const latestRevs = await Promise.all(
    chapters.map((c) => getLatestRevisionForChapter(c.id, user.userId)),
  );

  // Collect every cited memory across the book.
  const allCitedIds = new Set<string>();
  for (const r of latestRevs) {
    if (!r) continue;
    for (const id of citationsMemoryIds(r.citations)) allCitedIds.add(id);
  }
  const memories = await getMemoriesByIds(Array.from(allCitedIds), user.userId);
  const provenance = await listProvenanceForBook(bookId, user.userId);

  // Build PDF input shape.
  const chapterRows = chapters.map((c, i) => {
    const latest = latestRevs[i];
    return {
      id: c.id,
      title: c.title,
      slug: c.slug,
      position: c.position,
      status: c.status,
      summary: c.summary,
      latest: latest
        ? {
            version: latest.version,
            author: latest.author,
            bodyText: latest.bodyText,
            wordCount: latest.wordCount,
            citations: latest.citations,
          }
        : null,
    };
  });

  const buffer = await renderPdfToBuffer(
    React.createElement(BookExportPdf, {
      book: {
        title: book.title,
        subtitle: book.subtitle,
        description: book.description,
        status: BOOK_STATUS_LABELS[book.status] ?? book.status,
        targetCompletionDate: book.targetCompletionDate,
        targetAudience: book.targetAudience,
      },
      authorName: null,
      chapters: chapterRows,
      memories: memories.map((m) => ({
        id: m.id,
        title: m.title,
        whenInLife: m.whenInLife,
      })),
      provenance,
    }),
  );

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${bookSlug(book.title)}-${stamp}.pdf`;

  const totalWords = chapterRows.reduce(
    (acc, c) => acc + (c.latest?.wordCount ?? 0),
    0,
  );

  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.book.exported_pdf',
    payload: {
      bookId,
      chapters: chapters.length,
      revisionsRendered: latestRevs.filter(Boolean).length,
      citedMemories: allCitedIds.size,
      wordCount: totalWords,
    },
    projectId: bookId,
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

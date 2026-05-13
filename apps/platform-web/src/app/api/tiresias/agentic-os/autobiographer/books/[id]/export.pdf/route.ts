/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/books/[id]/export.pdf
 *
 * GET — render the entire book as a single PDF. Chapters appear in
 *       `position` order. Each chapter's latest revision is rendered
 *       with paragraph-level footnotes; the final page is a provenance
 *       appendix listing every cited memory with the chapters that
 *       cite it.
 *
 * Phase 5 activation: chapter ordering prefers the book's primary arc
 * when one exists. Without a primary arc, ordering falls back to
 * `position` — the same ordering Phase 4 used. The loader now calls
 * `listChaptersForBook({order:'arc'})` which encapsulates both
 * branches; the route signature is unchanged.
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
import { respondWithPdf } from '@/lib/agentic-os/_shared/blob-store';
import { BookExportPdf } from '@/lib/agentic-os/autobiographer/pdf/book-export';
import { BOOK_STATUS_LABELS } from '@/lib/agentic-os/autobiographer/books';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';
import {
  listPseudonymsForBook,
  markPseudonymsApplied,
} from '@/lib/agentic-os/autobiographer/pseudonyms-repo';
import {
  applyPseudonymRedaction,
  mergeAppliedIds,
  redactTitle,
  type PseudonymInput,
} from '@/lib/agentic-os/autobiographer/redaction';

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

  // Phase 5 activated: arc-aware ordering. When the book has a
  // is_primary=true arc, chapters render in arc order with any chapters
  // not in the arc appended in their book-position order. When no
  // primary arc exists, the function falls back to position ordering
  // (same as Phase 4). BookExportPdf consumes the resulting chapter
  // list verbatim; the template was not touched.
  const chapters = await listChaptersForBook({
    userId: user.userId,
    bookId,
    order: 'arc',
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

  // Phase 6 — load pseudonyms and run redaction across every chapter
  // body, every chapter title, every memory title (footnotes), every
  // provenance row. Applied ids accumulate across the whole book so a
  // single UPDATE flips `applied = true` post-render.
  const pseudonymRows = await listPseudonymsForBook(bookId, user.userId);
  const pseudonymInputs: PseudonymInput[] = pseudonymRows.map((p) => ({
    id: p.id,
    canonicalName: p.personCanonicalName,
    aliases: p.personAliases,
    pseudonym: p.pseudonym,
  }));

  const perChapterAppliedSets: Set<string>[] = [];

  // Build PDF input shape — redact chapter title + body before render.
  const chapterRows = chapters.map((c, i) => {
    const latest = latestRevs[i];
    let bodyText = latest?.bodyText ?? '';
    if (latest) {
      const result = applyPseudonymRedaction(bodyText, pseudonymInputs);
      bodyText = result.text;
      perChapterAppliedSets.push(result.appliedPseudonymIds);
    }
    return {
      id: c.id,
      title: c.title ? redactTitle(c.title, pseudonymInputs) : c.title,
      slug: c.slug,
      position: c.position,
      status: c.status,
      summary: c.summary
        ? redactTitle(c.summary, pseudonymInputs)
        : c.summary,
      latest: latest
        ? {
            version: latest.version,
            author: latest.author,
            bodyText,
            wordCount: latest.wordCount,
            citations: latest.citations,
          }
        : null,
    };
  });

  // Redact memory titles (footnotes) and provenance rows.
  const redactedMemories = memories.map((m) => {
    const result = applyPseudonymRedaction(m.title ?? '', pseudonymInputs);
    perChapterAppliedSets.push(result.appliedPseudonymIds);
    return { ...m, title: result.text };
  });
  const redactedProvenance = provenance.map((p) => {
    const titleResult = applyPseudonymRedaction(p.memoryTitle, pseudonymInputs);
    perChapterAppliedSets.push(titleResult.appliedPseudonymIds);
    return {
      ...p,
      memoryTitle: titleResult.text,
      chapterReferences: p.chapterReferences.map((c) => ({
        ...c,
        chapterTitle: c.chapterTitle
          ? redactTitle(c.chapterTitle, pseudonymInputs)
          : c.chapterTitle,
      })),
    };
  });

  const appliedIds = mergeAppliedIds(...perChapterAppliedSets);

  const buffer = await renderPdfToBuffer(
    React.createElement(BookExportPdf, {
      book: {
        title: redactTitle(book.title, pseudonymInputs),
        subtitle: book.subtitle
          ? redactTitle(book.subtitle, pseudonymInputs)
          : book.subtitle,
        description: book.description
          ? redactTitle(book.description, pseudonymInputs)
          : book.description,
        status: BOOK_STATUS_LABELS[book.status] ?? book.status,
        targetCompletionDate: book.targetCompletionDate,
        targetAudience: book.targetAudience,
      },
      authorName: null,
      chapters: chapterRows,
      memories: redactedMemories.map((m) => ({
        id: m.id,
        title: m.title,
        whenInLife: m.whenInLife,
      })),
      provenance: redactedProvenance,
    }),
  );

  if (appliedIds.size > 0) {
    await markPseudonymsApplied(Array.from(appliedIds), user.userId);
  }

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
      pseudonymsApplied: appliedIds.size,
    },
    projectId: bookId,
  });

  return respondWithPdf({
    buffer,
    slug: 'autobiographer',
    tenantId: user.userId,
    key: `books/${bookId}/book-${stamp}.pdf`,
    filename,
    disposition: 'attachment',
  });
}

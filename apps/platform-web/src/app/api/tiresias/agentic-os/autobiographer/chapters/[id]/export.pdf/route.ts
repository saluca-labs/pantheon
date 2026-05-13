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
import { respondWithPdf } from '@/lib/agentic-os/_shared/blob-store';
import { ChapterExportPdf } from '@/lib/agentic-os/autobiographer/pdf/chapter-export';
import { chapterSlug } from '@/lib/agentic-os/autobiographer/chapters';
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

  // Phase 6 — apply the book's pseudonym map to the revision body and
  // to every cited memory title before render. The substitution is
  // word-boundary, case-preserving on the first letter, and applied
  // left-to-right per the redaction algorithm spec.
  const pseudonymRows = await listPseudonymsForBook(book.id, user.userId);
  const pseudonymInputs: PseudonymInput[] = pseudonymRows.map((p) => ({
    id: p.id,
    canonicalName: p.personCanonicalName,
    aliases: p.personAliases,
    pseudonym: p.pseudonym,
  }));
  const bodyRedaction = applyPseudonymRedaction(
    revision.bodyText,
    pseudonymInputs,
  );
  const redactedMemories = memories.map((m) => {
    const result = applyPseudonymRedaction(m.title ?? '', pseudonymInputs);
    return {
      ...m,
      title: result.text,
      // Capture applied ids for the post-render UPDATE.
      _appliedIds: result.appliedPseudonymIds,
    };
  });
  const appliedIds = mergeAppliedIds(
    bodyRedaction.appliedPseudonymIds,
    ...redactedMemories.map((m) => m._appliedIds),
  );

  const buffer = await renderPdfToBuffer(
    React.createElement(ChapterExportPdf, {
      book: {
        title: redactTitle(book.title, pseudonymInputs),
        subtitle: book.subtitle ? redactTitle(book.subtitle, pseudonymInputs) : null,
      },
      chapter: {
        title: chapter.title
          ? redactTitle(chapter.title, pseudonymInputs)
          : chapter.title,
        slug: chapter.slug,
        position: chapter.position,
        status: chapter.status,
        summary: chapter.summary
          ? redactTitle(chapter.summary, pseudonymInputs)
          : chapter.summary,
      },
      revision: {
        version: revision.version,
        author: revision.author,
        bodyText: bodyRedaction.text,
        wordCount: revision.wordCount,
        citations: revision.citations,
        createdAt: revision.createdAt,
      },
      memories: redactedMemories.map((m) => ({
        id: m.id,
        title: m.title,
        whenInLife: m.whenInLife,
      })),
    }),
  );

  // Post-render: flip `applied = true` on every pseudonym that fired.
  if (appliedIds.size > 0) {
    await markPseudonymsApplied(Array.from(appliedIds), user.userId);
  }

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
      pseudonymsApplied: appliedIds.size,
    },
    projectId: book.id,
  });

  return respondWithPdf({
    buffer,
    slug: 'autobiographer',
    tenantId: user.userId,
    key: `chapters/${chapterId}/v${revision.version}.pdf`,
    filename,
    disposition: 'attachment',
  });
}

/**
 * Business OS Phase 6 — document PDF export route.
 *
 * GET /api/tiresias/agentic-os/business/documents/[id]/export.pdf
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import 'server-only';
import React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { getDocument } from '@/lib/agentic-os/business/documents-repo';
import { listSignatures } from '@/lib/agentic-os/business/signatures-repo';
import { renderPdfToBuffer } from '@/lib/agentic-os/_shared/pdf/render';
import { respondWithPdf } from '@/lib/agentic-os/_shared/blob-store';
import { SignedDocumentPdf } from '@/lib/agentic-os/business/pdf/signed-document';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const document = await getDocument(id, user.userId);
  if (!document) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const signatures = await listSignatures(id, user.userId);

  const pdfBuffer = await renderPdfToBuffer(
    React.createElement(SignedDocumentPdf, {
      document,
      signatures: signatures ?? [],
    }),
  );

  await recordAudit({
    actorId: user.userId,
    action: 'business.document.export.pdf',
    payload: { documentId: id },
  });

  const safeTitle = document.title.slice(0, 50).replace(/[^a-zA-Z0-9]/g, '_');
  return respondWithPdf({
    buffer: pdfBuffer,
    slug: 'business',
    tenantId: user.userId,
    key: `documents/${id}/document.pdf`,
    filename: `document-${safeTitle}.pdf`,
    disposition: 'inline',
  });
}

/**
 * Business OS Phase 5 — P&L PDF export route.
 *
 * GET /api/tiresias/agentic-os/business/pnl/export.pdf
 *
 * @license MIT — Tiresias Business OS Phase 5 (internal).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { computePnlSummary } from '@/lib/agentic-os/business/pnl-snapshots-repo';
import { PnlSummaryDocument } from '@/lib/agentic-os/business/pdf/pnl-summary';
import { renderPdfToBuffer } from '@/lib/agentic-os/_shared/pdf/render';
import { respondWithPdf } from '@/lib/agentic-os/_shared/blob-store';

export async function GET(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const periodStart = url.searchParams.get('period_start');
  const periodEnd = url.searchParams.get('period_end');

  if (!periodStart || !periodEnd) {
    return NextResponse.json(
      { error: 'period_start and period_end are required' },
      { status: 400 },
    );
  }

  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json(
      { error: 'Invalid date format' },
      { status: 400 },
    );
  }

  const result = await computePnlSummary(user.userId, periodStart, periodEnd, 'category');

  const buf = await renderPdfToBuffer(
    React.createElement(PnlSummaryDocument, {
      summary: result.summary,
      groups: result.groups,
      periodStart,
      periodEnd,
    }),
  );

  await recordAudit({
    actorId: user.userId,
    action: 'business.pnl.export.pdf',
    payload: { periodStart, periodEnd },
  });

  const filename = `pnl-${periodStart}_to_${periodEnd}.pdf`;
  return respondWithPdf({
    buffer: buf,
    slug: 'business',
    tenantId: user.userId,
    key: `pnl/${filename}`,
    filename,
    disposition: 'inline',
  });
}

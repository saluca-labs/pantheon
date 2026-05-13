/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/exports/exposure-report.pdf
 *
 * GET — render the user's exposure report as a PDF. Uses the OS-agnostic
 * `_shared/pdf/render` primitive established in Filmmaker Phase 6.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import * as React from 'react';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  getCyberTrendsData,
  listExposures,
  recordAudit,
} from '@/lib/agentic-os/cyber/repo';
import { renderPdfToBuffer } from '@/lib/agentic-os/_shared/pdf/render';
import { respondWithPdf } from '@/lib/agentic-os/_shared/blob-store';
import { ExposureReportPdf } from '@/lib/agentic-os/cyber/pdf/exposure-report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [exposures, trends] = await Promise.all([
    listExposures({ ownerId: user.userId, limit: 1000 }),
    getCyberTrendsData({ ownerId: user.userId }),
  ]);

  const buffer = await renderPdfToBuffer(
    React.createElement(ExposureReportPdf, {
      user: {
        email: user.email ?? null,
        displayName: user.displayName ?? null,
      },
      exposures,
      stats: {
        exposuresMttrDays: trends.exposuresMttrDays,
        exposuresOpen: trends.exposuresOpen,
        exposuresClosedLast30d: trends.exposuresClosedLast30d,
        openVulnsBySeverity: trends.openVulnsBySeverity,
      },
    }),
  );

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.exposure.export_pdf',
    payload: { count: exposures.length },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return respondWithPdf({
    buffer,
    slug: 'cyber',
    tenantId: user.userId,
    key: `exposure-reports/${stamp}.pdf`,
    filename: `exposure-report-${stamp}.pdf`,
    disposition: 'attachment',
  });
}

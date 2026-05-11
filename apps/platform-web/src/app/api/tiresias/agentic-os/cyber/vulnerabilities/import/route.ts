/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/vulnerabilities/import
 *
 * POST — body: { format: 'trivy'|'openvas', report: any }
 * Parses + bulk-upserts. Returns counts + per-row parse errors.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  bulkUpsertVulnerabilities,
  recordAudit,
} from '@/lib/agentic-os/cyber/repo';
import {
  parseOpenvasReport,
  parseTrivyReport,
} from '@/lib/agentic-os/cyber/vuln-importer';

const ImportBody = z.object({
  format: z.enum(['trivy', 'openvas']),
  report: z.unknown(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = ImportBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const parser = parsed.data.format === 'trivy' ? parseTrivyReport : parseOpenvasReport;
  const result = parser(parsed.data.report);

  const counts = await bulkUpsertVulnerabilities({
    ownerId: user.userId,
    vulnerabilities: result.vulnerabilities,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.vulnerability.imported',
    payload: {
      format: parsed.data.format,
      parsed: result.vulnerabilities.length,
      errors: result.errors.length,
      inserted: counts.inserted,
      updated: counts.updated,
      skipped: counts.skipped,
    },
  });

  return NextResponse.json({
    parsed: result.vulnerabilities.length,
    inserted: counts.inserted,
    updated: counts.updated,
    skipped: counts.skipped,
    errors: result.errors,
  });
}

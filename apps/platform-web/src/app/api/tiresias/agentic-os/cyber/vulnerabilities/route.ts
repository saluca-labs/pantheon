/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/vulnerabilities
 *
 * GET  — list vulnerabilities (?q=&severity=).
 * POST — create a vulnerability.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  createVulnerability,
  listVulnerabilities,
  recordAudit,
} from '@/lib/agentic-os/cyber/repo';
import {
  VULNERABILITY_SEVERITY_VALUES,
  type VulnerabilitySeverity,
} from '@/lib/agentic-os/cyber/vulnerabilities';

const VulnBody = z.object({
  cveId: z.string().max(40).nullable().optional(),
  title: z.string().min(1).max(300),
  description: z.string().max(16000).nullable().optional(),
  severity: z.enum(VULNERABILITY_SEVERITY_VALUES).optional(),
  cvssScore: z.number().min(0).max(10).nullable().optional(),
  cvssVector: z.string().max(120).nullable().optional(),
  cweId: z.string().max(20).nullable().optional(),
  vendor: z.string().max(120).nullable().optional(),
  product: z.string().max(200).nullable().optional(),
  affectedVersions: z.array(z.string().max(120)).max(128).optional(),
  fixedVersions: z.array(z.string().max(120)).max(128).optional(),
  publishedAt: z.string().datetime().nullable().optional(),
  references: z.array(z.string().url().max(500)).max(64).optional(),
  tags: z.array(z.string().min(1).max(60)).max(32).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const severityRaw = sp.get('severity');
  const severity =
    severityRaw && (VULNERABILITY_SEVERITY_VALUES as readonly string[]).includes(severityRaw)
      ? (severityRaw as VulnerabilitySeverity)
      : undefined;
  const q = sp.get('q') ?? undefined;

  const vulnerabilities = await listVulnerabilities({
    ownerId: user.userId,
    severity,
    q,
  });
  return NextResponse.json({ vulnerabilities });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = VulnBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const vuln = await createVulnerability(user.userId, parsed.data);
  await recordAudit({
    actorId: user.userId,
    action: 'cyber.vulnerability.create',
    payload: { id: vuln.id, cveId: vuln.cveId, severity: vuln.severity },
  });
  return NextResponse.json({ vulnerability: vuln }, { status: 201 });
}

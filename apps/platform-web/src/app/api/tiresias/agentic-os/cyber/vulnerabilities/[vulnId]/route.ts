/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/vulnerabilities/[vulnId]
 *
 * GET / PATCH / DELETE a single vulnerability.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  deleteVulnerability,
  getVulnerability,
  recordAudit,
  updateVulnerability,
} from '@/lib/agentic-os/cyber/repo';
import { VULNERABILITY_SEVERITY_VALUES } from '@/lib/agentic-os/cyber/vulnerabilities';

const VulnPatch = z.object({
  cveId: z.string().max(40).nullable().optional(),
  title: z.string().min(1).max(300).optional(),
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

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ vulnId: string }> },
) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { vulnId } = await ctx.params;
  const v = await getVulnerability(vulnId, user.userId);
  if (!v) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ vulnerability: v });
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ vulnId: string }> },
) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { vulnId } = await ctx.params;

  const parsed = VulnPatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const v = await updateVulnerability(vulnId, user.userId, parsed.data);
  if (!v) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'cyber.vulnerability.update',
    payload: { id: vulnId, patch: Object.keys(parsed.data) },
  });
  return NextResponse.json({ vulnerability: v });
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ vulnId: string }> },
) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { vulnId } = await ctx.params;
  const ok = await deleteVulnerability(vulnId, user.userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'cyber.vulnerability.delete',
    payload: { id: vulnId },
  });
  return NextResponse.json({ ok: true });
}

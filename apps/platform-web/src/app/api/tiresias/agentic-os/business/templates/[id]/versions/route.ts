/**
 * Business OS Phase 6 — template version bump route.
 *
 * POST /api/tiresias/agentic-os/business/templates/[id]/versions
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { bumpVersion } from '@/lib/agentic-os/business/doc-templates-repo';

const BumpBody = z.object({
  version: z.string().max(20).optional(),
  body_md: z.string().max(100_000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const parsed = BumpBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const template = await bumpVersion(
    id,
    user.userId,
    parsed.data.version,
    parsed.data.body_md,
  );

  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'business.template.version_bumped',
    payload: { templateId: id, newId: template.id, version: template.version },
  });

  return NextResponse.json({ template }, { status: 201 });
}

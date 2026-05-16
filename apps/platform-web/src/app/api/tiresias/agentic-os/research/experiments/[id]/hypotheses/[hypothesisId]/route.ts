/**
 * Research OS Phase 3 — single experiment-hypothesis link route.
 *
 * `PATCH  /api/tiresias/.../experiments/:id/hypotheses/:hypothesisId`
 *   Update the link's `role` and/or `notes`. 404 cross-tenant either
 *   side. Audited as `research.experiment.hypothesis.updated` is NOT
 *   in the spec — instead role/notes patches are audited as
 *   `research.experiment.hypothesis.linked` with a `fields` payload
 *   (the same edge, the link properties change).
 *
 * `DELETE /api/tiresias/.../experiments/:id/hypotheses/:hypothesisId`
 *   Unlink. Audited as `research.experiment.hypothesis.unlinked`.
 *
 * Slug `[hypothesisId]` is semantic and distinct from any other
 * `[id]` at sibling paths.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import {
  getLinkByPair,
  updateLink,
  deleteLink,
} from '@/lib/agentic-os/research/experiment-hypotheses-repo';
import { LINK_ROLES, type LinkRole } from '@/lib/agentic-os/research/experiment-hypotheses';

const PatchBody = z.object({
  role: z.enum(LINK_ROLES as unknown as [string, ...string[]]).optional(),
  notes: z.string().max(20_000).nullable().optional(),
});

interface Props {
  params: Promise<{ id: string; hypothesisId: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: experimentId, hypothesisId } = await params;

  const existing = await getLinkByPair(experimentId, hypothesisId, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const link = await updateLink(experimentId, hypothesisId, user.userId, {
    role: parsed.data.role as LinkRole | undefined,
    notes: parsed.data.notes === undefined ? undefined : parsed.data.notes,
  });
  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'research.experiment.hypothesis.linked',
    payload: {
      linkId: link.id,
      experimentId,
      hypothesisId,
      fields: Object.keys(parsed.data),
      patched: true,
    },
    projectId: experimentId,
  });

  return NextResponse.json({ link });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: experimentId, hypothesisId } = await params;

  const existing = await getLinkByPair(experimentId, hypothesisId, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ok = await deleteLink(experimentId, hypothesisId, user.userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'research.experiment.hypothesis.unlinked',
    payload: {
      linkId: existing.id,
      experimentId,
      hypothesisId,
      role: existing.role,
    },
    projectId: experimentId,
  });

  return NextResponse.json({ ok: true });
}

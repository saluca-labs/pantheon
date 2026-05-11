/**
 * Maker OS — /api/tiresias/agentic-os/maker/projects/[id]/references
 *
 * GET  — list references linked to the project, joined with the reference
 *        row metadata so the UI can render without a second fetch.
 * POST — link an existing reference to a project. Body
 *        ``{ reference_id, notes? }``; returns 409 on duplicate.
 *
 * Auth + audit on every handler.
 *
 * @license MIT — Tiresias Maker OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  listReferencesForProject,
  attachReferenceToProject,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';

const AttachBody = z.object({
  reference_id: z.string().uuid(),
  notes: z.string().max(8000).nullable().optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId } = await params;
  try {
    const references = await listReferencesForProject(projectId, user.userId);
    return NextResponse.json({ references });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not found' },
      { status: 404 },
    );
  }
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId } = await params;

  const parsed = AttachBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const link = await attachReferenceToProject(
      projectId,
      parsed.data.reference_id,
      user.userId,
      { notes: parsed.data.notes },
    );
    await recordAudit({
      actorId: user.userId,
      action: 'maker.project.reference.linked',
      payload: {
        projectId,
        referenceId: parsed.data.reference_id,
      },
      projectId,
    });
    return NextResponse.json({ link }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to link reference';
    const lower = msg.toLowerCase();
    if (
      lower.includes('duplicate key') ||
      lower.includes('unique constraint') ||
      lower.includes('agos_maker_project_references_project_reference_unique')
    ) {
      return NextResponse.json(
        { error: 'Reference already linked to this project' },
        { status: 409 },
      );
    }
    if (lower.includes('not found')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

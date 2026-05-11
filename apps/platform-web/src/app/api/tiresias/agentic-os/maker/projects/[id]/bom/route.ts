/**
 * Maker OS — /api/tiresias/agentic-os/maker/projects/[id]/bom
 *
 * GET  — list BOM lines for a project.
 * POST — add a BOM line (binds a catalog row + optional variant to the project
 *        with quantity_needed + priority).
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  listBomLines,
  createBomLine,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';
import { BOM_PRIORITY_VALUES } from '@/lib/agentic-os/maker/bom';

const CreateBody = z.object({
  partCatalogId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  quantityNeeded: z.number().positive(),
  notes: z.string().max(2000).nullable().optional(),
  priority: z.enum(BOM_PRIORITY_VALUES as unknown as [string, ...string[]]).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId } = await params;
  try {
    const lines = await listBomLines(projectId, user.userId);
    return NextResponse.json({ lines });
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

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const line = await createBomLine(projectId, user.userId, parsed.data as any);
    await recordAudit({
      actorId: user.userId,
      action: 'maker.bom_line.created',
      payload: { projectId, lineId: line.id, partCatalogId: line.partCatalogId },
      projectId,
    });
    return NextResponse.json({ line }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create BOM line' },
      { status: 400 },
    );
  }
}

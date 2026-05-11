/**
 * Maker OS — /api/tiresias/agentic-os/maker/projects/[id]/parts
 *
 * GET   — list parts for a project.
 * POST  — add a part to a project.
 * PATCH — update a part (toggle in_stock, etc.).
 *
 * Lifted from the legacy `builds/[buildId]/parts` route as part of the
 * Phase 1 rename. Underneath, parts still hang off `agos_maker_parts.build_id`
 * — column rename is a Phase 2 concern. The route uses `projectId`
 * everywhere on the public surface.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  getProject,
  listParts,
  createPart,
  updatePart,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';

const PART_CATEGORY = [
  'electronic',
  'mechanical',
  'fastener',
  'material',
  'tool',
  'consumable',
  'other',
] as const;

const PartBody = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(PART_CATEGORY).optional(),
  quantity: z.number().int().min(1).optional(),
  unit: z.string().min(1).max(20).optional(),
  notes: z.string().max(2000).nullable().optional(),
  sourceUrl: z.string().url().max(500).nullable().optional(),
  inStock: z.boolean().optional(),
});

const PartPatch = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  category: z.enum(PART_CATEGORY).optional(),
  quantity: z.number().int().min(1).optional(),
  unit: z.string().min(1).max(20).optional(),
  notes: z.string().max(2000).nullable().optional(),
  sourceUrl: z.string().url().max(500).nullable().optional(),
  inStock: z.boolean().optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const { id: projectId } = await params;
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project = await getProject(projectId, user.userId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parts = await listParts(projectId);
  return NextResponse.json({ parts });
}

export async function POST(request: NextRequest, { params }: Props) {
  const { id: projectId } = await params;
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project = await getProject(projectId, user.userId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PartBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const part = await createPart(projectId, parsed.data);
  await recordAudit({
    actorId: user.userId,
    action: 'maker.part.created',
    payload: { projectId, partId: part.id },
    projectId,
  });

  return NextResponse.json({ part }, { status: 201 });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const { id: projectId } = await params;
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project = await getProject(projectId, user.userId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PartPatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id: partId, ...patch } = parsed.data;
  const part = await updatePart(partId, projectId, patch);
  if (!part) return NextResponse.json({ error: 'Part not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'maker.part.updated',
    payload: { projectId, partId },
    projectId,
  });

  return NextResponse.json({ part });
}

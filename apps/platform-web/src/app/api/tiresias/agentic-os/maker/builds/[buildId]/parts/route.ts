/**
 * Maker OS — /api/tiresias/agentic-os/maker/builds/[buildId]/parts
 *
 * GET   — list parts for a build.
 * POST  — add a part to a build.
 * PATCH — update a part (toggle in_stock, etc.).
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { getBuild, listParts, createPart, updatePart, recordAudit } from '@/lib/agentic-os/maker/repo';

const PartBody = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(['electronic', 'mechanical', 'fastener', 'material', 'tool', 'consumable', 'other']).optional(),
  quantity: z.number().int().min(1).optional(),
  unit: z.string().min(1).max(20).optional(),
  notes: z.string().max(2000).nullable().optional(),
  sourceUrl: z.string().url().max(500).nullable().optional(),
  inStock: z.boolean().optional(),
});

const PartPatch = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  category: z.enum(['electronic', 'mechanical', 'fastener', 'material', 'tool', 'consumable', 'other']).optional(),
  quantity: z.number().int().min(1).optional(),
  unit: z.string().min(1).max(20).optional(),
  notes: z.string().max(2000).nullable().optional(),
  sourceUrl: z.string().url().max(500).nullable().optional(),
  inStock: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ buildId: string }> },
) {
  const { buildId } = await context.params;
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const build = await getBuild(buildId, user.userId);
  if (!build) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parts = await listParts(buildId);
  return NextResponse.json({ parts });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ buildId: string }> },
) {
  const { buildId } = await context.params;
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const build = await getBuild(buildId, user.userId);
  if (!build) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PartBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const part = await createPart(buildId, parsed.data);
  await recordAudit({ actorId: user.userId, action: 'maker.part.created', payload: { buildId, partId: part.id } });

  return NextResponse.json({ part }, { status: 201 });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ buildId: string }> },
) {
  const { buildId } = await context.params;
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const build = await getBuild(buildId, user.userId);
  if (!build) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PartPatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const { id, ...patch } = parsed.data;
  const part = await updatePart(id, buildId, patch);
  if (!part) return NextResponse.json({ error: 'Part not found' }, { status: 404 });

  await recordAudit({ actorId: user.userId, action: 'maker.part.updated', payload: { buildId, partId: id } });

  return NextResponse.json({ part });
}

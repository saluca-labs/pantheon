/**
 * Maker OS — /api/tiresias/agentic-os/maker/tools/[toolId]/consumables/[consumableId]
 *
 * GET    — fetch one consumable.
 * PATCH  — partial update.
 * DELETE — remove one consumable.
 *
 * Auth + audit on every handler.
 *
 * @license MIT — Tiresias Maker OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  getConsumable,
  updateConsumable,
  deleteConsumable,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';
import type { ToolConsumablePatch } from '@/lib/agentic-os/maker/consumables';

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  kind: z.string().max(60).nullable().optional(),
  hoursRemaining: z.number().min(0).nullable().optional(),
  maxHours: z.number().min(0).nullable().optional(),
  lastReplacedAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(8000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ toolId: string; consumableId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { toolId, consumableId } = await params;
  try {
    const consumable = await getConsumable(consumableId, toolId, user.userId);
    if (!consumable) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ consumable });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not found' },
      { status: 404 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { toolId, consumableId } = await params;

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const consumable = await updateConsumable(
      consumableId,
      toolId,
      user.userId,
      parsed.data as ToolConsumablePatch,
    );
    if (!consumable) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.tool.consumable.updated',
      payload: { toolId, consumableId, fields: Object.keys(parsed.data) },
    });
    return NextResponse.json({ consumable });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update consumable';
    const status = msg.toLowerCase().includes('not found') ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { toolId, consumableId } = await params;
  try {
    const removed = await deleteConsumable(consumableId, toolId, user.userId);
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.tool.consumable.deleted',
      payload: { toolId, consumableId },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 400 },
    );
  }
}

/**
 * Maker OS — /api/tiresias/agentic-os/maker/tools/[toolId]/consumables
 *
 * GET  — list consumables for a tool.
 * POST — create a new consumable on a tool.
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
  listConsumables,
  createConsumable,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';

const ConsumableBody = z.object({
  name: z.string().min(1).max(200),
  kind: z.string().max(60).nullable().optional(),
  hoursRemaining: z.number().min(0).nullable().optional(),
  maxHours: z.number().min(0).nullable().optional(),
  lastReplacedAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(8000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ toolId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { toolId } = await params;
  try {
    const consumables = await listConsumables(toolId, user.userId);
    return NextResponse.json({ consumables });
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
  const { toolId } = await params;

  const parsed = ConsumableBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const consumable = await createConsumable(toolId, user.userId, parsed.data as any);
    await recordAudit({
      actorId: user.userId,
      action: 'maker.tool.consumable.created',
      payload: { toolId, consumableId: consumable.id, name: consumable.name },
    });
    return NextResponse.json({ consumable }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create consumable';
    const status = msg.toLowerCase().includes('not found') ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

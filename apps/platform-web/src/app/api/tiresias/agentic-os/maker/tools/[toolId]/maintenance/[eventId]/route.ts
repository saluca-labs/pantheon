/**
 * Maker OS — /api/tiresias/agentic-os/maker/tools/[toolId]/maintenance/[eventId]
 *
 * GET    — fetch one maintenance event.
 * PATCH  — partial update.
 * DELETE — remove one maintenance event.
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
  getMaintenanceEvent,
  updateMaintenanceEvent,
  deleteMaintenanceEvent,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';
import { MAINTENANCE_EVENT_KIND_VALUES, type MaintenanceEventPatch } from '@/lib/agentic-os/maker/maintenance';

const PatchBody = z.object({
  eventKind: z
    .enum(MAINTENANCE_EVENT_KIND_VALUES as unknown as [string, ...string[]])
    .optional(),
  performedAt: z.string().datetime().optional(),
  costCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  currency: z.string().min(1).max(8).optional(),
  vendor: z.string().max(200).nullable().optional(),
  notes: z.string().max(8000).nullable().optional(),
  nextDueAt: z.string().datetime().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ toolId: string; eventId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { toolId, eventId } = await params;
  try {
    const event = await getMaintenanceEvent(eventId, toolId, user.userId);
    if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ event });
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
  const { toolId, eventId } = await params;

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const event = await updateMaintenanceEvent(
      eventId,
      toolId,
      user.userId,
      parsed.data as MaintenanceEventPatch,
    );
    if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.tool.maintenance.updated',
      payload: { toolId, eventId, fields: Object.keys(parsed.data) },
    });
    return NextResponse.json({ event });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update event';
    const status = msg.toLowerCase().includes('not found') ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { toolId, eventId } = await params;
  try {
    const removed = await deleteMaintenanceEvent(eventId, toolId, user.userId);
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.tool.maintenance.deleted',
      payload: { toolId, eventId },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 400 },
    );
  }
}

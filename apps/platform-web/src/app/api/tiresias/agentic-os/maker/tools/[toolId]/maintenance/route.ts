/**
 * Maker OS — /api/tiresias/agentic-os/maker/tools/[toolId]/maintenance
 *
 * GET  — list maintenance events for a tool, ordered by performed_at DESC.
 * POST — append a new maintenance event.
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
  listMaintenanceEvents,
  createMaintenanceEvent,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';
import { MAINTENANCE_EVENT_KIND_VALUES } from '@/lib/agentic-os/maker/maintenance';

const EventBody = z.object({
  eventKind: z.enum(MAINTENANCE_EVENT_KIND_VALUES as unknown as [string, ...string[]]),
  performedAt: z.string().datetime().optional(),
  costCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  currency: z.string().min(1).max(8).optional(),
  vendor: z.string().max(200).nullable().optional(),
  notes: z.string().max(8000).nullable().optional(),
  nextDueAt: z.string().datetime().nullable().optional(),
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
    const events = await listMaintenanceEvents(toolId, user.userId);
    return NextResponse.json({ events });
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

  const parsed = EventBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const event = await createMaintenanceEvent(toolId, user.userId, parsed.data as any);
    await recordAudit({
      actorId: user.userId,
      action: 'maker.tool.maintenance.logged',
      payload: {
        toolId,
        eventId: event.id,
        eventKind: event.eventKind,
        costCents: event.costCents,
      },
    });
    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to log maintenance event';
    const status = msg.toLowerCase().includes('not found') ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

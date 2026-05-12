/**
 * Business OS Phase 3 — single time-entry route.
 *
 * GET    /api/tiresias/agentic-os/business/time-entries/[id]
 * PATCH  /api/tiresias/agentic-os/business/time-entries/[id]
 *   Partial update.  Does NOT update billed_at/invoice_id (those are via
 *   markBilled in Phase 4).  Audits `business.time_entry.updated`.
 * DELETE /api/tiresias/agentic-os/business/time-entries/[id]
 *   Hard delete (time entries are ephemeral records).  Audits
 *   `business.time_entry.deleted`.
 *
 * @license MIT — Tiresias Business OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  getTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
} from '@/lib/agentic-os/business/time-entries-repo';

const PatchBody = z
  .object({
    task_id: z.string().uuid().optional(),
    project_id: z.string().uuid().optional(),
    description: z.string().max(500).optional(),
    started_at: z.string().optional(),
    duration_minutes: z.number().nullable().optional(),
    is_billable: z.boolean().optional(),
    billing_rate_cents: z.number().int().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const entry = await getTimeEntry(id, user.userId);
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ entry });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const existing = await getTimeEntry(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const outcome = await updateTimeEntry(id, user.userId, {
    taskId: d.task_id,
    projectId: d.project_id,
    description: d.description,
    startedAt: d.started_at,
    durationMinutes: d.duration_minutes,
    isBillable: d.is_billable,
    billingRateCents: d.billing_rate_cents,
    metadata: d.metadata,
  });
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: user.userId,
    action: 'business.time_entry.updated',
    payload: { entryId: id, fields: Object.keys(d) },
  });
  return NextResponse.json({ entry: outcome.entry });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const existing = await getTimeEntry(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const deleted = await deleteTimeEntry(id, user.userId);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'business.time_entry.deleted',
    payload: { entryId: id },
  });
  return NextResponse.json({ ok: true });
}

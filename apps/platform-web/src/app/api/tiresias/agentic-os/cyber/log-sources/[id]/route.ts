/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/log-sources/[id]
 *
 * GET    — fetch a log source by id.
 * PATCH  — update fields.
 * DELETE — remove the source (alerts that referenced it have log_source_id
 *          set to NULL via the FK ON DELETE SET NULL).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  getLogSource,
  updateLogSource,
  deleteLogSource,
  recordAudit,
} from '@/lib/agentic-os/cyber/repo';
import {
  LOG_SOURCE_KIND_VALUES,
  LOG_SOURCE_STATUS_VALUES,
} from '@/lib/agentic-os/cyber/log-sources';

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  kind: z.enum(LOG_SOURCE_KIND_VALUES).optional(),
  vendor: z.string().max(120).nullable().optional(),
  endpointHint: z.string().max(500).nullable().optional(),
  status: z.enum(LOG_SOURCE_STATUS_VALUES).optional(),
  notes: z.string().max(2000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const source = await getLogSource(id, user.userId);
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ source });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const source = await updateLogSource(id, user.userId, parsed.data);
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.log_source.updated',
    payload: { id, fields: Object.keys(parsed.data) },
  });
  return NextResponse.json({ source });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ok = await deleteLogSource(id, user.userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.log_source.deleted',
    payload: { id },
  });
  return NextResponse.json({ ok: true });
}

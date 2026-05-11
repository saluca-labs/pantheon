/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/log-sources
 *
 * GET  — list log sources (filter by status, kind).
 * POST — create a new log source.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { listLogSources, createLogSource, recordAudit } from '@/lib/agentic-os/cyber/repo';
import {
  LOG_SOURCE_KIND_VALUES,
  LOG_SOURCE_STATUS_VALUES,
} from '@/lib/agentic-os/cyber/log-sources';

const LogSourceBody = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(LOG_SOURCE_KIND_VALUES),
  vendor: z.string().max(120).nullable().optional(),
  endpointHint: z.string().max(500).nullable().optional(),
  status: z.enum(LOG_SOURCE_STATUS_VALUES).optional(),
  notes: z.string().max(2000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const status = sp.get('status');
  const kind = sp.get('kind');

  const sources = await listLogSources({
    ownerId: user.userId,
    status:
      status && (LOG_SOURCE_STATUS_VALUES as readonly string[]).includes(status)
        ? (status as any)
        : undefined,
    kind:
      kind && (LOG_SOURCE_KIND_VALUES as readonly string[]).includes(kind)
        ? (kind as any)
        : undefined,
  });
  return NextResponse.json({ sources });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = LogSourceBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const source = await createLogSource(user.userId, parsed.data);
  await recordAudit({
    actorId: user.userId,
    action: 'cyber.log_source.created',
    payload: { id: source.id, kind: source.kind },
  });
  return NextResponse.json({ source }, { status: 201 });
}

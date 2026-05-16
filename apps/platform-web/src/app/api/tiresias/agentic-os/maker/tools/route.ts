/**
 * Maker OS — /api/tiresias/agentic-os/maker/tools
 *
 * GET  — list workshop tools for the authenticated user. Optional filters:
 *        ?status= (active|down|retired), ?kind= (cnc|3d_printer|...),
 *        ?tag= (single tag match against the GIN-indexed tags array).
 * POST — create a new workshop tool.
 *
 * Auth + audit on every handler. Underlying table: ``agos_maker_tools``.
 *
 * @license MIT — Tiresias Maker OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  listTools,
  createTool,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';
import {
  TOOL_KIND_VALUES,
  TOOL_STATUS_VALUES,
  type ToolKind,
  type ToolStatus,
  type ToolUpsert,
} from '@/lib/agentic-os/maker/tools';

const ToolBody = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(TOOL_KIND_VALUES as unknown as [string, ...string[]]),
  manufacturer: z.string().max(200).nullable().optional(),
  model: z.string().max(200).nullable().optional(),
  serial: z.string().max(200).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  status: z.enum(TOOL_STATUS_VALUES as unknown as [string, ...string[]]).optional(),
  purchasedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  imageUrl: z.string().url().max(2000).nullable().optional(),
  datasheetUrl: z.string().url().max(2000).nullable().optional(),
  manualUrl: z.string().url().max(2000).nullable().optional(),
  notes: z.string().max(8000).nullable().optional(),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const statusParam = sp.get('status');
  const status = statusParam ? (statusParam as ToolStatus) : undefined;
  if (status && !(TOOL_STATUS_VALUES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }
  const kindParam = sp.get('kind');
  const kind = kindParam ? (kindParam as ToolKind) : undefined;
  if (kind && !(TOOL_KIND_VALUES as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
  }
  const tag = sp.get('tag') ?? undefined;

  const tools = await listTools({ userId: user.userId, status, kind, tag });
  return NextResponse.json({ tools });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = ToolBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const tool = await createTool(user.userId, parsed.data as ToolUpsert);
    await recordAudit({
      actorId: user.userId,
      action: 'maker.tool.created',
      payload: { toolId: tool.id, name: tool.name, kind: tool.kind },
    });
    return NextResponse.json({ tool }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create tool' },
      { status: 400 },
    );
  }
}

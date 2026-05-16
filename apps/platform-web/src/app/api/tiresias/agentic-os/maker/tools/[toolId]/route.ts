/**
 * Maker OS — /api/tiresias/agentic-os/maker/tools/[toolId]
 *
 * GET    — fetch one workshop tool.
 * PATCH  — partial update.
 * DELETE — remove the tool (cascades to consumables, maintenance, project links).
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
  getTool,
  updateTool,
  deleteTool,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';
import {
  TOOL_KIND_VALUES,
  TOOL_STATUS_VALUES,
  type ToolPatch,
} from '@/lib/agentic-os/maker/tools';

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  kind: z.enum(TOOL_KIND_VALUES as unknown as [string, ...string[]]).optional(),
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

interface Props {
  params: Promise<{ toolId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { toolId } = await params;
  const tool = await getTool(toolId, user.userId);
  if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ tool });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { toolId } = await params;

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const tool = await updateTool(toolId, user.userId, parsed.data as ToolPatch);
    if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.tool.updated',
      payload: { toolId, fields: Object.keys(parsed.data) },
    });
    return NextResponse.json({ tool });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update tool' },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { toolId } = await params;
  try {
    const removed = await deleteTool(toolId, user.userId);
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.tool.deleted',
      payload: { toolId },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete tool' },
      { status: 400 },
    );
  }
}

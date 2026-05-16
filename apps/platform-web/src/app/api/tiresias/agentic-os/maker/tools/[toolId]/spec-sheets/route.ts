/**
 * Maker OS — /api/tiresias/agentic-os/maker/tools/[toolId]/spec-sheets
 *
 * Thin nested wrapper for the tool detail surface. Mirror of the catalog
 * nested route — locks tool_id to the URL param so the UI doesn't need
 * to provide it.
 *
 * @license MIT — Tiresias Maker OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  listSpecSheets,
  createSpecSheet,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';
import { SPEC_SHEET_KIND_VALUES, type SpecSheetUpsert } from '@/lib/agentic-os/maker/spec-sheets';

const ToolSpecSheetBody = z.object({
  title: z.string().min(1).max(200),
  kind: z.enum(SPEC_SHEET_KIND_VALUES as unknown as [string, ...string[]]).optional(),
  url: z.string().min(1).max(2000),
  notes: z.string().max(8000).nullable().optional(),
  revision: z.string().max(60).nullable().optional(),
  issuedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
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
  const sheets = await listSpecSheets({
    userId: user.userId,
    toolId,
  });
  return NextResponse.json({ specSheets: sheets });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { toolId } = await params;

  const parsed = ToolSpecSheetBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const specSheet = await createSpecSheet(user.userId, {
      ...parsed.data,
      toolId,
    } as SpecSheetUpsert);
    await recordAudit({
      actorId: user.userId,
      action: 'maker.spec_sheet.created',
      payload: {
        specSheetId: specSheet.id,
        title: specSheet.title,
        kind: specSheet.kind,
        toolId,
      },
    });
    return NextResponse.json({ specSheet }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create spec sheet';
    const status = msg.toLowerCase().includes('not found') ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

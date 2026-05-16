/**
 * Maker OS — /api/tiresias/agentic-os/maker/spec-sheets
 *
 * GET  — list spec sheets for the authenticated user. Filters:
 *        ?attachment=part|tool|project, ?part_id=, ?tool_id=, ?project_id=,
 *        ?kind=, ?tag=.
 * POST — create a new spec sheet. Body must satisfy the exactly-one
 *        attachment rule (one of partId / toolId / projectId).
 *
 * Auth + audit on every handler. Underlying table: ``agos_maker_spec_sheets``.
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
import {
  SPEC_SHEET_ATTACHMENT_VALUES,
  SPEC_SHEET_KIND_VALUES,
  validateAttachmentExclusivity,
  type SpecSheetAttachment,
  type SpecSheetKind,
  type SpecSheetUpsert,
} from '@/lib/agentic-os/maker/spec-sheets';

const SpecSheetBody = z.object({
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
  partId: z.string().uuid().nullable().optional(),
  toolId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const attachmentParam = sp.get('attachment');
  if (
    attachmentParam &&
    !(SPEC_SHEET_ATTACHMENT_VALUES as readonly string[]).includes(attachmentParam)
  ) {
    return NextResponse.json({ error: 'Invalid attachment' }, { status: 400 });
  }
  const kindParam = sp.get('kind');
  if (
    kindParam &&
    !(SPEC_SHEET_KIND_VALUES as readonly string[]).includes(kindParam)
  ) {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
  }

  const sheets = await listSpecSheets({
    userId: user.userId,
    attachment: (attachmentParam as SpecSheetAttachment | null) ?? undefined,
    partId: sp.get('part_id') ?? undefined,
    toolId: sp.get('tool_id') ?? undefined,
    projectId: sp.get('project_id') ?? undefined,
    kind: (kindParam as SpecSheetKind | null) ?? undefined,
    tag: sp.get('tag') ?? undefined,
  });
  return NextResponse.json({ specSheets: sheets });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = SpecSheetBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const attachErr = validateAttachmentExclusivity({
    partId: parsed.data.partId ?? null,
    toolId: parsed.data.toolId ?? null,
    projectId: parsed.data.projectId ?? null,
  });
  if (attachErr) {
    return NextResponse.json({ error: attachErr }, { status: 400 });
  }

  try {
    const specSheet = await createSpecSheet(user.userId, parsed.data as SpecSheetUpsert);
    await recordAudit({
      actorId: user.userId,
      action: 'maker.spec_sheet.created',
      payload: {
        specSheetId: specSheet.id,
        title: specSheet.title,
        kind: specSheet.kind,
        partId: specSheet.partId,
        toolId: specSheet.toolId,
        projectId: specSheet.projectId,
      },
      projectId: specSheet.projectId,
    });
    return NextResponse.json({ specSheet }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create spec sheet';
    const status = msg.toLowerCase().includes('not found') ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

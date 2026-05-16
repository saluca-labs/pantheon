/**
 * Maker OS — /api/tiresias/agentic-os/maker/spec-sheets/[id]
 *
 * GET    — read one spec sheet.
 * PATCH  — partial update (title / kind / url / notes / revision / issuedAt
 *          / tags / metadata). Attachment columns (part_id / tool_id /
 *          project_id) are immutable post-create; to move a sheet, delete
 *          and recreate it.
 * DELETE — remove the row.
 *
 * Auth + audit on every handler.
 *
 * @license MIT — Tiresias Maker OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  getSpecSheet,
  updateSpecSheet,
  deleteSpecSheet,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';
import { SPEC_SHEET_KIND_VALUES, type SpecSheetPatch } from '@/lib/agentic-os/maker/spec-sheets';

const PatchBody = z.object({
  title: z.string().min(1).max(200).optional(),
  kind: z.enum(SPEC_SHEET_KIND_VALUES as unknown as [string, ...string[]]).optional(),
  url: z.string().min(1).max(2000).optional(),
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
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sheet = await getSpecSheet(id, user.userId);
  if (!sheet) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ specSheet: sheet });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const updated = await updateSpecSheet(id, user.userId, parsed.data as SpecSheetPatch);
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.spec_sheet.updated',
      payload: { specSheetId: id, patch: parsed.data },
      projectId: updated.projectId,
    });
    return NextResponse.json({ specSheet: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update spec sheet' },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const existing = await getSpecSheet(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const ok = await deleteSpecSheet(id, user.userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'maker.spec_sheet.deleted',
    payload: { specSheetId: id },
    projectId: existing.projectId,
  });
  return NextResponse.json({ ok: true });
}

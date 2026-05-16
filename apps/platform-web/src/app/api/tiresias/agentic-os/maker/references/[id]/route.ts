/**
 * Maker OS — /api/tiresias/agentic-os/maker/references/[id]
 *
 * GET    — read one reference.
 * PATCH  — partial update.
 * DELETE — remove the row (and cascade out from project_references).
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
  getReference,
  updateReference,
  deleteReference,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';
import { REFERENCE_KIND_VALUES, type ReferencePatch } from '@/lib/agentic-os/maker/references';

const PatchBody = z.object({
  title: z.string().min(1).max(300).optional(),
  kind: z.enum(REFERENCE_KIND_VALUES as unknown as [string, ...string[]]).optional(),
  url: z.string().min(1).max(2000).optional(),
  authors: z.string().max(500).nullable().optional(),
  publisher: z.string().max(300).nullable().optional(),
  publishedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  notes: z.string().max(8000).nullable().optional(),
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
  const reference = await getReference(id, user.userId);
  if (!reference) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ reference });
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
    const updated = await updateReference(id, user.userId, parsed.data as ReferencePatch);
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.reference.updated',
      payload: { referenceId: id, patch: parsed.data },
    });
    return NextResponse.json({ reference: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update reference' },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const ok = await deleteReference(id, user.userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'maker.reference.deleted',
    payload: { referenceId: id },
  });
  return NextResponse.json({ ok: true });
}

/**
 * Maker OS — /api/tiresias/agentic-os/maker/suppliers/[id]
 *
 * GET    — fetch one supplier.
 * PATCH  — partial update.
 * DELETE — remove (supplier links cascade per FK).
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  getSupplier,
  updateSupplier,
  deleteSupplier,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  homepageUrl: z.string().url().max(2000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const supplier = await getSupplier(id, user.userId);
  if (!supplier) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ supplier });
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

  const supplier = await updateSupplier(id, user.userId, parsed.data as any);
  if (!supplier) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'maker.supplier.updated',
    payload: { supplierId: id, fields: Object.keys(parsed.data) },
  });
  return NextResponse.json({ supplier });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const removed = await deleteSupplier(id, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'maker.supplier.deleted',
    payload: { supplierId: id },
  });
  return NextResponse.json({ ok: true });
}

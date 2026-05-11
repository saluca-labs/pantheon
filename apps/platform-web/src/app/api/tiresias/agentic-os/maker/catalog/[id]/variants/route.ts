/**
 * Maker OS — /api/tiresias/agentic-os/maker/catalog/[id]/variants
 *
 * GET    — list variants for one catalog row.
 * POST   — create a variant.
 * PATCH  — partial update (body carries variant id).
 * DELETE — remove a variant (?variantId=).
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  listVariants,
  createVariant,
  updateVariant,
  deleteVariant,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';

const CreateBody = z.object({
  variantLabel: z.string().min(1).max(200),
  quantityOnHand: z.number().min(0).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const PatchBody = z.object({
  id: z.string().uuid(),
  variantLabel: z.string().min(1).max(200).optional(),
  quantityOnHand: z.number().min(0).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const variants = await listVariants(id, user.userId);
    return NextResponse.json({ variants });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not found' },
      { status: 404 },
    );
  }
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const variant = await createVariant(id, user.userId, parsed.data);
    await recordAudit({
      actorId: user.userId,
      action: 'maker.variant.created',
      payload: { catalogId: id, variantId: variant.id, label: variant.variantLabel },
    });
    return NextResponse.json({ variant }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create variant' },
      { status: 400 },
    );
  }
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
  const { id: variantId, ...patch } = parsed.data;

  try {
    const variant = await updateVariant(variantId, id, user.userId, patch);
    if (!variant) return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.variant.updated',
      payload: { catalogId: id, variantId },
    });
    return NextResponse.json({ variant });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update variant' },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const variantId = request.nextUrl.searchParams.get('variantId');
  if (!variantId) {
    return NextResponse.json({ error: 'variantId query param required' }, { status: 400 });
  }
  try {
    const removed = await deleteVariant(variantId, id, user.userId);
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.variant.deleted',
      payload: { catalogId: id, variantId },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 400 },
    );
  }
}

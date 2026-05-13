/**
 * Business OS Phase 4 — single invoice line-item route.
 *
 * GET    /api/tiresias/agentic-os/business/invoices/[id]/line-items/[itemId]
 * PATCH  /api/tiresias/agentic-os/business/invoices/[id]/line-items/[itemId]
 * DELETE /api/tiresias/agentic-os/business/invoices/[id]/line-items/[itemId]
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  getLineItem,
  updateLineItem,
  deleteLineItem,
} from '@/lib/agentic-os/business/line-items-repo';

const PatchBody = z.object({
  description: z.string().min(1).max(1000).optional(),
  quantity: z.number().positive().optional(),
  unit_label: z.string().max(50).optional(),
  unit_price_cents: z.number().int().min(0).optional(),
  tax_rate_bp: z.number().int().min(0).max(10000).optional(),
  position: z.number().int().min(0).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string; itemId: string }>;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, itemId } = await params;
  const item = await getLineItem(itemId, 'invoice', id, user.userId);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ line_item: item });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, itemId } = await params;

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const outcome = await updateLineItem(itemId, 'invoice', id, user.userId, {
    description: d.description,
    quantity: d.quantity,
    unitLabel: d.unit_label,
    unitPriceCents: d.unit_price_cents,
    taxRateBp: d.tax_rate_bp,
    position: d.position,
    metadata: d.metadata,
  });

  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'business.line_item.updated',
    payload: { lineItemId: itemId, parentType: 'invoice', parentId: id, fields: Object.keys(d) },
  });

  return NextResponse.json({ line_item: outcome.item });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, itemId } = await params;

  const deleted = await deleteLineItem(itemId, 'invoice', id, user.userId);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'business.line_item.deleted',
    payload: { lineItemId: itemId, parentType: 'invoice', parentId: id },
  });

  return NextResponse.json({ ok: true });
}

/**
 * Business OS Phase 4 — quote line-items collection route.
 *
 * GET  /api/tiresias/agentic-os/business/quotes/[id]/line-items
 * POST /api/tiresias/agentic-os/business/quotes/[id]/line-items
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { listLineItems, createLineItem } from '@/lib/agentic-os/business/line-items-repo';

const CreateBody = z.object({
  description: z.string().min(1).max(1000),
  quantity: z.number().positive().optional(),
  unit_label: z.string().max(50).optional(),
  unit_price_cents: z.number().int().min(0).optional(),
  tax_rate_bp: z.number().int().min(0).max(10000).optional(),
  position: z.number().int().min(0).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const items = await listLineItems('quote', id, user.userId);
  return NextResponse.json({ line_items: items });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const item = await createLineItem('quote', id, user.userId, {
    description: d.description,
    quantity: d.quantity,
    unitLabel: d.unit_label,
    unitPriceCents: d.unit_price_cents,
    taxRateBp: d.tax_rate_bp,
    position: d.position,
    metadata: d.metadata,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'business.line_item.created',
    payload: { lineItemId: item.id, parentType: 'quote', parentId: id },
  });

  return NextResponse.json({ line_item: item }, { status: 201 });
}

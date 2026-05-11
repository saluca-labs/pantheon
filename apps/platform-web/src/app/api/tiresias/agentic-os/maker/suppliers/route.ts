/**
 * Maker OS — /api/tiresias/agentic-os/maker/suppliers
 *
 * GET  — list suppliers for the authenticated user.
 * POST — create a supplier.
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  listSuppliers,
  createSupplier,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';

const SupplierBody = z.object({
  name: z.string().min(1).max(200),
  homepageUrl: z.string().url().max(2000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const suppliers = await listSuppliers(user.userId);
  return NextResponse.json({ suppliers });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = SupplierBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supplier = await createSupplier(user.userId, parsed.data as any);
  await recordAudit({
    actorId: user.userId,
    action: 'maker.supplier.created',
    payload: { supplierId: supplier.id, name: supplier.name },
  });
  return NextResponse.json({ supplier }, { status: 201 });
}

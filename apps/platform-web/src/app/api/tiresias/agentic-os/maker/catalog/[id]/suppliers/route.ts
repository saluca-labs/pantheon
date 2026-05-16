/**
 * Maker OS — /api/tiresias/agentic-os/maker/catalog/[id]/suppliers
 *
 * GET    — list supplier links for one catalog row.
 * POST   — create a new link.
 * PATCH  — partial update (body carries link id).
 * DELETE — remove a link (?linkId=).
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  listSupplierLinks,
  createSupplierLink,
  updateSupplierLink,
  deleteSupplierLink,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';
import type { PartSupplierLinkUpsert } from '@/lib/agentic-os/maker/suppliers';

const CreateBody = z.object({
  supplierId: z.string().uuid(),
  supplierPartNumber: z.string().max(200).nullable().optional(),
  unitPriceCents: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  leadTimeDays: z.number().int().min(0).max(3650).nullable().optional(),
  url: z.string().url().max(2000).nullable().optional(),
  lastPricedAt: z.string().datetime().nullable().optional(),
});

const PatchBody = z.object({
  id: z.string().uuid(),
  supplierPartNumber: z.string().max(200).nullable().optional(),
  unitPriceCents: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  leadTimeDays: z.number().int().min(0).max(3650).nullable().optional(),
  url: z.string().url().max(2000).nullable().optional(),
  lastPricedAt: z.string().datetime().nullable().optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const links = await listSupplierLinks(id, user.userId);
    return NextResponse.json({ links });
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
    const link = await createSupplierLink(id, user.userId, parsed.data as PartSupplierLinkUpsert);
    await recordAudit({
      actorId: user.userId,
      action: 'maker.supplier_link.created',
      payload: { catalogId: id, linkId: link.id, supplierId: link.supplierId },
    });
    return NextResponse.json({ link }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create link' },
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
  const { id: linkId, ...patch } = parsed.data;

  try {
    const link = await updateSupplierLink(linkId, id, user.userId, patch as Partial<PartSupplierLinkUpsert>);
    if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.supplier_link.updated',
      payload: { catalogId: id, linkId },
    });
    return NextResponse.json({ link });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update link' },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const linkId = request.nextUrl.searchParams.get('linkId');
  if (!linkId) {
    return NextResponse.json({ error: 'linkId query param required' }, { status: 400 });
  }
  try {
    const removed = await deleteSupplierLink(linkId, id, user.userId);
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.supplier_link.deleted',
      payload: { catalogId: id, linkId },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 400 },
    );
  }
}

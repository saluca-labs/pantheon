/**
 * Maker OS — /api/tiresias/agentic-os/maker/catalog/[id]
 *
 * GET    — fetch one catalog row.
 * PATCH  — partial update.
 * DELETE — remove (variants + supplier links + BOM-line FKs all cascade per
 *          the migration 0035 schema).
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  getCatalogRow,
  updateCatalogRow,
  deleteCatalogRow,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';
import { PART_CATEGORY_VALUES, type PartCatalogUpsert } from '@/lib/agentic-os/maker/catalog';

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.enum(PART_CATEGORY_VALUES as unknown as [string, ...string[]]).optional(),
  manufacturer: z.string().max(200).nullable().optional(),
  mfgPartNumber: z.string().max(200).nullable().optional(),
  unit: z.string().min(1).max(20).optional(),
  parentPartCatalogId: z.string().uuid().nullable().optional(),
  quantityOnHand: z.number().min(0).optional(),
  defaultSupplierId: z.string().uuid().nullable().optional(),
  datasheetUrl: z.string().url().max(2000).nullable().optional(),
  imageUrl: z.string().url().max(2000).nullable().optional(),
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
  const row = await getCatalogRow(id, user.userId);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ row });
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
    const row = await updateCatalogRow(id, user.userId, parsed.data as Partial<PartCatalogUpsert>);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.catalog.updated',
      payload: { catalogId: id, fields: Object.keys(parsed.data) },
    });
    return NextResponse.json({ row });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update catalog row' },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const removed = await deleteCatalogRow(id, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'maker.catalog.deleted',
    payload: { catalogId: id },
  });
  return NextResponse.json({ ok: true });
}

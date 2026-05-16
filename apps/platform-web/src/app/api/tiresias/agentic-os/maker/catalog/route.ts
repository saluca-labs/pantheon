/**
 * Maker OS — /api/tiresias/agentic-os/maker/catalog
 *
 * GET  — list parts catalog rows for the authenticated user (filterable by
 *        category / search / tag).
 * POST — create a catalog row.
 *
 * Auth + audit on every handler. Underlying table: ``agos_maker_part_catalog``.
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  listCatalog,
  createCatalogRow,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';
import {
  PART_CATEGORY_VALUES,
  type PartCategory,
  type PartCatalogUpsert,
} from '@/lib/agentic-os/maker/catalog';

const CatalogBody = z.object({
  name: z.string().min(1).max(200),
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

export async function GET(request: NextRequest) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const categoryParam = sp.get('category');
  const category = categoryParam ? (categoryParam as PartCategory) : undefined;
  if (category && !(PART_CATEGORY_VALUES as readonly string[]).includes(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }
  const search = sp.get('search') ?? undefined;
  const tag = sp.get('tag') ?? undefined;

  const rows = await listCatalog({ userId: user.userId, category, search, tag });
  return NextResponse.json({ rows });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = CatalogBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const row = await createCatalogRow(user.userId, parsed.data as PartCatalogUpsert);
    await recordAudit({
      actorId: user.userId,
      action: 'maker.catalog.created',
      payload: { catalogId: row.id, name: row.name },
    });
    return NextResponse.json({ row }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create catalog row' },
      { status: 400 },
    );
  }
}

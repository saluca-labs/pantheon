/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/assets
 *
 * GET  — list (filterable) assets for the authenticated user.
 * POST — create a new asset.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { listAssets, createAsset, recordAudit } from '@/lib/agentic-os/cyber/repo';
import {
  ASSET_KIND_VALUES,
  ASSET_CRITICALITY_VALUES,
  type AssetKind,
  type AssetCriticality,
} from '@/lib/agentic-os/cyber/assets';

const AssetBody = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(ASSET_KIND_VALUES),
  criticality: z.enum(ASSET_CRITICALITY_VALUES),
  environment: z.string().max(60).nullable().optional(),
  hostname: z.string().max(253).nullable().optional(),
  ipAddress: z.string().ip().nullable().optional(),
  osFamily: z.string().max(60).nullable().optional(),
  osVersion: z.string().max(60).nullable().optional(),
  ownerEmail: z.string().email().max(320).nullable().optional(),
  tags: z.array(z.string().min(1).max(60)).max(32).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const kind = sp.get('kind');
  const criticality = sp.get('criticality');
  const environment = sp.get('environment') ?? undefined;
  const q = sp.get('q') ?? undefined;
  const includeDecommissioned = sp.get('includeDecommissioned') === 'true';

  const assets = await listAssets({
    ownerId: user.userId,
    q,
    environment,
    includeDecommissioned,
    kind: kind && (ASSET_KIND_VALUES as readonly string[]).includes(kind) ? (kind as AssetKind) : undefined,
    criticality:
      criticality && (ASSET_CRITICALITY_VALUES as readonly string[]).includes(criticality)
        ? (criticality as AssetCriticality)
        : undefined,
  });
  return NextResponse.json({ assets });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = AssetBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const asset = await createAsset(user.userId, parsed.data);
  await recordAudit({
    actorId: user.userId,
    action: 'cyber.asset.created',
    payload: { id: asset.id, kind: asset.kind, criticality: asset.criticality },
  });
  return NextResponse.json({ asset }, { status: 201 });
}

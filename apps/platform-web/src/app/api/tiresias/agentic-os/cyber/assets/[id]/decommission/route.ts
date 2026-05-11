/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/assets/[id]/decommission
 *
 * POST — soft-delete (sets `decommissioned_at` to now()).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { decommissionAsset, recordAudit } from '@/lib/agentic-os/cyber/repo';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const asset = await decommissionAsset(id, user.userId);
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.asset.decommissioned',
    payload: { id },
  });
  return NextResponse.json({ asset });
}

/**
 * Business OS Phase 1 — organization restore route.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { restoreOrganization } from '@/lib/agentic-os/business/orgs-repo';

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const outcome = await restoreOrganization(id, user.userId);
  if (outcome == null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (outcome.alreadyActive) {
    return NextResponse.json({ error: 'Organization is already active' }, { status: 400 });
  }
  await recordAudit({
    actorId: user.userId,
    action: 'business.org.restored',
    payload: { orgId: id },
  });
  return NextResponse.json({ organization: outcome.org });
}

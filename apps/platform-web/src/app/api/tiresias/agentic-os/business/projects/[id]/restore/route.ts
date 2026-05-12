/**
 * Business OS Phase 3 — project restore route.
 *
 * POST /api/tiresias/agentic-os/business/projects/[id]/restore
 *   Clear archived_at.  404 when the project doesn't exist for this user;
 *   400 when the project is already active.  Audits
 *   `business.project.restored`.
 *
 * @license MIT — Tiresias Business OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { restoreProject } from '@/lib/agentic-os/business/projects-repo';

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const outcome = await restoreProject(id, user.userId);
  if (outcome == null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (outcome.alreadyActive) {
    return NextResponse.json({ error: 'Project is already active' }, { status: 400 });
  }
  await recordAudit({
    actorId: user.userId,
    action: 'business.project.restored',
    payload: { projectId: id },
  });
  return NextResponse.json({ project: outcome.project });
}

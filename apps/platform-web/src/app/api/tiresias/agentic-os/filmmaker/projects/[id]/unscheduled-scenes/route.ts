/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/projects/[id]/unscheduled-scenes
 *
 * GET — head-version scenes that have no strip yet. Left-pane source
 *       for the stripboard.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import { getUnscheduledScenes } from '@/lib/agentic-os/filmmaker/repo';

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const scenes = await getUnscheduledScenes(id, user.userId);
  return NextResponse.json({ scenes });
}

/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/projects/[id]/schedule-summary
 *
 * GET — counts, eighths, scheduled minutes — top stats row data.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import { getProjectScheduleSummary } from '@/lib/agentic-os/filmmaker/repo';

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const summary = await getProjectScheduleSummary(id, user.userId);
  return NextResponse.json({ summary });
}

/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/projects/[id]/exports/shot-list.pdf
 *
 * GET — render the project's shot list as a PDF.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import * as React from 'react';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import { getProject, listShots, recordAudit } from '@/lib/agentic-os/filmmaker/repo';
import { renderPdfToBuffer } from '@/lib/agentic-os/_shared/pdf/render';
import { ShotListPdf } from '@/lib/agentic-os/filmmaker/pdf/shot-list';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const project = await getProject(id, user.userId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const shots = await listShots(id);
  const buffer = await renderPdfToBuffer(
    React.createElement(ShotListPdf, { project, shots }),
  );

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.shot_list.export_pdf',
    payload: { projectId: id, shotCount: shots.length },
    projectId: id,
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="shot-list-${id}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}

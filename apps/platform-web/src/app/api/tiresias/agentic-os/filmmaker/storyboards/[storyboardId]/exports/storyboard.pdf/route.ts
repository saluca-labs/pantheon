/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/storyboards/[storyboardId]/exports/storyboard.pdf
 *
 * GET — render the storyboard panel grid as a PDF.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import * as React from 'react';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getStoryboard,
  getProject,
  getScreenplayScene,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';
import { renderPdfToBuffer } from '@/lib/agentic-os/_shared/pdf/render';
import { respondWithPdf } from '@/lib/agentic-os/_shared/blob-store';
import { StoryboardPdf } from '@/lib/agentic-os/filmmaker/pdf/storyboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ storyboardId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { storyboardId } = await params;
  const storyboard = await getStoryboard(storyboardId, user.userId);
  if (!storyboard) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const project = await getProject(storyboard.projectId, user.userId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let sceneHeading: string | null = null;
  if (storyboard.sceneId) {
    const scene = await getScreenplayScene(storyboard.sceneId, user.userId);
    if (scene) sceneHeading = scene.heading;
  }

  const buffer = await renderPdfToBuffer(
    React.createElement(StoryboardPdf, {
      project,
      storyboard,
      panels: storyboard.panels,
      sceneHeading,
    }),
  );

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.storyboard.export_pdf',
    payload: { storyboardId, projectId: project.id },
    projectId: project.id,
  });

  return respondWithPdf({
    buffer,
    slug: 'filmmaker',
    tenantId: user.userId,
    key: `storyboards/${storyboardId}/storyboard.pdf`,
    filename: `storyboard-${storyboardId}.pdf`,
    disposition: 'attachment',
  });
}

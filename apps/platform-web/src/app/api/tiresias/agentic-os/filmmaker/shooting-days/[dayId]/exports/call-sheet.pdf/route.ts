/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/shooting-days/[dayId]/exports/call-sheet.pdf
 *
 * GET — render a call sheet PDF for the given shooting day.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import * as React from 'react';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getShootingDay,
  getProject,
  listBreakdownElements,
  listCharacters,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';
import { renderPdfToBuffer } from '@/lib/agentic-os/_shared/pdf/render';
import { respondWithPdf } from '@/lib/agentic-os/_shared/blob-store';
import { CallSheetPdf } from '@/lib/agentic-os/filmmaker/pdf/call-sheet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ dayId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { dayId } = await params;
  const day = await getShootingDay(dayId, user.userId);
  if (!day) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const project = await getProject(day.projectId, user.userId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const sceneIds = day.strips.map((s) => s.sceneId);
  const elementsBySceneArrays = await Promise.all(
    sceneIds.map((sid) => listBreakdownElements({ sceneId: sid, userId: user.userId })),
  );
  const castElements = elementsBySceneArrays
    .flat()
    .filter((e) => e.category === 'cast');

  const characters = await listCharacters({
    projectId: project.id,
    tenantId: user.tenantId,
    userId: user.userId,
  });

  const buffer = await renderPdfToBuffer(
    React.createElement(CallSheetPdf, {
      project,
      day,
      strips: day.strips,
      castElements,
      characters,
    }),
  );

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.call_sheet.export_pdf',
    payload: { dayId, projectId: project.id },
    projectId: project.id,
  });

  return respondWithPdf({
    buffer,
    slug: 'filmmaker',
    tenantId: user.userId,
    key: `shooting-days/${dayId}/call-sheet.pdf`,
    filename: `call-sheet-day-${day.dayNumber}.pdf`,
    disposition: 'attachment',
  });
}

/**
 * Maker OS — /api/tiresias/agentic-os/maker/projects/[id]/export.pdf
 *
 * GET — render the project as a self-contained build packet PDF.
 *
 * The packet bundles: cover + phase progress, BOM, build steps, milestones,
 * tools, and references. Uses the OS-agnostic `_shared/pdf` primitive.
 *
 * Auth + audit. Audit row carries the projectId so the per-project log
 * picks up the export event.
 *
 * @license MIT — Tiresias Maker OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import * as React from 'react';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  getProject,
  getBomSummary,
  listBuildSteps,
  listMilestones,
  listToolsForProject,
  listReferencesForProject,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';
import { renderPdfToBuffer } from '@/lib/agentic-os/_shared/pdf/render';
import { respondWithPdf } from '@/lib/agentic-os/_shared/blob-store';
import { ProjectExportPdf } from '@/lib/agentic-os/maker/pdf/project-export';
import { projectSlug } from '@/lib/agentic-os/maker/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const project = await getProject(id, user.userId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [bom, steps, milestones, tools, references] = await Promise.all([
    getBomSummary(id, user.userId),
    listBuildSteps(id, user.userId),
    listMilestones(id, user.userId),
    listToolsForProject(id, user.userId),
    listReferencesForProject(id, user.userId),
  ]);

  const hasData =
    (bom?.linesCount ?? 0) > 0 ||
    steps.length > 0 ||
    milestones.length > 0 ||
    tools.length > 0 ||
    references.length > 0;
  if (!hasData) {
    return NextResponse.json(
      {
        error:
          'Project has no BOM, steps, milestones, tools, or references — nothing to export.',
      },
      { status: 400 },
    );
  }

  const buffer = await renderPdfToBuffer(
    React.createElement(ProjectExportPdf, {
      project,
      bom,
      steps,
      milestones,
      tools,
      references,
    }),
  );

  const stamp = new Date().toISOString().slice(0, 10);
  const slug = projectSlug(project.name) || 'project';

  await recordAudit({
    actorId: user.userId,
    action: 'maker.project.export_pdf',
    payload: {
      projectId: id,
      bomLines: bom?.linesCount ?? 0,
      steps: steps.length,
      milestones: milestones.length,
      tools: tools.length,
      references: references.length,
    },
    projectId: id,
  });

  return respondWithPdf({
    buffer,
    slug: 'maker',
    tenantId: user.userId,
    key: `projects/${id}/export-${stamp}.pdf`,
    filename: `${slug}-${stamp}.pdf`,
    disposition: 'attachment',
  });
}

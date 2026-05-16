/**
 * Research OS — /api/tiresias/agentic-os/research/experiments/[id]
 *
 * GET    — fetch one experiment.
 * PATCH  — partial update of experiment metadata. Status changes write a
 *          separate audit row alongside the general updated row.
 * DELETE — soft-archive (sets archived_at = now()) by default; hard delete
 *          on ?hard=true.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import {
  getExperiment,
  updateExperiment,
  archiveExperiment,
  deleteExperiment,
  recordAudit,
} from '@/lib/agentic-os/research/repo';
import {
  EXPERIMENT_STATUSES,
  EXPERIMENT_PHASES,
  coercePhaseProgress,
  type ExperimentStatus,
} from '@/lib/agentic-os/research/experiments';

const PhaseProgressSchema = z
  .object(
    Object.fromEntries(
      EXPERIMENT_PHASES.map((k) => [k, z.number().min(0).max(100).optional()]),
    ),
  )
  .partial();

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional(),
  status: z.enum(EXPERIMENT_STATUSES as unknown as [string, ...string[]]).optional(),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
  coverImageUrl: z.string().url().max(2000).nullable().optional(),
  targetCompletionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  teamSize: z.number().int().min(0).max(10_000).nullable().optional(),
  phaseProgress: PhaseProgressSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  hypothesisId: z.string().uuid().nullable().optional(),
  independent: z.string().max(2000).optional(),
  dependent: z.string().max(2000).optional(),
  controls: z.string().max(2000).optional(),
  protocol: z.string().max(8000).optional(),
  successCriteria: z.string().max(2000).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const experiment = await getExperiment(id, user.userId);
  if (!experiment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ experiment });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  // Cross-ownership gate — explicit 404 before any update SQL runs.
  const existing = await getExperiment(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const experiment = await updateExperiment(id, user.userId, {
    name: d.name,
    description: d.description,
    status: d.status as ExperimentStatus | undefined,
    tags: d.tags,
    coverImageUrl: d.coverImageUrl,
    targetCompletionDate: d.targetCompletionDate,
    teamSize: d.teamSize,
    phaseProgress: d.phaseProgress ? coercePhaseProgress(d.phaseProgress) : undefined,
    metadata: d.metadata,
    hypothesisId: d.hypothesisId,
    independent: d.independent,
    dependent: d.dependent,
    controls: d.controls,
    protocol: d.protocol,
    successCriteria: d.successCriteria,
  });
  if (!experiment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'research.experiment.updated',
    payload: { experimentId: id, fields: Object.keys(d) },
    projectId: id,
  });

  if (d.status && d.status !== existing.status) {
    await recordAudit({
      actorId: user.userId,
      action: 'research.experiment.status_changed',
      payload: { experimentId: id, from: existing.status, to: d.status },
      projectId: id,
    });
  }

  return NextResponse.json({ experiment });
}

export async function DELETE(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const url = new URL(request.url);
  const hard = url.searchParams.get('hard') === 'true';

  const existing = await getExperiment(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (hard) {
    const removed = await deleteExperiment(id, user.userId);
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'research.experiment.deleted',
      payload: { experimentId: id, hard: true },
      projectId: id,
    });
    return NextResponse.json({ ok: true, hard: true });
  }

  const archived = await archiveExperiment(id, user.userId);
  if (!archived) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'research.experiment.archived',
    payload: { experimentId: id },
    projectId: id,
  });
  return NextResponse.json({ experiment: archived });
}

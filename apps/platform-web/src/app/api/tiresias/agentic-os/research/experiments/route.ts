/**
 * Research OS — /api/tiresias/agentic-os/research/experiments
 *
 * GET  — list current user's experiments.
 *        Filters: ?status=, ?tag=, ?archived=true|false (default false).
 *        Paginated: ?limit=20&offset=0 (limit max 200).
 * POST — create a new experiment. Body validates required `name`.
 *        Optional `hypothesisId` is accepted but not required (legacy
 *        polymorphic pointer from the 0005_research_os shape).
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import {
  listExperimentsForUser,
  createExperiment,
  recordAudit,
} from '@/lib/agentic-os/research/repo';
import {
  EXPERIMENT_STATUSES,
  EXPERIMENT_PHASES,
  coercePhaseProgress,
} from '@/lib/agentic-os/research/experiments';

const PhaseProgressSchema = z
  .object(
    Object.fromEntries(
      EXPERIMENT_PHASES.map((k) => [k, z.number().min(0).max(100).optional()]),
    ),
  )
  .partial();

const ExperimentBody = z.object({
  name: z.string().min(1).max(200),
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

export async function GET(request: NextRequest) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status');
  const tagParam = url.searchParams.get('tag');
  const archivedParam = url.searchParams.get('archived');
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');

  let status: (typeof EXPERIMENT_STATUSES)[number] | undefined;
  if (statusParam) {
    if (!(EXPERIMENT_STATUSES as readonly string[]).includes(statusParam)) {
      return NextResponse.json(
        { error: `Invalid status filter: ${statusParam}` },
        { status: 400 },
      );
    }
    status = statusParam as typeof status;
  }

  let archived: boolean | undefined;
  if (archivedParam === 'true') archived = true;
  else if (archivedParam === 'false') archived = false;

  const limit = limitParam ? Number(limitParam) : 100;
  const offset = offsetParam ? Number(offsetParam) : 0;
  if (!Number.isFinite(limit) || limit < 1 || limit > 200) {
    return NextResponse.json({ error: 'limit must be 1..200' }, { status: 400 });
  }
  if (!Number.isFinite(offset) || offset < 0) {
    return NextResponse.json({ error: 'offset must be >= 0' }, { status: 400 });
  }

  const experiments = await listExperimentsForUser(user.userId, {
    status,
    tag: tagParam ?? undefined,
    archived,
    limit,
    offset,
  });
  return NextResponse.json({ experiments });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = ExperimentBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const experiment = await createExperiment(user.userId, {
    name: d.name,
    description: d.description,
    status: d.status as any,
    tags: d.tags,
    coverImageUrl: d.coverImageUrl ?? null,
    targetCompletionDate: d.targetCompletionDate ?? null,
    teamSize: d.teamSize ?? null,
    phaseProgress: d.phaseProgress ? coercePhaseProgress(d.phaseProgress) : undefined,
    metadata: d.metadata,
    hypothesisId: d.hypothesisId ?? null,
    independent: d.independent,
    dependent: d.dependent,
    controls: d.controls,
    protocol: d.protocol,
    successCriteria: d.successCriteria,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'research.experiment.created',
    payload: { experimentId: experiment.id },
    projectId: experiment.id,
  });

  return NextResponse.json({ experiment }, { status: 201 });
}

/**
 * Research OS Phase 5 — experiment-datasets collection route.
 *
 * GET  /api/tiresias/agentic-os/research/experiments/:id/datasets
 *   Filterable by ?kind, ?archived (true|false), ?tag. 200 with rows.
 *
 * POST /api/tiresias/agentic-os/research/experiments/:id/datasets
 *   Create a per-experiment dataset row. URL-only — binary content is
 *   governed by the MCP storage-transfer contract.
 *
 * Audit projectId = experimentId.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import {
  isExperimentOwnedByUser,
  listDatasetsForExperiment,
  createDataset,
} from '@/lib/agentic-os/research/datasets-repo';
import {
  isValidDatasetUrl,
  normalizeDatasetTags,
  validateDatasetKind,
  validateDatasetName,
} from '@/lib/agentic-os/research/datasets';
import { DATASET_KINDS } from '@/lib/agentic-os/research/dataset-kinds';

const CreateBody = z.object({
  name: z.string(),
  url: z.string(),
  kind: z.enum(DATASET_KINDS as unknown as [string, ...string[]]).optional(),
  version: z.string().nullable().optional(),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  checksum: z.string().max(200).nullable().optional(),
  archived: z.boolean().optional(),
  publishedDoi: z.string().max(200).nullable().optional(),
  notesMd: z.string().max(20000).nullable().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: experimentId } = await params;
  const owned = await isExperimentOwnedByUser(experimentId, user.userId);
  if (!owned) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const url = new URL(request.url);
  const kindParam = url.searchParams.get('kind');
  const archivedParam = url.searchParams.get('archived');
  const tagParam = url.searchParams.get('tag');

  const opts: Parameters<typeof listDatasetsForExperiment>[2] = {};
  if (kindParam) {
    const kindErr = validateDatasetKind(kindParam);
    if (kindErr) {
      return NextResponse.json({ error: kindErr }, { status: 400 });
    }
    opts.kind = kindParam as any;
  }
  if (archivedParam != null) {
    if (archivedParam === 'true') opts.archived = true;
    else if (archivedParam === 'false') opts.archived = false;
  }
  if (tagParam) opts.tag = tagParam;

  const datasets = await listDatasetsForExperiment(experimentId, user.userId, opts);
  return NextResponse.json({ datasets });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: experimentId } = await params;
  const owned = await isExperimentOwnedByUser(experimentId, user.userId);
  if (!owned) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const nameErr = validateDatasetName(d.name);
  if (nameErr) {
    return NextResponse.json({ error: nameErr }, { status: 400 });
  }
  if (!isValidDatasetUrl(d.url)) {
    return NextResponse.json(
      { error: 'url must be a valid http(s) URL' },
      { status: 400 },
    );
  }
  if (d.kind != null) {
    const kindErr = validateDatasetKind(d.kind);
    if (kindErr) {
      return NextResponse.json({ error: kindErr }, { status: 400 });
    }
  }

  const dataset = await createDataset(experimentId, user.userId, {
    name: d.name.trim(),
    url: d.url.trim(),
    kind: d.kind as any,
    version: d.version ?? null,
    sizeBytes: d.sizeBytes ?? null,
    checksum: d.checksum ?? null,
    archived: d.archived ?? false,
    publishedDoi: d.publishedDoi ?? null,
    notesMd: d.notesMd ?? null,
    tags: normalizeDatasetTags(d.tags),
    metadata: d.metadata ?? {},
  });

  await recordAudit({
    actorId: user.userId,
    action: 'research.dataset.created',
    payload: {
      experimentId,
      datasetId: dataset.id,
      kind: dataset.kind,
      archived: dataset.archived,
    },
    projectId: experimentId,
  });

  return NextResponse.json({ dataset }, { status: 201 });
}

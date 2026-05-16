/**
 * Research OS Phase 5 — single-dataset route.
 *
 * GET    /api/tiresias/agentic-os/research/datasets/:datasetId
 * PATCH  /api/tiresias/agentic-os/research/datasets/:datasetId
 *   PATCH { archived: true } takes the soft-archive path → audits as
 *   `research.dataset.archived` (NOT .updated).
 *   PATCH { archived: false } takes the restore path → audits as
 *   `research.dataset.restored` (NOT .updated).
 *   PATCH with any other field combination audits as
 *   `research.dataset.updated`.
 * DELETE /api/tiresias/agentic-os/research/datasets/:datasetId
 *   Hard delete (datasets are pointer rows; archived flag is a
 *   semantic external-archive marker, not a soft-delete). Audits as
 *   `research.dataset.deleted`.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import {
  getDataset,
  updateDataset,
  deleteDataset,
} from '@/lib/agentic-os/research/datasets-repo';
import {
  isValidDatasetUrl,
  normalizeDatasetTags,
  validateDatasetKind,
  validateDatasetName,
} from '@/lib/agentic-os/research/datasets';
import { DATASET_KINDS, type DatasetKind } from '@/lib/agentic-os/research/dataset-kinds';

const PatchBody = z.object({
  name: z.string().optional(),
  url: z.string().optional(),
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
  params: Promise<{ datasetId: string }>;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { datasetId } = await params;
  const row = await getDataset(datasetId, user.userId);
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ dataset: row });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { datasetId } = await params;
  const existing = await getDataset(datasetId, user.userId);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  if (d.name !== undefined) {
    const nameErr = validateDatasetName(d.name);
    if (nameErr) return NextResponse.json({ error: nameErr }, { status: 400 });
  }
  if (d.url !== undefined && !isValidDatasetUrl(d.url)) {
    return NextResponse.json(
      { error: 'url must be a valid http(s) URL' },
      { status: 400 },
    );
  }
  if (d.kind !== undefined) {
    const kindErr = validateDatasetKind(d.kind);
    if (kindErr) return NextResponse.json({ error: kindErr }, { status: 400 });
  }

  // Detect the audit shape — archive / restore / generic update.
  const flipsToArchived =
    d.archived === true && existing.archived === false;
  const flipsToRestored =
    d.archived === false && existing.archived === true;

  const patch: Parameters<typeof updateDataset>[2] = {};
  if (d.name !== undefined) patch.name = d.name.trim();
  if (d.url !== undefined) patch.url = d.url.trim();
  if (d.kind !== undefined) patch.kind = d.kind as DatasetKind;
  if (d.version !== undefined) patch.version = d.version;
  if (d.sizeBytes !== undefined) patch.sizeBytes = d.sizeBytes;
  if (d.checksum !== undefined) patch.checksum = d.checksum;
  if (d.archived !== undefined) patch.archived = d.archived;
  if (d.publishedDoi !== undefined) patch.publishedDoi = d.publishedDoi;
  if (d.notesMd !== undefined) patch.notesMd = d.notesMd;
  if (d.tags !== undefined) patch.tags = normalizeDatasetTags(d.tags);
  if (d.metadata !== undefined) patch.metadata = d.metadata;

  const next = await updateDataset(datasetId, user.userId, patch);
  if (!next) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let action = 'research.dataset.updated';
  if (flipsToArchived) action = 'research.dataset.archived';
  else if (flipsToRestored) action = 'research.dataset.restored';

  await recordAudit({
    actorId: user.userId,
    action,
    payload: { experimentId: existing.experimentId, datasetId },
    projectId: existing.experimentId,
  });

  return NextResponse.json({ dataset: next });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { datasetId } = await params;
  const existing = await getDataset(datasetId, user.userId);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const ok = await deleteDataset(datasetId, user.userId);
  if (!ok) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: user.userId,
    action: 'research.dataset.deleted',
    payload: { experimentId: existing.experimentId, datasetId },
    projectId: existing.experimentId,
  });
  return NextResponse.json({ ok: true });
}

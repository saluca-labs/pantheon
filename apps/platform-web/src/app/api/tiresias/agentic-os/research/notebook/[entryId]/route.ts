/**
 * Research OS Phase 2 — Single notebook entry route.
 *
 * `GET    /api/tiresias/agentic-os/research/notebook/:entryId`
 *   Fetch one entry. 404 when the entry doesn't exist OR belongs to
 *   another user's experiment (cross-ownership via JOIN).
 *
 * `PATCH  /api/tiresias/agentic-os/research/notebook/:entryId`
 *   Partial update. `experiment_id`, `id`, `user_id`, timestamps,
 *   and `archived_at` are NOT patchable. `entry_at` IS patchable
 *   (the backfill use case).
 *
 * `DELETE /api/tiresias/agentic-os/research/notebook/:entryId`
 *   Soft-archive (sets `archived_at = now()`). NO hard delete.
 *
 * Slug name: `[entryId]` — independent of the Phase 1
 * `experiments/[id]` namespace; no collision risk. The variable
 * matches the slug 1:1.
 *
 * @license MIT — Tiresias Research OS Phase 2 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import {
  getNotebookEntry,
  updateNotebookEntry,
  archiveNotebookEntry,
} from '@/lib/agentic-os/research/notebook-entries-repo';
import { ENTRY_KINDS, type EntryKind } from '@/lib/agentic-os/research/entry-kinds';

const PatchBody = z.object({
  entry_kind: z
    .enum(ENTRY_KINDS as unknown as [string, ...string[]])
    .optional(),
  title: z.string().min(1).max(300).optional(),
  body_md: z.string().max(50_000).optional(),
  attached_urls: z
    .array(z.string().url().max(4000))
    .max(50)
    .optional(),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
  entry_at: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ entryId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { entryId } = await params;
  const entry = await getNotebookEntry(entryId, user.userId);
  if (!entry) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ entry });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { entryId } = await params;

  // Cross-ownership probe up-front — explicit 404 before any UPDATE.
  const existing = await getNotebookEntry(entryId, user.userId);
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
  const entry = await updateNotebookEntry(entryId, user.userId, {
    entryKind: d.entry_kind as EntryKind | undefined,
    title: d.title,
    bodyMd: d.body_md,
    attachedUrls: d.attached_urls,
    tags: d.tags,
    entryAt: d.entry_at,
    metadata: d.metadata,
  });
  if (!entry) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'research.notebook.updated',
    payload: {
      entryId,
      experimentId: entry.experimentId,
      fields: Object.keys(d),
    },
    projectId: entry.experimentId,
  });

  return NextResponse.json({ entry });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { entryId } = await params;

  const existing = await getNotebookEntry(entryId, user.userId);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const archived = await archiveNotebookEntry(entryId, user.userId);
  if (!archived) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'research.notebook.archived',
    payload: { entryId, experimentId: archived.experimentId },
    projectId: archived.experimentId,
  });

  return NextResponse.json({ entry: archived });
}

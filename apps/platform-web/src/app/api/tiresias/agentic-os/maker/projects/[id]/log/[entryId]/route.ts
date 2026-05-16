/**
 * Maker OS — /api/tiresias/agentic-os/maker/projects/[id]/log/[entryId]
 *
 * GET    — fetch one log entry.
 * PATCH  — partial update (body and/or attached_urls).
 * DELETE — remove one log entry.
 *
 * @license MIT — Tiresias Maker OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  getLogEntry,
  updateLogEntry,
  deleteLogEntry,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';
import { ATTACHED_URL_KINDS, type BuildLogEntryPatch } from '@/lib/agentic-os/maker/log';

const AttachedUrlSchema = z.object({
  url: z.string().min(1).max(2000),
  kind: z.enum(ATTACHED_URL_KINDS as unknown as [string, ...string[]]),
  label: z.string().max(200).optional(),
});

const PatchBody = z.object({
  body: z.string().min(1).max(4000).optional(),
  attachedUrls: z.array(AttachedUrlSchema).max(25).optional(),
});

interface Props {
  params: Promise<{ id: string; entryId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId, entryId } = await params;
  try {
    const entry = await getLogEntry(entryId, projectId, user.userId);
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ entry });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not found' },
      { status: 404 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId, entryId } = await params;

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const entry = await updateLogEntry(entryId, projectId, user.userId, parsed.data as BuildLogEntryPatch);
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.log_entry.updated',
      payload: { projectId, entryId, fields: Object.keys(parsed.data) },
      projectId,
    });
    return NextResponse.json({ entry });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update log entry' },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId, entryId } = await params;
  try {
    const removed = await deleteLogEntry(entryId, projectId, user.userId);
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.log_entry.deleted',
      payload: { projectId, entryId },
      projectId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 400 },
    );
  }
}

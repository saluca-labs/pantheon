/**
 * Maker OS — /api/tiresias/agentic-os/maker/projects/[id]/log
 *
 * GET  — list log entries for the project, newest first. Optional filters:
 *          ?stepId=<uuid>   — restrict to a single build step
 *          ?limit=<int>     — default 50, max 200
 *          ?before=<iso>    — keyset cursor (created_at < before)
 * POST — append a new log entry. Body required; stepId + attachedUrls
 *        optional. author_id is set automatically from the session.
 *
 * @license MIT — Tiresias Maker OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  listLogEntries,
  createLogEntry,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';
import { ATTACHED_URL_KINDS, type BuildLogEntryUpsert } from '@/lib/agentic-os/maker/log';

const AttachedUrlSchema = z.object({
  url: z.string().min(1).max(2000),
  kind: z.enum(ATTACHED_URL_KINDS as unknown as [string, ...string[]]),
  label: z.string().max(200).optional(),
});

const CreateBody = z.object({
  body: z.string().min(1).max(4000),
  stepId: z.string().uuid().nullable().optional(),
  attachedUrls: z.array(AttachedUrlSchema).max(25).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId } = await params;
  const stepId = request.nextUrl.searchParams.get('stepId');
  const limitParam = request.nextUrl.searchParams.get('limit');
  const before = request.nextUrl.searchParams.get('before');
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 50;

  try {
    const entries = await listLogEntries({
      projectId,
      userId: user.userId,
      stepId: stepId ?? undefined,
      limit: Number.isFinite(limit) ? limit : 50,
      before: before ?? undefined,
    });
    return NextResponse.json({ entries });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not found' },
      { status: 404 },
    );
  }
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId } = await params;

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const entry = await createLogEntry(projectId, user.userId, parsed.data as BuildLogEntryUpsert);
    await recordAudit({
      actorId: user.userId,
      action: 'maker.log_entry.created',
      payload: {
        projectId,
        entryId: entry.id,
        stepId: entry.stepId,
        attachmentCount: entry.attachedUrls.length,
      },
      projectId,
    });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create log entry' },
      { status: 400 },
    );
  }
}

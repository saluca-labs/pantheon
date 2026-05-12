/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/voice-samples/[id]
 *
 * GET    — fetch a single sample by id.
 * PATCH  — partial update. Setting `isArchived` flips the soft-archive
 *          flag; the route emits a distinct audit action for archive /
 *          unarchive transitions so the timeline reflects the intent.
 * DELETE — hard delete.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';
import {
  deleteVoiceSample,
  getVoiceSample,
  updateVoiceSample,
} from '@/lib/agentic-os/autobiographer/voice-samples-repo';
import {
  VOICE_SAMPLE_BODY_MAX,
  VOICE_SAMPLE_TITLE_MAX,
} from '@/lib/agentic-os/autobiographer/voice-samples';

const PatchBody = z.object({
  title: z.string().max(VOICE_SAMPLE_TITLE_MAX).nullable().optional(),
  bodyText: z.string().min(1).max(VOICE_SAMPLE_BODY_MAX).optional(),
  isArchived: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sample = await getVoiceSample(id, user.userId);
  if (!sample) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ sample });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Capture prior state so the audit row can distinguish archive vs unarchive.
  const before = await getVoiceSample(id, user.userId);
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const d = parsed.data;
  const sample = await updateVoiceSample(id, user.userId, d);
  if (!sample) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let action: string = 'autobiographer.voice_sample.updated';
  const payload: Record<string, unknown> = {
    voiceSampleId: id,
    fields: Object.keys(d),
  };
  if (d.isArchived !== undefined && d.isArchived !== before.isArchived) {
    action = d.isArchived
      ? 'autobiographer.voice_sample.archived'
      : 'autobiographer.voice_sample.unarchived';
  }

  await recordAudit({
    actorId: user.userId,
    action,
    payload,
    projectId: null,
  });

  return NextResponse.json({ sample });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  // Fetch first so the audit captures memoryId for the timeline.
  const before = await getVoiceSample(id, user.userId);
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const removed = await deleteVoiceSample(id, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.voice_sample.deleted',
    payload: {
      voiceSampleId: id,
      memoryId: before.memoryId,
      wordCount: before.wordCount,
    },
    projectId: null,
  });

  return NextResponse.json({ ok: true });
}

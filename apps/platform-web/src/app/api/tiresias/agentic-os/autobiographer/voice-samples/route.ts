/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/voice-samples
 *
 * GET  — list the caller's voice samples. Filters:
 *        ?is_archived=true|false ?q=<substring> ?memory_backed=true|false.
 *        Pagination ?limit= ?offset=.
 * POST — create a new sample. Body accepts `memoryId?` for backed
 *        samples and `bodyText` for the prose itself. When `memoryId`
 *        is set, ownership of the memory is verified server-side first
 *        — a foreign memory returns 404 (no-existence-leak property).
 *
 * Audited (`autobiographer.voice_sample.created`).
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';
import {
  createVoiceSample,
  listVoiceSamples,
} from '@/lib/agentic-os/autobiographer/voice-samples-repo';
import {
  VOICE_SAMPLE_BODY_MAX,
  VOICE_SAMPLE_TITLE_MAX,
} from '@/lib/agentic-os/autobiographer/voice-samples';
import { getMemory } from '@/lib/agentic-os/autobiographer/memories-repo';

const PostBody = z.object({
  memoryId: z.string().uuid().nullable().optional(),
  title: z.string().max(VOICE_SAMPLE_TITLE_MAX).nullable().optional(),
  bodyText: z.string().min(1).max(VOICE_SAMPLE_BODY_MAX),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function parseBool(s: string | null): boolean | undefined {
  if (s === null) return undefined;
  if (s === 'true') return true;
  if (s === 'false') return false;
  return undefined;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const isArchived = parseBool(url.searchParams.get('is_archived'));
  const memoryBacked = parseBool(url.searchParams.get('memory_backed'));
  const q = url.searchParams.get('q') ?? undefined;
  const limit = url.searchParams.get('limit');
  const offset = url.searchParams.get('offset');

  const samples = await listVoiceSamples({
    userId: user.userId,
    isArchived,
    memoryBacked,
    q,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });
  return NextResponse.json({ samples });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = PostBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  // No-existence-leak: if memoryId is supplied but doesn't belong to the
  // caller, return 404 with the same shape as a missing memory.
  if (d.memoryId) {
    const memory = await getMemory(d.memoryId, user.userId);
    if (!memory) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  const sample = await createVoiceSample(user.userId, {
    memoryId: d.memoryId ?? null,
    title: d.title ?? null,
    bodyText: d.bodyText,
    metadata: d.metadata,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.voice_sample.created',
    payload: {
      voiceSampleId: sample.id,
      memoryId: sample.memoryId,
      wordCount: sample.wordCount,
    },
    projectId: null,
  });

  return NextResponse.json({ sample }, { status: 201 });
}

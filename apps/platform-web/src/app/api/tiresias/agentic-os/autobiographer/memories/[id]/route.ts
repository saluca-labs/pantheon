/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/memories/[id]
 *
 * GET    — fetch one memory.
 * PATCH  — partial update. Audited. If patch reassigns bookId, the new
 *          book is validated for ownership; passing `bookId: null` detaches.
 * DELETE — hard delete. Memories are precious; UI should confirm.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import {
  getMemory,
  updateMemory,
  deleteMemory,
} from '@/lib/agentic-os/autobiographer/memories-repo';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';
import { MEMORY_SOURCES } from '@/lib/agentic-os/autobiographer/memories';
import { SENSITIVE_KINDS } from '@/lib/agentic-os/autobiographer/sensitive-kinds';

const PatchBody = z.object({
  bookId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(500).optional(),
  bodyMarkdown: z.string().min(1).max(200_000).optional(),
  transcript: z.string().max(500_000).nullable().optional(),
  audioUrl: z.string().url().max(2000).nullable().optional(),
  photoUrls: z.array(z.string().url().max(2000)).max(20).optional(),
  whenInLife: z.string().max(500).nullable().optional(),
  eraDateEstimate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  location: z.string().max(500).nullable().optional(),
  emotionTags: z.array(z.string().min(1).max(60)).max(30).optional(),
  contentTags: z.array(z.string().min(1).max(60)).max(30).optional(),
  isSensitive: z.boolean().optional(),
  source: z.enum(MEMORY_SOURCES as unknown as [string, ...string[]]).optional(),
  // Phase 6 — whitelisted sensitive-kind tags. The Zod enum rejects
  // unknown values at the route boundary before the repo's strict
  // validator sees them. The Phase 1 schema was NOT .strict() so we
  // simply whitelist the new field here.
  sensitiveKinds: z
    .array(z.enum(SENSITIVE_KINDS as unknown as [string, ...string[]]))
    .max(SENSITIVE_KINDS.length)
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const memory = await getMemory(id, user.userId);
  if (!memory) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ memory });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const raw = await request.json().catch(() => null);
  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const memory = await updateMemory(id, user.userId, parsed.data as any);
    if (!memory) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const fields = Object.keys(parsed.data);
    // Phase 6 — surface a dedicated audit action when the patch only
    // touches sensitive_kinds. When the patch touches multiple fields
    // (including sensitive_kinds), the generic .updated action wins
    // but the field list still carries the signal.
    const isSensitiveKindsOnly =
      fields.length === 1 && fields[0] === 'sensitiveKinds';
    await recordAudit({
      actorId: user.userId,
      action: isSensitiveKindsOnly
        ? 'autobiographer.memory.sensitive_kinds_updated'
        : 'autobiographer.memory.updated',
      payload: {
        memoryId: id,
        fields,
        ...(parsed.data.sensitiveKinds !== undefined
          ? { sensitiveKinds: parsed.data.sensitiveKinds }
          : {}),
      },
      projectId: memory.bookId ?? null,
    });

    return NextResponse.json({ memory });
  } catch (err: unknown) {
    if (!(err instanceof Error)) throw err;
    const errErr = err as Error & { code?: string; constraint?: string };
    if (errErr?.code === 'book_not_found') {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  // Fetch first so we can record bookId on the audit row before the row is gone.
  const before = await getMemory(id, user.userId);
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const removed = await deleteMemory(id, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.memory.deleted',
    payload: { memoryId: id, bookId: before.bookId },
    projectId: before.bookId ?? null,
  });

  return NextResponse.json({ ok: true });
}

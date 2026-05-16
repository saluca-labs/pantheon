/**
 * Maker OS — /api/tiresias/agentic-os/maker/references
 *
 * GET  — list references for the authenticated user. Filters:
 *        ?kind= (paper|tutorial|standard|article|video|book|link|other),
 *        ?tag= (single tag match against the GIN-indexed tags array).
 * POST — create a new reference.
 *
 * Auth + audit on every handler. Underlying table: ``agos_maker_references``.
 *
 * @license MIT — Tiresias Maker OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  listReferences,
  createReference,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';
import {
  REFERENCE_KIND_VALUES,
  type ReferenceKind,
  type ReferenceUpsert,
} from '@/lib/agentic-os/maker/references';

const ReferenceBody = z.object({
  title: z.string().min(1).max(300),
  kind: z.enum(REFERENCE_KIND_VALUES as unknown as [string, ...string[]]).optional(),
  url: z.string().min(1).max(2000),
  authors: z.string().max(500).nullable().optional(),
  publisher: z.string().max(300).nullable().optional(),
  publishedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  notes: z.string().max(8000).nullable().optional(),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const kindParam = sp.get('kind');
  const kind = kindParam ? (kindParam as ReferenceKind) : undefined;
  if (kind && !(REFERENCE_KIND_VALUES as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
  }
  const tag = sp.get('tag') ?? undefined;

  const references = await listReferences({ userId: user.userId, kind, tag });
  return NextResponse.json({ references });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = ReferenceBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const reference = await createReference(user.userId, parsed.data as ReferenceUpsert);
    await recordAudit({
      actorId: user.userId,
      action: 'maker.reference.created',
      payload: {
        referenceId: reference.id,
        title: reference.title,
        kind: reference.kind,
      },
    });
    return NextResponse.json({ reference }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create reference' },
      { status: 400 },
    );
  }
}

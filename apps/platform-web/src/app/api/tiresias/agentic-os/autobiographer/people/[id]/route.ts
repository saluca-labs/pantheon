/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/people/[id]
 *
 * GET    — fetch one person + joined memory count.
 * PATCH  — partial update. Audited. 409 if a canonical_name change
 *          collides with another person owned by the caller.
 * DELETE — hard delete. The N:M join cascades; audit records the prior
 *          consent state for the timeline.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import {
  getPerson,
  getPersonWithCounts,
  updatePerson,
  deletePerson,
} from '@/lib/agentic-os/autobiographer/people-repo';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';
import {
  CONSENT_STATES,
} from '@/lib/agentic-os/autobiographer/people';

const PatchBody = z.object({
  canonicalName: z.string().min(1).max(500).optional(),
  aliases: z.array(z.string().min(1).max(200)).max(30).optional(),
  relation: z.string().max(200).nullable().optional(),
  birthYear: z.number().int().min(1).max(9999).nullable().optional(),
  deathYear: z.number().int().min(1).max(9999).nullable().optional(),
  consentToPublish: z
    .enum(CONSENT_STATES as unknown as [string, ...string[]])
    .optional(),
  consentRecordedAt: z.string().datetime().nullable().optional(),
  consentRecordedBy: z.string().max(500).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  imageUrl: z.string().url().max(2000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const person = await getPersonWithCounts(id, user.userId);
  if (!person) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ person });
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

  const d = parsed.data;
  try {
    const person = await updatePerson(id, user.userId, d as any);
    if (!person) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await recordAudit({
      actorId: user.userId,
      action: 'autobiographer.person.updated',
      payload: { personId: id, fields: Object.keys(d) },
      projectId: id,
    });

    return NextResponse.json({ person });
  } catch (err: any) {
    if (err?.code === 'duplicate_name') {
      return NextResponse.json(
        { error: 'A person with that canonical name already exists.' },
        { status: 409 },
      );
    }
    throw err;
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  // Fetch first so we can capture the canonical_name + consent state for the
  // audit row before the row is gone (and verify ownership).
  const before = await getPerson(id, user.userId);
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const removed = await deletePerson(id, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.person.deleted',
    payload: {
      personId: id,
      canonicalName: before.canonicalName,
      consentToPublish: before.consentToPublish,
    },
    projectId: id,
  });

  return NextResponse.json({ ok: true });
}

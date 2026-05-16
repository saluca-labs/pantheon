/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/people
 *
 * GET  — list user's people. Filters: ?consent_to_publish= ?relation= ?q=.
 *        Pagination ?limit= ?offset=.
 * POST — create a new person. 409 on duplicate canonical_name per user.
 *        Audited (action=autobiographer.person.created).
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import {
  listPeople,
  createPerson,
} from '@/lib/agentic-os/autobiographer/people-repo';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';
import {
  CONSENT_STATES,
  type ConsentState,
} from '@/lib/agentic-os/autobiographer/people';

const PersonBody = z.object({
  canonicalName: z.string().min(1).max(500),
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

export async function GET(request: NextRequest) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const consent = url.searchParams.get('consent_to_publish') ?? undefined;
  const relation = url.searchParams.get('relation') ?? undefined;
  const q = url.searchParams.get('q') ?? undefined;
  const limit = url.searchParams.get('limit');
  const offset = url.searchParams.get('offset');

  if (consent && !(CONSENT_STATES as readonly string[]).includes(consent)) {
    return NextResponse.json(
      { error: `Invalid consent_to_publish: ${consent}` },
      { status: 400 },
    );
  }

  const people = await listPeople({
    userId: user.userId,
    consentToPublish: consent as ConsentState | undefined,
    relation,
    q,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });
  return NextResponse.json({ people });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = PersonBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  try {
    const person = await createPerson(user.userId, {
      canonicalName: d.canonicalName,
      aliases: d.aliases,
      relation: d.relation ?? null,
      birthYear: d.birthYear ?? null,
      deathYear: d.deathYear ?? null,
      consentToPublish: d.consentToPublish as ConsentState | undefined,
      consentRecordedAt: d.consentRecordedAt ?? null,
      consentRecordedBy: d.consentRecordedBy ?? null,
      notes: d.notes ?? null,
      imageUrl: d.imageUrl ?? null,
      metadata: d.metadata,
    });

    await recordAudit({
      actorId: user.userId,
      action: 'autobiographer.person.created',
      payload: { personId: person.id, canonicalName: person.canonicalName },
      projectId: person.id,
    });

    return NextResponse.json({ person }, { status: 201 });
  } catch (err: unknown) {
    if (!(err instanceof Error)) throw err;
    const errErr = err as Error & { code?: string; constraint?: string };
    if (errErr?.code === 'duplicate_name') {
      return NextResponse.json(
        { error: 'A person with that canonical name already exists.' },
        { status: 409 },
      );
    }
    throw err;
  }
}

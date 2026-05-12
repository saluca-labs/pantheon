/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/people/[id]/consent
 *
 * POST — convenience that flips `consent_to_publish` and stamps
 *        `consent_recorded_at = now()` + `consent_recorded_by = body.recorded_by`
 *        in a single UPDATE. Audited
 *        (action=autobiographer.person.consent_recorded). Returns the
 *        refreshed person row.
 *
 * Body shape:
 *   { state: ConsentState, recordedBy?: string }
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { recordConsent } from '@/lib/agentic-os/autobiographer/people-repo';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';
import {
  CONSENT_STATES,
  type ConsentState,
} from '@/lib/agentic-os/autobiographer/people';

const ConsentBody = z.object({
  state: z.enum(CONSENT_STATES as unknown as [string, ...string[]]),
  recordedBy: z.string().max(500).nullable().optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const parsed = ConsentBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const person = await recordConsent(
    id,
    user.userId,
    parsed.data.state as ConsentState,
    parsed.data.recordedBy ?? null,
  );
  if (!person) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.person.consent_recorded',
    payload: {
      personId: id,
      state: parsed.data.state,
      recordedBy: parsed.data.recordedBy ?? null,
    },
    projectId: id,
  });

  return NextResponse.json({ person });
}

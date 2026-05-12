/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/voice-profiles/[id]/activate
 *
 * POST — convenience that flips `is_active = true` on this profile and
 *        `is_active = false` on every other profile owned by the
 *        caller, atomically. The repo enforces ownership and the
 *        partial-UNIQUE invariant under concurrent activations is
 *        preserved by the transaction wrapped around both updates.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';
import { activateProfile } from '@/lib/agentic-os/autobiographer/voice-profiles-repo';

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const profile = await activateProfile(id, user.userId);
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.voice_profile.activated',
    payload: {
      voiceProfileId: id,
      version: profile.version,
    },
    projectId: null,
  });

  return NextResponse.json({ profile });
}

/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/voice-profiles/[id]
 *
 * GET    — fetch one profile by id.
 * PATCH  — edit `style_summary`, `style_adjectives`, `style_rules`,
 *          `example_openings`, or `metadata`. `is_active` is NOT
 *          editable here — callers use `/activate` so the single-active
 *          invariant is preserved atomically.
 * DELETE — soft archive (flip `is_active=false` if active) then hard
 *          delete the row. The audit row captures the prior version +
 *          activation state.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';
import {
  deactivateProfile,
  deleteVoiceProfile,
  getVoiceProfile,
  updateVoiceProfile,
} from '@/lib/agentic-os/autobiographer/voice-profiles-repo';
import {
  EXAMPLE_OPENINGS_MAX,
  STYLE_ADJECTIVE_MAX,
  STYLE_RULES_MAX,
  STYLE_SUMMARY_MAX,
} from '@/lib/agentic-os/autobiographer/voice-profiles';

const PatchBody = z.object({
  styleSummary: z.string().min(20).max(STYLE_SUMMARY_MAX).optional(),
  styleAdjectives: z
    .array(z.string().min(1).max(40))
    .max(STYLE_ADJECTIVE_MAX)
    .optional(),
  styleRules: z
    .array(z.string().min(2).max(240))
    .max(STYLE_RULES_MAX)
    .optional(),
  exampleOpenings: z
    .array(z.string().min(1).max(600))
    .max(EXAMPLE_OPENINGS_MAX)
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
  const profile = await getVoiceProfile(id, user.userId);
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ profile });
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

  const profile = await updateVoiceProfile(id, user.userId, parsed.data);
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.voice_profile.updated',
    payload: {
      voiceProfileId: id,
      version: profile.version,
      fields: Object.keys(parsed.data),
    },
    projectId: null,
  });

  return NextResponse.json({ profile });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  // Capture state for the audit row first.
  const before = await getVoiceProfile(id, user.userId);
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Soft archive then hard delete — flip the active bit first so a
  // simultaneous read can't observe the row as both active and deleted.
  if (before.isActive) {
    await deactivateProfile(id, user.userId);
  }
  const removed = await deleteVoiceProfile(id, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.voice_profile.deleted',
    payload: {
      voiceProfileId: id,
      version: before.version,
      wasActive: before.isActive,
    },
    projectId: null,
  });

  return NextResponse.json({ ok: true });
}

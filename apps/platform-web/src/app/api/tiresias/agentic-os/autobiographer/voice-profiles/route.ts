/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/voice-profiles
 *
 * GET  — list the caller's voice profiles, version DESC.
 * POST — build a new profile from the caller's non-archived voice
 *        samples. Fires the Phase 3 two-stage builder (per-sample
 *        analysis → multi-sample aggregation) and inserts the result
 *        as a new versioned row. If the caller has no active samples,
 *        returns 400. If `ANTHROPIC_API_KEY` is not set, returns 503
 *        with `coach_not_configured`.
 *
 * Audited (`autobiographer.voice_profile.built`).
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';
import {
  insertVoiceProfile,
  listVoiceProfiles,
} from '@/lib/agentic-os/autobiographer/voice-profiles-repo';
import { listSamplesForBuilder } from '@/lib/agentic-os/autobiographer/voice-samples-repo';
import {
  VoiceBuilderError,
  buildVoiceProfile,
} from '@/lib/agentic-os/autobiographer/voice/builder';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BuildBody = z.object({
  /** Optional attribution string (e.g. coach session id, model slug, "manual"). */
  builder: z.string().min(1).max(200).optional(),
  /** When true, immediately mark the new profile active. Default false. */
  setActive: z.boolean().optional(),
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
  const isActive = parseBool(url.searchParams.get('is_active'));
  const limit = url.searchParams.get('limit');
  const offset = url.searchParams.get('offset');

  const profiles = await listVoiceProfiles({
    userId: user.userId,
    isActive,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });
  return NextResponse.json({ profiles });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = BuildBody.safeParse(
    await request.json().catch(() => ({})),
  );
  // Build body is fully optional — only reject explicitly invalid shapes.
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const samples = await listSamplesForBuilder(user.userId);
  if (samples.length === 0) {
    return NextResponse.json(
      {
        error: 'no_samples',
        message:
          'No active voice samples to build from. Add at least one sample and unarchive it before building.',
      },
      { status: 400 },
    );
  }

  let built;
  try {
    built = await buildVoiceProfile({
      samples,
      builderAttribution: parsed.data.builder ?? 'coach',
    });
  } catch (err) {
    if (err instanceof VoiceBuilderError) {
      if (err.code === 'coach_not_configured') {
        return NextResponse.json(
          { error: err.code, message: err.message },
          { status: 503 },
        );
      }
      if (err.code === 'no_samples') {
        return NextResponse.json(
          { error: err.code, message: err.message },
          { status: 400 },
        );
      }
    }
    throw err;
  }

  const profile = await insertVoiceProfile(user.userId, {
    styleSummary: built.styleSummary,
    styleAdjectives: built.styleAdjectives,
    styleRules: built.styleRules,
    exampleOpenings: built.exampleOpenings,
    sampleCount: built.sampleCount,
    sampleWordCount: built.sampleWordCount,
    builder: built.builder,
    setActive: parsed.data.setActive === true,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.voice_profile.built',
    payload: {
      voiceProfileId: profile.id,
      version: profile.version,
      sampleCount: profile.sampleCount,
      sampleWordCount: profile.sampleWordCount,
      setActive: profile.isActive,
    },
    projectId: null,
  });

  return NextResponse.json({ profile }, { status: 201 });
}

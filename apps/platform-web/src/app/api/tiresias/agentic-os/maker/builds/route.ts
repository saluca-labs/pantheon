/**
 * Maker OS — /api/tiresias/agentic-os/maker/builds
 *
 * GET  — list all builds for the authenticated user.
 * POST — create a new build.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { listBuilds, createBuild, recordAudit } from '@/lib/agentic-os/maker/repo';

const BuildBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(['planning', 'in_progress', 'on_hold', 'complete', 'archived']).optional(),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
});

export async function GET() {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const builds = await listBuilds(user.userId);
  return NextResponse.json({ builds });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = BuildBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const build = await createBuild(user.userId, parsed.data);
  await recordAudit({ actorId: user.userId, action: 'maker.build.created', payload: { buildId: build.id } });

  return NextResponse.json({ build }, { status: 201 });
}

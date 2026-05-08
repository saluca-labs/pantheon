/**
 * BFF — Agentic OS per-user feature flags.
 *
 * GET  /api/tiresias/agentic-os/flags
 *   → { flags: { [slug]: boolean } }   (all 9 slugs always present)
 *
 * PUT  /api/tiresias/agentic-os/flags
 *   body: { slug: string, enabled: boolean }
 *   → { flags: { [slug]: boolean } }   (full updated map)
 *
 * @license MIT — Tiresias Agentic OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFlagsUser } from '@/lib/agentic-os/flags/session';
import { getFlags, setFlag, recordFlagsAudit, ALL_SLUGS } from '@/lib/agentic-os/flags/repo';

const PutBody = z.object({
  slug: z.string(),
  enabled: z.boolean(),
});

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentFlagsUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const flags = await getFlags(user.userId);
  return NextResponse.json({ flags });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentFlagsUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = PutBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { slug, enabled } = parsed.data;

  // Validate slug against registry (setFlag also validates; this gives a
  // cleaner HTTP 400 instead of a 500).
  if (!(ALL_SLUGS as string[]).includes(slug)) {
    return NextResponse.json(
      { error: `Unknown OS slug: "${slug}". Valid slugs: ${ALL_SLUGS.join(', ')}` },
      { status: 400 },
    );
  }

  await setFlag(user.userId, slug, enabled);

  await recordFlagsAudit({
    actorId: user.userId,
    action: 'flags.set',
    payload: { slug, enabled },
  });

  const flags = await getFlags(user.userId);
  return NextResponse.json({ flags });
}

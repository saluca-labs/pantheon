/**
 * Research OS Phase 5 — protocol version-bump route.
 *
 * POST /api/tiresias/agentic-os/research/protocols/:id/versions
 *   Create a new revision row with `parent_protocol_id` pointing at
 *   the root of the source's tree (we normalize via `bumpParentFor`
 *   so the tree stays flat). Body: { version, body_md, notes? }.
 *
 *   Returns the new row.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import {
  getProtocol,
  bumpProtocolVersion,
} from '@/lib/agentic-os/research/protocols-repo';
import { validateProtocolVersion } from '@/lib/agentic-os/research/protocols';

const BumpBody = z.object({
  version: z.string(),
  bodyMd: z.string().max(200000),
  notes: z.string().max(2000).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const source = await getProtocol(id, user.userId);
  if (!source) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const parsed = BumpBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const verErr = validateProtocolVersion(d.version);
  if (verErr) return NextResponse.json({ error: verErr }, { status: 400 });

  const next = await bumpProtocolVersion(id, user.userId, {
    version: d.version.trim(),
    bodyMd: d.bodyMd,
    notes: d.notes,
  });
  if (!next) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'research.protocol.version_bumped',
    payload: {
      sourceProtocolId: id,
      newProtocolId: next.id,
      fromVersion: source.version,
      toVersion: next.version,
    },
  });

  return NextResponse.json({ protocol: next }, { status: 201 });
}

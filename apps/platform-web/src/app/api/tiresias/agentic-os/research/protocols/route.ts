/**
 * Research OS Phase 5 — protocols collection route.
 *
 * GET  /api/tiresias/agentic-os/research/protocols
 *   Filterable by ?kind, ?tag, ?q (title ILIKE). Returns ROOT rows
 *   only by default — the library page lists one card per tree. Pass
 *   ?roots=false to surface every revision.
 *
 * POST /api/tiresias/agentic-os/research/protocols
 *   Create a new root protocol. version defaults to '1.0'.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import {
  listProtocols,
  createProtocol,
} from '@/lib/agentic-os/research/protocols-repo';
import {
  normalizeAttachedUrls,
  normalizeProtocolTags,
  validateProtocolKind,
  validateProtocolTitle,
  validateProtocolVersion,
} from '@/lib/agentic-os/research/protocols';
import { PROTOCOL_KINDS, type ProtocolKind } from '@/lib/agentic-os/research/protocol-kinds';

const CreateBody = z.object({
  title: z.string(),
  version: z.string().optional(),
  bodyMd: z.string().max(200000).optional(),
  kind: z.enum(PROTOCOL_KINDS as unknown as [string, ...string[]]).optional(),
  attachedUrls: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(request.url);
  const opts: Parameters<typeof listProtocols>[1] = {};
  const kindParam = url.searchParams.get('kind');
  if (kindParam) {
    const err = validateProtocolKind(kindParam);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    opts.kind = kindParam as ProtocolKind;
  }
  const tagParam = url.searchParams.get('tag');
  if (tagParam) opts.tag = tagParam;
  const q = url.searchParams.get('q');
  if (q) opts.q = q;
  const roots = url.searchParams.get('roots');
  if (roots === 'false') opts.rootsOnly = false;

  const protocols = await listProtocols(user.userId, opts);
  return NextResponse.json({ protocols });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const titleErr = validateProtocolTitle(d.title);
  if (titleErr) return NextResponse.json({ error: titleErr }, { status: 400 });

  if (d.version !== undefined) {
    const verErr = validateProtocolVersion(d.version);
    if (verErr) return NextResponse.json({ error: verErr }, { status: 400 });
  }
  if (d.kind !== undefined) {
    const kindErr = validateProtocolKind(d.kind);
    if (kindErr) return NextResponse.json({ error: kindErr }, { status: 400 });
  }

  const protocol = await createProtocol(user.userId, {
    title: d.title.trim(),
    version: d.version?.trim(),
    bodyMd: d.bodyMd ?? '',
    kind: d.kind as ProtocolKind | undefined,
    attachedUrls: normalizeAttachedUrls(d.attachedUrls),
    tags: normalizeProtocolTags(d.tags),
    metadata: d.metadata ?? {},
  });

  await recordAudit({
    actorId: user.userId,
    action: 'research.protocol.created',
    payload: { protocolId: protocol.id, kind: protocol.kind, version: protocol.version },
  });

  return NextResponse.json({ protocol }, { status: 201 });
}

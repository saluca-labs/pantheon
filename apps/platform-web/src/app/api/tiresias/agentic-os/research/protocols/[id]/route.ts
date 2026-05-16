/**
 * Research OS Phase 5 — single-protocol route.
 *
 * GET    /api/tiresias/agentic-os/research/protocols/:id
 *   Returns the protocol + its version-chain (via parent_protocol_id walk).
 * PATCH  /api/tiresias/agentic-os/research/protocols/:id
 *   Updates a single row's mutable fields (NOT parent_protocol_id —
 *   that's set only by the version-bump path).
 * DELETE /api/tiresias/agentic-os/research/protocols/:id
 *   Hard delete. The experiment_protocols join FK CASCADE removes any pins.
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
  getProtocolTree,
  updateProtocol,
  deleteProtocol,
} from '@/lib/agentic-os/research/protocols-repo';
import {
  normalizeAttachedUrls,
  normalizeProtocolTags,
  validateProtocolKind,
  validateProtocolTitle,
  validateProtocolVersion,
} from '@/lib/agentic-os/research/protocols';
import { PROTOCOL_KINDS, type ProtocolKind } from '@/lib/agentic-os/research/protocol-kinds';

const PatchBody = z.object({
  title: z.string().optional(),
  version: z.string().optional(),
  bodyMd: z.string().max(200000).optional(),
  kind: z.enum(PROTOCOL_KINDS as unknown as [string, ...string[]]).optional(),
  attachedUrls: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const protocol = await getProtocol(id, user.userId);
  if (!protocol) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const versions = await getProtocolTree(id, user.userId);
  return NextResponse.json({ protocol, versions });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const existing = await getProtocol(id, user.userId);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  if (d.title !== undefined) {
    const err = validateProtocolTitle(d.title);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }
  if (d.version !== undefined) {
    const err = validateProtocolVersion(d.version);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }
  if (d.kind !== undefined) {
    const err = validateProtocolKind(d.kind);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }

  const patch: Parameters<typeof updateProtocol>[2] = {};
  if (d.title !== undefined) patch.title = d.title.trim();
  if (d.version !== undefined) patch.version = d.version.trim();
  if (d.bodyMd !== undefined) patch.bodyMd = d.bodyMd;
  if (d.kind !== undefined) patch.kind = d.kind as ProtocolKind;
  if (d.attachedUrls !== undefined) {
    patch.attachedUrls = normalizeAttachedUrls(d.attachedUrls);
  }
  if (d.tags !== undefined) patch.tags = normalizeProtocolTags(d.tags);
  if (d.metadata !== undefined) patch.metadata = d.metadata;

  const next = await updateProtocol(id, user.userId, patch);
  if (!next) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: user.userId,
    action: 'research.protocol.updated',
    payload: { protocolId: id },
  });
  return NextResponse.json({ protocol: next });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const existing = await getProtocol(id, user.userId);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const ok = await deleteProtocol(id, user.userId);
  if (!ok) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: user.userId,
    action: 'research.protocol.deleted',
    payload: { protocolId: id },
  });
  return NextResponse.json({ ok: true });
}

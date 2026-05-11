/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/iocs
 *
 * GET  — list/search IOCs (?q=&kind=&threatType=).
 * POST — create IOC.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  createIoc,
  recordAudit,
  searchIocs,
} from '@/lib/agentic-os/cyber/repo';
import {
  IOC_KIND_VALUES,
  THREAT_TYPE_VALUES,
  validateIocValue,
  type IocKind,
  type ThreatType,
} from '@/lib/agentic-os/cyber/iocs';

const IocBody = z.object({
  kind: z.enum(IOC_KIND_VALUES),
  value: z.string().min(1).max(2048),
  title: z.string().max(200).nullable().optional(),
  description: z.string().max(8000).nullable().optional(),
  threatType: z.enum(THREAT_TYPE_VALUES).nullable().optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  firstSeenAt: z.string().datetime().optional(),
  lastSeenAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  source: z.string().max(200).nullable().optional(),
  tags: z.array(z.string().min(1).max(60)).max(32).optional(),
  references: z.array(z.string().url().max(500)).max(32).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = request.nextUrl.searchParams;
  const kindRaw = sp.get('kind');
  const threatRaw = sp.get('threatType');
  const kind = kindRaw && (IOC_KIND_VALUES as readonly string[]).includes(kindRaw)
    ? (kindRaw as IocKind)
    : undefined;
  const threatType = threatRaw && (THREAT_TYPE_VALUES as readonly string[]).includes(threatRaw)
    ? (threatRaw as ThreatType)
    : undefined;
  const q = sp.get('q') ?? undefined;
  const iocs = await searchIocs({ ownerId: user.userId, q, kind, threatType });
  return NextResponse.json({ iocs });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = IocBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const v = validateIocValue(parsed.data.kind, parsed.data.value);
  if (!v.ok) {
    return NextResponse.json(
      { error: `Invalid IOC value for kind ${parsed.data.kind}: ${v.error}` },
      { status: 400 },
    );
  }
  const ioc = await createIoc(user.userId, parsed.data);
  if (!ioc) {
    return NextResponse.json(
      { error: 'IOC with this (kind, value) already exists' },
      { status: 409 },
    );
  }
  await recordAudit({
    actorId: user.userId,
    action: 'cyber.ioc.create',
    payload: { id: ioc.id, kind: ioc.kind },
  });
  return NextResponse.json({ ioc }, { status: 201 });
}

/**
 * Business OS Phase 4 — send quote route.
 *
 * POST /api/tiresias/agentic-os/business/quotes/[id]/send
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { getQuote, updateQuote } from '@/lib/agentic-os/business/quotes-repo';

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const existing = await getQuote(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (existing.status !== 'draft') {
    return NextResponse.json(
      { error: `Quote status is "${existing.status}", not draft` },
      { status: 400 },
    );
  }

  const outcome = await updateQuote(id, user.userId, { status: 'sent' });
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'business.quote.sent',
    payload: { quoteId: id },
  });

  return NextResponse.json({ quote: outcome.quote });
}

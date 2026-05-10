import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  dismissRiskFlag,
  listRiskFlags,
  recordAudit,
} from '@/lib/agentic-os/health/repo';
import { RiskFlagDismissQuery } from '@/lib/agentic-os/health/schemas';

/**
 * GET ?activeOnly=true (default) — list active risk flags for the current
 *     user. Returns an empty array if none.
 * DELETE ?id=<uuid> — dismiss a single flag. The owner check is enforced
 *     by `dismissRiskFlag` (UPDATE ... WHERE user_id = $actor); returns
 *     404 when the row doesn't exist or doesn't belong to the user.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentHealthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(request.url);
  const activeOnly = url.searchParams.get('activeOnly') !== 'false';
  const flags = await listRiskFlags(user.userId, user.tenantId, { activeOnly });
  return NextResponse.json({ flags });
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentHealthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(request.url);
  const parsed = RiskFlagDismissQuery.safeParse({
    id: url.searchParams.get('id'),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const dismissed = await dismissRiskFlag(parsed.data.id, user.userId);
  if (!dismissed) {
    return NextResponse.json({ error: 'Flag not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: user.userId,
    action: 'health.risk_flag.dismissed',
    payload: { id: dismissed.id, kind: dismissed.kind },
  });
  return NextResponse.json({ flag: dismissed });
}

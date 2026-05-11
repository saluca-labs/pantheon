import { NextRequest, NextResponse } from 'next/server';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { listPlaybookRuns } from '@/lib/agentic-os/cyber/repo';
import { PLAYBOOK_RUN_STATUS_VALUES, type PlaybookRunStatus } from '@/lib/agentic-os/cyber/playbooks';

export async function GET(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const statusRaw = searchParams.get('status');
  const status =
    statusRaw && (PLAYBOOK_RUN_STATUS_VALUES as readonly string[]).includes(statusRaw)
      ? (statusRaw as PlaybookRunStatus)
      : undefined;
  const playbookId = searchParams.get('playbookId') ?? undefined;
  const limitParam = searchParams.get('limit');
  const limit = Math.min(Math.max(parseInt(limitParam ?? '0', 10) || 100, 1), 500);
  const runs = await listPlaybookRuns({ ownerId: user.userId, status, playbookId, limit });
  return NextResponse.json({ runs });
}

/**
 * Research OS Phase 2 — Notebook entry restore route.
 *
 * `POST /api/tiresias/agentic-os/research/notebook/:entryId/restore`
 *   Clear `archived_at`. Returns 404 when the entry doesn't exist /
 *   isn't owned by this user; 400 when the entry is already active
 *   (not archived). Audited as `research.notebook.restored`.
 *
 * @license MIT — Tiresias Research OS Phase 2 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import { restoreNotebookEntry } from '@/lib/agentic-os/research/notebook-entries-repo';

interface Props {
  params: Promise<{ entryId: string }>;
}

export async function POST(_request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { entryId } = await params;
  const outcome = await restoreNotebookEntry(entryId, user.userId);
  if (!outcome) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (outcome.alreadyActive) {
    return NextResponse.json(
      { error: 'Entry is not archived', entry: outcome.entry },
      { status: 400 },
    );
  }

  await recordAudit({
    actorId: user.userId,
    action: 'research.notebook.restored',
    payload: {
      entryId,
      experimentId: outcome.entry.experimentId,
    },
    projectId: outcome.entry.experimentId,
  });

  return NextResponse.json({ entry: outcome.entry });
}

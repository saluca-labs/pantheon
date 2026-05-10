/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/story-documents/[docId]/versions/[versionId]/restore
 *
 * POST — restore a prior version onto the live document. Snapshots the
 *        current state first so the restore itself is undoable.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  restoreStoryDocumentVersion,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';

interface Props {
  params: Promise<{ docId: string; versionId: string }>;
}

export async function POST(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { docId, versionId } = await params;
  const document = await restoreStoryDocumentVersion({
    documentId: docId,
    versionId,
    tenantId: user.tenantId,
    userId: user.userId,
  });
  if (!document) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.story_doc.restore',
    payload: { documentId: docId, restoredFromVersionId: versionId, newVersion: document.version },
    projectId: document.projectId,
  });

  return NextResponse.json({ document });
}

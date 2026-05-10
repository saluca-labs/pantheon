/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/story-documents/[docId]/snapshot
 *
 * POST — explicitly snapshot the document's current state into the
 *        version-history table. Returns the freshly-written version row.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  snapshotStoryDocument,
  getStoryDocument,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';

interface Props {
  params: Promise<{ docId: string }>;
}

export async function POST(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { docId } = await params;
  const doc = await getStoryDocument(docId, user.tenantId, user.userId);
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const version = await snapshotStoryDocument({
    id: docId,
    tenantId: user.tenantId,
    userId: user.userId,
  });
  if (!version) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.story_doc.snapshot',
    payload: { documentId: docId, version: version.version },
    projectId: doc.projectId,
  });

  return NextResponse.json({ version }, { status: 201 });
}

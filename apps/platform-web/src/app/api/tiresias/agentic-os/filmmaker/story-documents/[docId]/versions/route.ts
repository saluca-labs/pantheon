/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/story-documents/[docId]/versions
 *
 * GET — list snapshot versions for the document, most recent first.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import { listStoryDocumentVersions } from '@/lib/agentic-os/filmmaker/repo';

interface Props {
  params: Promise<{ docId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { docId } = await params;
  const versions = await listStoryDocumentVersions(docId, user.tenantId, user.userId);
  return NextResponse.json({ versions });
}

/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/projects/[id]/story-documents
 *
 * GET  — list story documents for a project.
 * POST — create a new story document (`{ kind, title? }`).
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  listStoryDocuments,
  createStoryDocument,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';
import { STORY_DOCUMENT_KIND_VALUES } from '@/lib/agentic-os/filmmaker/story-documents';

const CreateBody = z.object({
  kind: z.enum(STORY_DOCUMENT_KIND_VALUES as unknown as [string, ...string[]]),
  title: z.string().min(1).max(200).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const documents = await listStoryDocuments(id, user.tenantId, user.userId);
  return NextResponse.json({ documents });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const document = await createStoryDocument({
    projectId: id,
    tenantId: user.tenantId,
    userId: user.userId,
    kind: parsed.data.kind as any,
    title: parsed.data.title,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.story_doc.create',
    payload: { projectId: id, documentId: document.id, kind: document.kind },
    projectId: id,
  });

  return NextResponse.json({ document }, { status: 201 });
}

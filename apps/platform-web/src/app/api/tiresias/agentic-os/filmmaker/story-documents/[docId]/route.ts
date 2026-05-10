/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/story-documents/[docId]
 *
 * GET    — fetch one story document.
 * PATCH  — update content / title (recomputes plain text + word count).
 * DELETE — remove the document.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getStoryDocument,
  updateStoryDocument,
  deleteStoryDocument,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';

const PatchBody = z
  .object({
    title: z.string().min(1).max(200).optional(),
    contentJson: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((d) => d.title !== undefined || d.contentJson !== undefined, {
    message: 'Provide at least one of: title, contentJson.',
  });

interface Props {
  params: Promise<{ docId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { docId } = await params;
  const document = await getStoryDocument(docId, user.tenantId, user.userId);
  if (!document) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ document });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { docId } = await params;
  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const document = await updateStoryDocument({
    id: docId,
    tenantId: user.tenantId,
    userId: user.userId,
    title: parsed.data.title,
    contentJson: parsed.data.contentJson as any,
  });
  if (!document) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.story_doc.update',
    payload: {
      documentId: docId,
      fields: Object.keys(parsed.data),
      wordCount: document.wordCount,
    },
    projectId: document.projectId,
  });

  return NextResponse.json({ document });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { docId } = await params;
  const document = await getStoryDocument(docId, user.tenantId, user.userId);
  if (!document) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const removed = await deleteStoryDocument(docId, user.tenantId, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.story_doc.delete',
    payload: { documentId: docId, projectId: document.projectId },
    projectId: document.projectId,
  });

  return NextResponse.json({ ok: true });
}

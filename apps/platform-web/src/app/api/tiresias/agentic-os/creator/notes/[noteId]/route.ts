import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { getNote, updateNote, deleteNote } from '@/lib/agentic-os/creator/notes-repo';

const UpdateBody = z.object({
  title: z.string().min(0).max(500).optional(),
  content: z.record(z.unknown()).optional(),
  icon: z.string().max(10).nullable().optional(),
  coverImageUrl: z.string().max(2000).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  position: z.number().int().optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  isPinned: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { noteId } = await params;
  const note = await getNote(noteId, user.userId);
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(note);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { noteId } = await params;
  const parsed = UpdateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const outcome = await updateNote(noteId, user.userId, parsed.data);
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(outcome.note);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { noteId } = await params;
  const deleted = await deleteNote(noteId, user.userId);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}

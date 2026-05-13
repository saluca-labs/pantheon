import { NextRequest, NextResponse } from 'next/server';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { restoreNote } from '@/lib/agentic-os/creator/notes-repo';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { noteId } = await params;
  const note = await restoreNote(noteId, user.userId);
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(note);
}

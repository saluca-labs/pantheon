import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import {
  listChapters,
  createChapter,
  getBook,
} from '@/lib/agentic-os/creator/books-repo';

const CreateBody = z.object({
  title: z.string().min(1).max(500),
  content: z.record(z.unknown()).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { bookId } = await params;

  // Verify book ownership
  const book = await getBook(bookId, user.userId);
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  const chapters = await listChapters(bookId, user.userId);
  return NextResponse.json({ chapters });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { bookId } = await params;

  // Verify book ownership
  const book = await getBook(bookId, user.userId);
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const chapter = await createChapter(
    bookId,
    {
      title: parsed.data.title,
      content: parsed.data.content,
    },
    user.userId,
  );

  return NextResponse.json(chapter, { status: 201 });
}

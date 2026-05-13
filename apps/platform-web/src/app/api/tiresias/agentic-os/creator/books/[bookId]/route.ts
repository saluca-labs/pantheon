import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import {
  getBook,
  updateBook,
  deleteBook,
} from '@/lib/agentic-os/creator/books-repo';

const UpdateBody = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).nullable().optional(),
  coverImageUrl: z.string().max(2000).nullable().optional(),
  status: z.enum(['draft', 'writing', 'complete', 'published']).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { bookId } = await params;
  const book = await getBook(bookId, user.userId);
  if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(book);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { bookId } = await params;
  const parsed = UpdateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const outcome = await updateBook(bookId, user.userId, parsed.data);
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(outcome.book);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { bookId } = await params;
  const deleted = await deleteBook(bookId, user.userId);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}

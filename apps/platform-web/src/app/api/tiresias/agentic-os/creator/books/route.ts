import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { listBooks, createBook } from '@/lib/agentic-os/creator/books-repo';

const CreateBody = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  coverImageUrl: z.string().max(2000).optional(),
});

export async function GET(_request: NextRequest) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const books = await listBooks(user.userId);
  return NextResponse.json({ books });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const book = await createBook(
    {
      title: parsed.data.title,
      description: parsed.data.description,
      coverImageUrl: parsed.data.coverImageUrl,
    },
    user.userId,
  );

  return NextResponse.json(book, { status: 201 });
}

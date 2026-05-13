import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { listNotes, createNote } from '@/lib/agentic-os/creator/notes-repo';

const CreateBody = z.object({
  title: z.string().min(0).max(500).optional(),
  content: z.record(z.unknown()).optional(),
  icon: z.string().max(10).optional(),
  coverImageUrl: z.string().max(2000).optional(),
  parentId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  isPinned: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = request.nextUrl;
  const parentId = url.searchParams.get('parentId');
  const isPinned = url.searchParams.get('isPinned') === 'true' ? true : undefined;
  const includeArchived = url.searchParams.get('includeArchived') === 'true';
  const search = url.searchParams.get('search') ?? undefined;
  const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : undefined;
  const offset = url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!, 10) : undefined;

  const notes = await listNotes(user.userId, {
    parentId: parentId === 'null' ? null : parentId ?? undefined,
    isPinned,
    includeArchived,
    search,
    limit,
    offset,
  });

  return NextResponse.json({ notes });
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

  const note = await createNote(
    {
      title: parsed.data.title,
      content: parsed.data.content,
      icon: parsed.data.icon,
      coverImageUrl: parsed.data.coverImageUrl,
      parentId: parsed.data.parentId ?? null,
      tags: parsed.data.tags,
      isPinned: parsed.data.isPinned,
    },
    user.userId,
  );

  return NextResponse.json(note, { status: 201 });
}

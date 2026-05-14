import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { getNote, listNotes } from '@/lib/agentic-os/creator/notes-repo';
import { NoteTree } from '@/components/agentic-os/creator/note-tree';
import { NoteEditorClient } from './client';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ noteId: string }>;
}

export default async function NoteDetailPage({ params }: PageProps) {
  const user = await getCurrentCreatorUser();
  if (!user) redirect('/login');

  const { noteId } = await params;

  // Handle "new" route — redirect to API to create and then redirect
  if (noteId === 'new') {
    redirect('/dashboard/os/creator');
  }

  const [note, allNotes] = await Promise.all([
    getNote(noteId, user.userId),
    listNotes(user.userId, { limit: 500 }),
  ]);

  if (!note) notFound();

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left sidebar: Note tree */}
      <aside className="w-64 flex-shrink-0 border-r border-border-subtle bg-surface-0 overflow-hidden">
        <NoteTree notes={allNotes} currentNoteId={note.id} />
      </aside>

      {/* Right main: Editor */}
      <main className="flex-1 overflow-y-auto">
        <NoteEditorClient note={note} />
      </main>
    </div>
  );
}

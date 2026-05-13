import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { getBook, listChapters } from '@/lib/agentic-os/creator/books-repo';
import { BookEditor } from '@/components/agentic-os/creator/book-editor';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ bookId: string }>;
}

export default async function BookEditorPage({ params }: PageProps) {
  const user = await getCurrentCreatorUser();
  if (!user) redirect('/login');

  const { bookId } = await params;

  const [book, chapters] = await Promise.all([
    getBook(bookId, user.userId),
    listChapters(bookId, user.userId),
  ]);

  if (!book) notFound();

  return (
    <>
      <div className="mb-4 rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/5 px-4 py-2 flex items-center justify-between">
        <p className="text-xs text-fuchsia-200/80">
          Need writing feedback on this book? Ask the Writing Coach.
        </p>
        <a
          href="/dashboard/os/creator/coach?mode=writing_coach"
          className="text-xs font-medium text-fuchsia-300 hover:text-fuchsia-100 underline underline-offset-2"
        >
          Open Writing Coach
        </a>
      </div>
      <BookEditor book={book} chapters={chapters} />
    </>
  );
}

import { redirect } from 'next/navigation';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { listBooks } from '@/lib/agentic-os/creator/books-repo';
import { BookList } from '@/components/agentic-os/creator/book-list';

export const dynamic = 'force-dynamic';

export default async function BooksPage() {
  const user = await getCurrentCreatorUser();
  if (!user) redirect('/login');

  const books = await listBooks(user.userId);

  return (
    <div className="p-6">
      <BookList books={books} />
    </div>
  );
}

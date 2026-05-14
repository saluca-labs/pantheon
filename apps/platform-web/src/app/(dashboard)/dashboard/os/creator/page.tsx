import { redirect } from 'next/navigation';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { listNotes } from '@/lib/agentic-os/creator/notes-repo';
import { listPosts } from '@/lib/agentic-os/creator/posts-repo';
import { listBooks } from '@/lib/agentic-os/creator/books-repo';
import { listSubscribers } from '@/lib/agentic-os/creator/subscribers-repo';
import { CreatorHub } from '@/components/agentic-os/creator/creator-hub';

export const dynamic = 'force-dynamic';

export default async function CreatorHubPage() {
  const user = await getCurrentCreatorUser();
  if (!user) redirect('/login');

  const [pinnedNotes, recentNotes, posts, books, subscribers] =
    await Promise.all([
      listNotes(user.userId, { isPinned: true, limit: 12 }),
      listNotes(user.userId, { limit: 20 }),
      listPosts(user.userId, { limit: 200 }),
      listBooks(user.userId),
      listSubscribers(user.userId, { limit: 500 }),
    ]);

  return (
    <CreatorHub
      pinnedNotes={pinnedNotes}
      recentNotes={recentNotes}
      posts={posts}
      books={books}
      subscribers={subscribers}
    />
  );
}

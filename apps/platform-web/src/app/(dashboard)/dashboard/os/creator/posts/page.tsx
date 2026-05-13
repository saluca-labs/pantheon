import { redirect } from 'next/navigation';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { listPosts } from '@/lib/agentic-os/creator/posts-repo';
import { PostList } from '@/components/agentic-os/creator/post-list';

export const dynamic = 'force-dynamic';

export default async function PostsPage() {
  const user = await getCurrentCreatorUser();
  if (!user) redirect('/login');

  const posts = await listPosts(user.userId, { limit: 200 });

  return <PostList posts={posts} />;
}

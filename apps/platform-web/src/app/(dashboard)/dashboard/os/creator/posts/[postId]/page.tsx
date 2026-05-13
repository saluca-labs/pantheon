import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { getPost } from '@/lib/agentic-os/creator/posts-repo';
import { PostEditor } from '@/components/agentic-os/creator/post-editor';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ postId: string }>;
}

export default async function PostEditorPage({ params }: PageProps) {
  const user = await getCurrentCreatorUser();
  if (!user) redirect('/login');

  const { postId } = await params;

  const post = await getPost(postId, user.userId);
  if (!post) notFound();

  return (
    <>
      <div className="mb-4 rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/5 px-4 py-2 flex items-center justify-between">
        <p className="text-xs text-fuchsia-200/80">
          Want feedback on this draft? Ask the Writing Coach.
        </p>
        <a
          href="/dashboard/os/creator/coach?mode=writing_coach"
          className="text-xs font-medium text-fuchsia-300 hover:text-fuchsia-100 underline underline-offset-2"
        >
          Open Writing Coach
        </a>
      </div>
      <PostEditor post={post} />
    </>
  );
}

import { redirect } from 'next/navigation';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { listVideos } from '@/lib/agentic-os/creator/video-repo';
import { VideoList } from '@/components/agentic-os/creator/video-list';

export const dynamic = 'force-dynamic';

export default async function CreatorVideosPage() {
  const user = await getCurrentCreatorUser();
  if (!user) redirect('/login');

  const videos = await listVideos(user.userId, { limit: 200 });

  return <VideoList videos={videos} />;
}

import { redirect } from 'next/navigation';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { getPodcast } from '@/lib/agentic-os/creator/podcast-repo';
import { EpisodeForm } from '@/components/agentic-os/creator/episode-form';

export const dynamic = 'force-dynamic';

export default async function CreatorNewEpisodePage() {
  const user = await getCurrentCreatorUser();
  if (!user) redirect('/login');

  const podcast = await getPodcast(user.userId);
  if (!podcast) redirect('/dashboard/os/creator/podcast/settings');

  return <EpisodeForm podcastId={podcast.id} isNew />;
}

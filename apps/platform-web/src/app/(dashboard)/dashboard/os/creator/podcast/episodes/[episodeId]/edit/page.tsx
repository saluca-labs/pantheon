import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { getPodcast, getEpisode } from '@/lib/agentic-os/creator/podcast-repo';
import { EpisodeForm } from '@/components/agentic-os/creator/episode-form';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ episodeId: string }>;
}

export default async function CreatorEditEpisodePage({ params }: Props) {
  const user = await getCurrentCreatorUser();
  if (!user) redirect('/login');

  const { episodeId } = await params;
  const episode = await getEpisode(episodeId, user.userId);
  if (!episode) notFound();

  const podcast = await getPodcast(user.userId);
  if (!podcast) redirect('/dashboard/os/creator/podcast/settings');

  return <EpisodeForm episode={episode} podcastId={podcast.id} />;
}

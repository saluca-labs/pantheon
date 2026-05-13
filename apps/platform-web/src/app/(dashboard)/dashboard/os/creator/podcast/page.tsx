import { redirect } from 'next/navigation';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { getPodcast, listEpisodes } from '@/lib/agentic-os/creator/podcast-repo';
import { EpisodeList } from '@/components/agentic-os/creator/episode-list';

export const dynamic = 'force-dynamic';

export default async function CreatorPodcastPage() {
  const user = await getCurrentCreatorUser();
  if (!user) redirect('/login');

  const [podcast, episodes] = await Promise.all([
    getPodcast(user.userId),
    listEpisodes(user.userId),
  ]);

  return (
    <>
      <div className="mb-4 rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/5 px-4 py-2 flex items-center justify-between">
        <p className="text-xs text-fuchsia-200/80">
          Need content strategy help for your podcast?
        </p>
        <a
          href="/dashboard/os/creator/coach?mode=content_strategist"
          className="text-xs font-medium text-fuchsia-300 hover:text-fuchsia-100 underline underline-offset-2"
        >
          Open Content Strategist
        </a>
      </div>
      <EpisodeList episodes={episodes} podcast={podcast} />
    </>
  );
}

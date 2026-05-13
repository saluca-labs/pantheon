import { redirect } from 'next/navigation';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { getPodcast } from '@/lib/agentic-os/creator/podcast-repo';
import { PodcastSettingsForm } from '@/components/agentic-os/creator/podcast-settings-form';

export const dynamic = 'force-dynamic';

export default async function CreatorPodcastSettingsPage() {
  const user = await getCurrentCreatorUser();
  if (!user) redirect('/login');

  const podcast = await getPodcast(user.userId);

  return (
    <div className="max-w-2xl">
      <PodcastSettingsForm podcast={podcast} />
    </div>
  );
}

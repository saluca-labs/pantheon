import { redirect } from 'next/navigation';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { listNotes } from '@/lib/agentic-os/creator/notes-repo';
import { CreatorHub } from '@/components/agentic-os/creator/creator-hub';

export const dynamic = 'force-dynamic';

export default async function CreatorHubPage() {
  const user = await getCurrentCreatorUser();
  if (!user) redirect('/login');

  const [pinnedNotes, recentNotes] = await Promise.all([
    listNotes(user.userId, { isPinned: true, limit: 12 }),
    listNotes(user.userId, { limit: 20 }),
  ]);

  return <CreatorHub pinnedNotes={pinnedNotes} recentNotes={recentNotes} />;
}

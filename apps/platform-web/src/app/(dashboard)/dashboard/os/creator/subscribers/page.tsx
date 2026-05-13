import { redirect } from 'next/navigation';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { listSubscribers } from '@/lib/agentic-os/creator/subscribers-repo';
import { SubscriberTable } from '@/components/agentic-os/creator/subscriber-table';

export const dynamic = 'force-dynamic';

export default async function SubscribersPage() {
  const user = await getCurrentCreatorUser();
  if (!user) redirect('/login');

  const subscribers = await listSubscribers(user.userId, { limit: 500 });

  return <SubscriberTable subscribers={subscribers} />;
}

import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { listPosts } from '@/lib/agentic-os/creator/posts-repo';
import { EditorialCalendar } from '@/components/agentic-os/creator/editorial-calendar';

export const dynamic = 'force-dynamic';

export default async function CreatorCalendarPage() {
  const user = await getCurrentCreatorUser();
  if (!user) redirect('/login');

  const posts = await listPosts(user.userId, { limit: 200 });

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/creator"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Creator OS
      </Link>

      <div className="flex items-center gap-3 mb-1">
        <Sparkles className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">Editorial Calendar</h1>
      </div>
      <p className="text-sm text-[#94a3b8] mb-6">
        Plan, schedule, and track content. Posts are grouped by ISO
        week for an at-a-glance publishing view.
      </p>

      <EditorialCalendar initial={posts} />
    </div>
  );
}

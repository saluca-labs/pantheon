/**
 * Maker OS — Coach session view.
 *
 * Loads the session + transcript server-side and hands off to the
 * client-side CoachSession component for streaming. 404 on cross-user
 * access (the repo's `getSession` filter by user_id enforces this).
 *
 * @license MIT — Tiresias Maker OS Phase 7 (internal).
 */

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { getSession } from '@/lib/agentic-os/maker/coach/repo';
import {
  CoachSession,
  type CoachUiMessage,
} from '@/components/agentic-os/maker/coach/coach-session';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ sessionId: string }>;
}

export default async function MakerCoachSessionPage({ params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) redirect('/login');

  const { sessionId } = await params;
  const session = await getSession(sessionId, user.userId);
  if (!session) notFound();

  const initialMessages: CoachUiMessage[] = session.messages.map((m) => ({
    role: m.role,
    content: m.content,
    created_at: m.created_at,
  }));

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/maker/coach"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        All sessions
      </Link>

      <CoachSession
        sessionId={session.id}
        mode={session.mode}
        projectId={session.projectId}
        initialTitle={session.title}
        initialMessages={initialMessages}
      />
    </div>
  );
}

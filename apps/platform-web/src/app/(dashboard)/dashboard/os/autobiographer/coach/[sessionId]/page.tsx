/**
 * Autobiographer OS — Coach session view.
 *
 * Loads the session + transcript server-side and hands off to the
 * client-side CoachSession component for streaming. 404 on cross-user
 * access (the repo's `getSession` filter by user_id enforces this).
 *
 * `?chapter_id=…` URL parameter binds a chapter to the conversation
 * so the chapter_drafter "Commit to chapter" toggle is enabled.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { getSession } from '@/lib/agentic-os/autobiographer/coach/sessions-repo';
import {
  CoachSession,
  type CoachUiMessage,
} from '@/components/agentic-os/autobiographer/coach/coach-session';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ chapter_id?: string }>;
}

export default async function AutobiographerCoachSessionPage({
  params,
  searchParams,
}: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) redirect('/login');

  const { sessionId } = await params;
  const sp = await searchParams;
  const chapterId =
    typeof sp.chapter_id === 'string' && sp.chapter_id ? sp.chapter_id : null;

  const session = await getSession(sessionId, user.userId);
  if (!session) notFound();

  const initialMessages: CoachUiMessage[] = session.messages.map((m) => ({
    role: m.role,
    content: m.content,
    created_at: m.created_at,
  }));

  return (
    <div className="max-w-6xl">
      <Link
        href="/dashboard/os/autobiographer/coach"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        All sessions
      </Link>

      <CoachSession
        sessionId={session.id}
        mode={session.mode}
        bookId={session.bookId}
        chapterId={chapterId}
        initialTitle={session.title}
        initialMessages={initialMessages}
      />
    </div>
  );
}

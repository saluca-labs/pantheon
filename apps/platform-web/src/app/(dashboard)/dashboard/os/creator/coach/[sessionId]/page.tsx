/**
 * Creator OS Phase 7 — AI Coach session detail page.
 *
 * Server component. Fetches the session with ownership check, renders
 * the CoachSession client component with initial messages and title.
 *
 * @license MIT — Tiresias Creator OS Phase 7 (internal).
 */

import { notFound } from 'next/navigation';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { getSession } from '@/lib/agentic-os/creator/coach/sessions-repo';
import { CoachSession } from '@/components/agentic-os/creator/coach-session';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function CreatorCoachSessionPage({ params }: PageProps) {
  const user = await getCurrentCreatorUser();
  if (!user) notFound();

  const { sessionId } = await params;
  const session = await getSession(sessionId, user.userId);
  if (!session) notFound();

  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/os/creator/coach"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Coach
      </Link>

      <CoachSession
        sessionId={session.id}
        mode={session.mode}
        initialTitle={session.title}
        initialArchivedAt={session.archivedAt}
        initialMessages={session.messages}
      />
    </div>
  );
}

/**
 * Business OS Phase 7 — AI Coach session detail page.
 *
 * Server component. Fetches the session with ownership check, renders
 * the CoachSession client component with initial messages and title.
 *
 * @license MIT — Tiresias Business OS Phase 7 (internal).
 */

import { notFound } from 'next/navigation';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { getSession } from '@/lib/agentic-os/business/coach/sessions-repo';
import { CoachSession } from '@/components/agentic-os/business/coach/coach-session';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function BusinessCoachSessionPage({ params }: PageProps) {
  const user = await getCurrentBusinessUser();
  if (!user) notFound();

  const { sessionId } = await params;
  const session = await getSession(sessionId, user.userId);
  if (!session) notFound();

  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/os/business/coach"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Coach
      </Link>

      <CoachSession
        sessionId={session.id}
        mode={session.mode}
        projectId={session.projectId}
        dealId={session.dealId}
        initialTitle={session.title}
        initialMessages={session.messages}
      />
    </div>
  );
}

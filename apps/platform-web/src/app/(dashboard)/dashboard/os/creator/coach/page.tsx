/**
 * Creator OS Phase 7 — AI Content Coach hub page.
 *
 * Server component. Checks coach configuration, fetches sessions,
 * and renders the CoachHub client component with optional search-param
 * mode scoping.
 *
 * @license MIT — Tiresias Creator OS Phase 7 (internal).
 */

import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { listSessions } from '@/lib/agentic-os/creator/coach/sessions-repo';
import { isCoachConfigured } from '@/lib/agentic-os/creator/coach/anthropic';
import { CoachHub } from '@/components/agentic-os/creator/coach-hub';
import type { CoachMode } from '@/lib/agentic-os/creator/coach/modes';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ mode?: string }>;
}

export default async function CreatorCoachPage({ searchParams }: PageProps) {
  const user = await getCurrentCreatorUser();

  if (!user || !isCoachConfigured()) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
        <div className="rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 p-6 max-w-md">
          <h2 className="text-base font-semibold text-fuchsia-100 mb-3">
            AI Coach not available
          </h2>
          <p className="text-sm text-fuchsia-200/80 leading-relaxed">
            {!user
              ? 'Sign in to access the Creator AI Coach.'
              : 'The AI Coach requires an ANTHROPIC_API_KEY environment variable to be set.'}
          </p>
        </div>
      </div>
    );
  }

  const sp = await searchParams;
  const sessions = await listSessions({ userId: user.userId, limit: 50 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">AI Content Coach</h1>
        <p className="text-sm text-text-secondary mt-1">
          Five-mode creator coach: content strategy, writing, audience growth,
          monetization, and general guidance.
        </p>
      </div>

      <CoachHub
        initialMode={sp.mode as CoachMode | undefined}
        sessions={sessions.map((s) => ({
          id: s.id,
          title: s.title,
          mode: s.mode,
          model: s.model,
          archivedAt: s.archivedAt,
          updatedAt: s.updatedAt,
        }))}
      />
    </div>
  );
}

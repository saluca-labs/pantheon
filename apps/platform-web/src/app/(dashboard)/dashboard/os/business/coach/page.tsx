/**
 * Business OS Phase 7 — AI Coach hub page.
 *
 * Server component. Checks coach configuration, fetches recent sessions,
 * and renders the CoachHub client component with optional search-param
 * scoping (mode, project_id, deal_id).
 *
 * @license MIT — Tiresias Business OS Phase 7 (internal).
 */

import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { listSessions } from '@/lib/agentic-os/business/coach/sessions-repo';
import { isCoachConfigured } from '@/lib/agentic-os/business/coach/anthropic';
import { CoachEmptyState } from '@/components/agentic-os/business/coach/coach-empty-state';
import { CoachHub } from '@/components/agentic-os/business/coach/coach-hub';
import type { CoachMode } from '@/lib/agentic-os/business/coach/modes';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    mode?: string;
    project_id?: string;
    deal_id?: string;
  }>;
}

export default async function BusinessCoachPage({ searchParams }: PageProps) {
  const user = await getCurrentBusinessUser();
  if (!user) {
    return <CoachEmptyState />;
  }

  if (!isCoachConfigured()) {
    return <CoachEmptyState />;
  }

  const sp = await searchParams;
  const sessions = await listSessions({ userId: user.userId, limit: 50 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">AI Coach</h1>
        <p className="text-sm text-text-secondary mt-1">
          Five-mode advisory coach: pricing, sales, marketing, strategy, and
          general business guidance.
        </p>
      </div>

      <CoachHub
        initialMode={sp.mode as CoachMode | undefined}
        projectId={sp.project_id ?? null}
        dealId={sp.deal_id ?? null}
        sessions={sessions.map((s) => ({
          id: s.id,
          title: s.title,
          mode: s.mode,
          projectId: s.projectId,
          dealId: s.dealId,
          updatedAt: s.updatedAt,
        }))}
      />
    </div>
  );
}

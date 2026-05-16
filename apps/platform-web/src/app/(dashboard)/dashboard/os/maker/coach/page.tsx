/**
 * Maker OS — Coach hub.
 *
 * Lists recent sessions, exposes the 4-mode picker + quick prompts +
 * free-form start input, and renders the 503-aware empty state when
 * `ANTHROPIC_API_KEY` is missing.
 *
 * Optional `?project_id=…&mode=…` query params pre-select a project and
 * mode (the project-detail page Coach tab links here with both set).
 *
 * @license MIT — Tiresias Maker OS Phase 7 (internal).
 */

import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { listSessions } from '@/lib/agentic-os/maker/coach/repo';
import {
  isCoachMode,
  type CoachMode,
} from '@/lib/agentic-os/maker/coach/modes';
import { isCoachConfigured } from '@/lib/agentic-os/maker/coach/anthropic';
import { CoachHub } from '@/components/agentic-os/maker/coach/coach-hub';
import { CoachNotConfigured } from '@/components/agentic-os/_shared/coach/coach-not-configured';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ project_id?: string; mode?: string }>;
}

export default async function MakerCoachHubPage({ searchParams }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const projectId =
    typeof sp.project_id === 'string' && sp.project_id ? sp.project_id : null;
  const initialMode: CoachMode | undefined = isCoachMode(sp.mode)
    ? sp.mode
    : undefined;

  const configured = isCoachConfigured();
  const sessions = configured
    ? await listSessions({
        userId: user.userId,
        projectId: projectId ?? undefined,
        limit: 30,
      })
    : [];

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/maker"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Maker OS
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <Sparkles className="w-6 h-6 text-os-maker" />
        <h1 className="text-2xl font-semibold text-white">Maker Coach</h1>
      </div>
      <p className="text-sm text-text-secondary mb-6 leading-relaxed">
        Project-aware AI advisor across procurement, build planning, and
        shop safety. The coach reads a current snapshot of your BOM, build
        steps, milestones, tools, and dependencies — depending on the
        mode — and gives concrete recommendations grounded in that
        context.
      </p>

      {!configured ? (
        <CoachNotConfigured osLabel="Maker" />
      ) : (
        <CoachHub
          projectId={projectId}
          initialMode={initialMode}
          sessions={sessions.map((s) => ({
            id: s.id,
            title: s.title,
            mode: s.mode,
            projectId: s.projectId,
            updatedAt: s.updatedAt,
          }))}
        />
      )}
    </div>
  );
}

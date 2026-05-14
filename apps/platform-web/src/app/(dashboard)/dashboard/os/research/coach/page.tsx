/**
 * Research OS — Coach hub.
 *
 * Lists recent sessions, exposes the 4-mode picker + per-mode quick
 * prompts + free-form start input, and renders the 503-aware
 * not-configured banner when `ANTHROPIC_API_KEY` is missing.
 *
 * Optional `?experiment_id=…&mode=…` query params pre-select an
 * experiment and mode (the experiment-detail page Coach CTA links here
 * with both set, defaulting mode to methods_advisor).
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { listSessions } from '@/lib/agentic-os/research/coach/sessions-repo';
import {
  isCoachMode,
  type CoachMode,
} from '@/lib/agentic-os/research/coach/modes';
import { isCoachConfigured } from '@/lib/agentic-os/research/coach/anthropic';
import { CoachHub } from '@/components/agentic-os/research/coach/coach-hub';
import { CoachNotConfiguredBanner } from '@/components/agentic-os/research/coach/coach-not-configured-banner';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ experiment_id?: string; mode?: string }>;
}

export default async function ResearchCoachHubPage({ searchParams }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const experimentId =
    typeof sp.experiment_id === 'string' && sp.experiment_id
      ? sp.experiment_id
      : null;
  const initialMode: CoachMode | undefined = isCoachMode(sp.mode)
    ? sp.mode
    : undefined;

  const configured = isCoachConfigured();
  const sessions = configured
    ? await listSessions({
        userId: user.userId,
        experimentId: experimentId ?? undefined,
        limit: 30,
      })
    : [];

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/research"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Research OS
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <Sparkles className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">Research Coach</h1>
      </div>
      <p className="text-sm text-text-secondary mb-6 leading-relaxed">
        Research-aware AI coach across four modes — lit reviewer (themes,
        gaps, contradictions in your library), hypothesis critic
        (falsifiability, confounders, evidence asymmetry), methods advisor
        (controls, sample size, reproducibility — refuses regulated advice
        per IRB / IACUC / EHS), and a general stuck-PhD partner. The coach
        never invents content; cite IDs are pulled from your workshop only.
      </p>

      {!configured ? (
        <CoachNotConfiguredBanner />
      ) : (
        <CoachHub
          experimentId={experimentId}
          initialMode={initialMode}
          sessions={sessions.map((s) => ({
            id: s.id,
            title: s.title,
            mode: s.mode,
            experimentId: s.experimentId,
            updatedAt: s.updatedAt,
          }))}
        />
      )}
    </div>
  );
}

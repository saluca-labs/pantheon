import Link from 'next/link';
import { ArrowLeft, Brain, Plus } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  getCurrentMeditationPlan,
  listMeditationSessions,
} from '@/lib/agentic-os/health/repo';
import { MEDITATION_CATALOG } from '@/lib/agentic-os/health/meditation-catalog';
import { CaveatBlock } from '@/components/agentic-os/health/caveat-block';
import { MeditationCatalogBrowser } from '@/components/agentic-os/health/meditate/meditation-catalog-browser';
import { PlanCard } from '@/components/agentic-os/health/meditate/plan-card';
import { DataTable } from '@/components/agentic-os/_shared/data-table';

export const dynamic = 'force-dynamic';

export default async function MeditatePage() {
  const user = await getCurrentHealthUser();
  if (!user) redirect('/login');

  const mentalConsent = await getActiveConsent(
    user.userId,
    user.tenantId,
    'mental',
  );
  if (!mentalConsent?.granted) {
    return (
      <div className="max-w-3xl">
        <Link
          href="/dashboard/os/health"
          className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Health OS
        </Link>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-amber-100/90">
          <h1 className="text-lg font-semibold text-amber-50 mb-2">
            Mental-health consent required
          </h1>
          <p className="leading-relaxed">
            Meditation tracking is a mental-health feature gated behind your
            explicit consent. Grant the “mental” scope on the{' '}
            <Link
              href="/dashboard/os/health"
              className="underline hover:text-amber-50"
            >
              Health OS hub
            </Link>{' '}
            to continue.
          </p>
        </div>
      </div>
    );
  }

  const [plan, sessions] = await Promise.all([
    getCurrentMeditationPlan(user.userId),
    listMeditationSessions(user.userId, { limit: 10 }),
  ]);

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/health"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Health OS
      </Link>

      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Brain className="w-6 h-6 text-[#4361EE]" />
          <h1 className="text-2xl font-semibold text-white">Meditate</h1>
        </div>
        <Link
          href="/dashboard/os/health/meditate/log"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] text-white text-sm font-medium px-3 py-2 transition"
        >
          <Plus className="w-4 h-4" />
          Log a session
        </Link>
      </div>

      <CaveatBlock />

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,360px)] gap-4">
        <div className="space-y-4">
          <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
            <MeditationCatalogBrowser
              catalog={MEDITATION_CATALOG}
              source="static"
            />
          </div>
        </div>
        <div className="space-y-4">
          <PlanCard plan={plan} />
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/os/health/meditate/plan"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2d3e] bg-[#0f1117] hover:border-[#4361EE]/50 text-white text-xs px-3 py-1.5 transition"
            >
              View weekly plan
            </Link>
          </div>
        </div>
      </div>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold text-white">Recent sessions</h2>
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
          <DataTable
            rows={sessions}
            empty="No meditation sessions logged yet."
            columns={[
              {
                label: 'When',
                render: (s) =>
                  new Date(s.completedAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  }),
              },
              { label: 'Source', render: (s) => s.source },
              { label: 'Min', render: (s) => `${s.durationMin}` },
              {
                label: 'Mood Δ',
                render: (s) =>
                  s.moodBefore !== null && s.moodAfter !== null
                    ? `${s.moodBefore} → ${s.moodAfter}`
                    : '—',
                className: 'hidden sm:table-cell',
              },
            ]}
          />
        </div>
      </section>
    </div>
  );
}

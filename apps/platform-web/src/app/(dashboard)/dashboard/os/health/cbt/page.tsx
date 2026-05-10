import Link from 'next/link';
import { ArrowLeft, ListChecks, Sparkles } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  listCbtExercises,
  listCbtLogs,
} from '@/lib/agentic-os/health/repo';
import { CaveatBlock } from '@/components/agentic-os/health/caveat-block';
import { ExerciseCatalog } from '@/components/agentic-os/health/cbt/exercise-catalog';
import { CbtLogList } from '@/components/agentic-os/health/cbt/cbt-log-list';

export const dynamic = 'force-dynamic';

export default async function CbtLandingPage() {
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
            CBT exercises are a mental-health feature gated behind your
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

  const [exercises, recentLogs] = await Promise.all([
    listCbtExercises(),
    listCbtLogs(user.userId, { limit: 8 }),
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
          <Sparkles className="w-6 h-6 text-[#4361EE]" />
          <h1 className="text-2xl font-semibold text-white">CBT exercises</h1>
        </div>
        <Link
          href="/dashboard/os/health/cbt/logs"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2d3e] bg-[#1a1d27] hover:border-[#4361EE]/50 text-white text-sm px-3 py-2 transition"
        >
          <ListChecks className="w-4 h-4" />
          All logs
        </Link>
      </div>

      <CaveatBlock />

      <section className="mt-6 space-y-3">
        <h2 className="text-base font-semibold text-white">Pick an exercise</h2>
        <ExerciseCatalog exercises={exercises} />
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold text-white">Recent logs</h2>
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
          <CbtLogList logs={recentLogs} />
        </div>
      </section>
    </div>
  );
}

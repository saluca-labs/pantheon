import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import { getActiveConsent, getTrends } from '@/lib/agentic-os/health/repo';
import {
  TrendsDashboard,
  type TrendsPayload,
  type TrendWindow,
} from '@/components/agentic-os/health/trends-dashboard';

export const dynamic = 'force-dynamic';

const DEFAULT_WINDOW: TrendWindow = '30d';

export default async function HealthTrendsPage() {
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
            Trends are aggregated from mood entries, screeners, journal,
            CBT, and meditation data — all of which are mental-health
            features. Grant mental-health consent on the Health OS hub to
            view your trends.
          </p>
        </div>
      </div>
    );
  }

  const initial: TrendsPayload = (await getTrends(
    user.userId,
    user.tenantId,
    DEFAULT_WINDOW,
  )) as TrendsPayload;

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/health"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Health OS
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <BarChart3 className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">Trends</h1>
      </div>
      <p className="text-sm text-[#94a3b8] mb-5 leading-relaxed">
        Aggregated view of your mood, screeners, and practice. Read-only —
        nothing here changes your records.
      </p>

      <TrendsDashboard initial={initial} />
    </div>
  );
}

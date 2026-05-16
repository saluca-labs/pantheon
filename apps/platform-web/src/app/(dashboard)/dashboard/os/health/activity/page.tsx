import Link from 'next/link';
import { Activity, ArrowLeft } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  getDailyActivitySummary,
  listActivityEntries,
  MET_TABLE,
} from '@/lib/agentic-os/health/repo';
import { CaveatBlock } from '@/components/agentic-os/health/caveat-block';
import { ActivityLogger } from '@/components/agentic-os/health/activity/activity-logger';

export const dynamic = 'force-dynamic';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function HealthActivityPage() {
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
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Health OS
        </Link>
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-6 text-sm text-warning/90">
          <h1 className="text-lg font-semibold text-warning mb-2">
            Mental-health consent required
          </h1>
          <p className="leading-relaxed">
            Activity tracking is gated behind your mental-health consent.
            Grant the "mental" scope on the Health OS hub to continue.
          </p>
        </div>
      </div>
    );
  }

  const date = todayUtc();
  const [entries, summary] = await Promise.all([
    listActivityEntries({
      tenantId: user.tenantId,
      userId: user.userId,
      fromDate: date,
      toDate: date,
      limit: 100,
    }),
    getDailyActivitySummary(user.tenantId, user.userId, date),
  ]);

  // Deduplicated suggestion list from the MET table.
  const suggestions = Array.from(new Set(Object.keys(MET_TABLE))).sort();

  return (
    <div className="max-w-3xl">
      <Link
        href="/dashboard/os/health"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Health OS
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <Activity className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">Activity log</h1>
      </div>
      <p className="text-sm text-text-secondary mb-5 leading-relaxed">
        Quick activity logging with MET-based kcal estimates. Phase 5c adds
        a plan builder and progressive overload tracking.
      </p>

      <CaveatBlock />

      <div className="mt-6">
        <ActivityLogger
          initialDate={date}
          initialEntries={entries}
          initialSummary={summary}
          activityTypeSuggestions={suggestions}
        />
      </div>
    </div>
  );
}

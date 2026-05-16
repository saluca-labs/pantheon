import Link from 'next/link';
import { ArrowLeft, HeartPulse, LineChart } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  listMoodEntries,
  listMoodTags,
} from '@/lib/agentic-os/health/repo';
import { CaveatBlock } from '@/components/agentic-os/health/caveat-block';
import { MoodCheckIn } from '@/components/agentic-os/health/mood-check-in';
import { MoodEntryListInline } from '@/components/agentic-os/health/mood-entry-list';

export const dynamic = 'force-dynamic';

export default async function HealthMoodPage() {
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
            Mood tracking is a mental-health feature and is gated behind your
            explicit consent. Grant the “mental” scope on the{' '}
            <Link
              href="/dashboard/os/health"
              className="underline hover:text-warning"
            >
              Health OS hub
            </Link>{' '}
            to continue.
          </p>
        </div>
      </div>
    );
  }

  // Pull last 14 days of entries for the trail and the user's tags.
  const since = new Date();
  since.setDate(since.getDate() - 14);
  const [entries, tags] = await Promise.all([
    listMoodEntries(user.userId, { from: since, withTags: true, limit: 50 }),
    listMoodTags(user.userId, user.tenantId),
  ]);

  return (
    <div className="max-w-3xl">
      <Link
        href="/dashboard/os/health"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Health OS
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <HeartPulse className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">Mood check-in</h1>
      </div>

      <CaveatBlock />

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,360px)] gap-4">
        <div className="rounded-xl border border-border-subtle bg-surface-2 p-6">
          <h2 className="text-base font-semibold text-white mb-1">
            How are you today?
          </h2>
          <p className="text-xs text-text-secondary mb-4">
            One snapshot a day works wonders. Add a journal entry from here if
            something needs unpacking.
          </p>
          <MoodCheckIn initialTags={tags} />
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border-subtle bg-surface-2 p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-white">
                Last 14 days
              </h2>
              <span className="text-xs text-text-secondary">
                {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
              </span>
            </div>
            <MoodEntryListInline entries={entries} />
          </div>

          <div className="rounded-xl border border-border-subtle bg-surface-0 p-4">
            <div className="flex items-center gap-2 mb-1">
              <LineChart className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-semibold text-white">Trends</h3>
              <span className="text-[10px] uppercase tracking-wide rounded-full border border-border-subtle bg-surface-2 px-2 py-0.5 text-text-secondary">
                Coming soon
              </span>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              Phase 4 will add weekly mood/anxiety/energy charts and tag
              correlations. For now, the trail above is the source of truth.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * HealthHubOverview — the "what should I do next" dashboard strip for the
 * Health OS hub.
 *
 * Wave C-1b adoption: converts the Health hub from a pure feature-card
 * directory into a dashboard by rendering shared-view primitives above the
 * feature grid (DashboardWidget + ChartCard + ActivityFeed + EmptyState).
 * Behavior-preserving — every datum here already exists; this surface only
 * presents it. The feature grid itself still comes from `_shared/DashboardHub`.
 *
 * Server component: receives pre-loaded snapshots from `health/page.tsx`.
 * No client interactivity needed — the chart and feed are static reads.
 */

import {
  Activity,
  Brain,
  BookOpen,
  Flower2,
  HeartPulse,
  ShieldAlert,
} from 'lucide-react';
import {
  ActivityFeed,
  ChartCard,
  DashboardWidget,
  EmptyState,
  type ActivityEvent,
  type ChartSeries,
} from '@/components/agentic-os/_shared/views';
import type {
  CbtLog,
  MoodEntry,
  RiskFlagRow,
  ScreenerRow,
} from '@/lib/agentic-os/health/repo';

const HEALTH_SLUG = 'health' as const;

const CBT_KIND_LABELS: Record<string, string> = {
  'thought-record': 'Thought record',
  'behavioral-activation': 'Behavioral activation',
  'worry-time': 'Worry time',
  'grounding-54321': '5-4-3-2-1 grounding',
  gratitude: 'Three good things',
  'values-clarification': 'Values clarification',
  'sleep-hygiene': 'Sleep hygiene',
};

export interface HealthHubOverviewProps {
  /** Active (un-dismissed) risk flags. */
  flags: RiskFlagRow[];
  /** Recent mood entries — newest first, last ~14 days. */
  moodEntries: MoodEntry[];
  /** Recent screener submissions — newest first. */
  screeners: ScreenerRow[];
  /** Recent journal entries — minimal projection for the activity feed. */
  journalEntries: { id: string; title: string | null; entryAt: string }[];
  /** Recent CBT logs — newest first. */
  cbtLogs: CbtLog[];
}

/** Average a numeric mood field over the supplied entries. */
function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Build the mood/energy/anxiety chart series from raw entries. */
function buildMoodSeries(entries: MoodEntry[]): ChartSeries[] {
  // Oldest → newest so the x-axis reads left-to-right.
  const asc = [...entries].sort(
    (a, b) => new Date(a.entryAt).getTime() - new Date(b.entryAt).getTime(),
  );
  const x = (e: MoodEntry) =>
    new Date(e.entryAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  return [
    {
      key: 'mood',
      label: 'Mood',
      data: asc.map((e) => ({ x: x(e), y: e.moodScore })),
    },
    {
      key: 'energy',
      label: 'Energy',
      data: asc.map((e) => ({ x: x(e), y: e.energyScore })),
    },
    {
      key: 'anxiety',
      label: 'Anxiety',
      data: asc.map((e) => ({ x: x(e), y: e.anxietyScore })),
    },
  ];
}

/** Merge the recent surfaces into one chronological activity feed. */
function buildActivityEvents(props: HealthHubOverviewProps): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  for (const m of props.moodEntries.slice(0, 8)) {
    events.push({
      id: `mood-${m.id}`,
      occurredAt: m.entryAt,
      icon: <HeartPulse className="h-3.5 w-3.5" />,
      tone: 'accent',
      summary:
        m.moodScore !== null
          ? `Logged a mood check-in — mood ${m.moodScore}/10`
          : 'Logged a mood check-in',
      href: '/dashboard/os/health/mood',
    });
  }
  for (const s of props.screeners.slice(0, 6)) {
    events.push({
      id: `screener-${s.id}`,
      occurredAt: s.createdAt,
      icon: <Brain className="h-3.5 w-3.5" />,
      tone: s.crisisFlag ? 'danger' : 'neutral',
      summary: `Completed ${s.screener.toUpperCase()} — score ${s.score} (${s.severity.replace(/_/g, ' ')})`,
      href: '/dashboard/os/health/screeners',
    });
  }
  for (const j of props.journalEntries.slice(0, 6)) {
    events.push({
      id: `journal-${j.id}`,
      occurredAt: j.entryAt,
      icon: <BookOpen className="h-3.5 w-3.5" />,
      tone: 'positive',
      summary: `Wrote a journal entry — ${j.title || 'Untitled entry'}`,
      href: `/dashboard/os/health/journal/${j.id}`,
    });
  }
  for (const c of props.cbtLogs.slice(0, 6)) {
    events.push({
      id: `cbt-${c.id}`,
      occurredAt: c.completedAt ?? c.startedAt,
      icon: <Activity className="h-3.5 w-3.5" />,
      tone: 'neutral',
      summary: `Completed a CBT exercise — ${CBT_KIND_LABELS[c.kind] ?? c.kind}`,
      href: `/dashboard/os/health/cbt/logs/${c.id}`,
    });
  }

  return events;
}

export function HealthHubOverview(props: HealthHubOverviewProps) {
  const { flags, moodEntries, screeners, cbtLogs } = props;

  const moodSeries = buildMoodSeries(moodEntries);
  const events = buildActivityEvents(props);
  const avgMood = avg(moodEntries.map((m) => m.moodScore));
  const latestScreener = screeners[0] ?? null;
  const highSeverityFlags = flags.filter(
    (f) => f.severity === 'critical' || f.severity === 'high',
  ).length;

  return (
    <section className="mb-6 space-y-4" data-testid="health-hub-overview">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardWidget
          title="Active risk flags"
          icon={<ShieldAlert className="h-4 w-4" />}
          osSlug={HEALTH_SLUG}
          variant={highSeverityFlags > 0 ? 'attention' : 'default'}
          href="/dashboard/os/health"
        >
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {flags.length}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {flags.length === 0
              ? 'Nothing needs your attention right now.'
              : highSeverityFlags > 0
                ? `${highSeverityFlags} high-severity — review the banner below.`
                : 'Review the badges in the banner below.'}
          </p>
        </DashboardWidget>

        <DashboardWidget
          title="Average mood"
          icon={<HeartPulse className="h-4 w-4" />}
          osSlug={HEALTH_SLUG}
          href="/dashboard/os/health/mood"
        >
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {avgMood === null ? '—' : avgMood.toFixed(1)}
            {avgMood !== null && (
              <span className="text-base text-text-tertiary"> / 10</span>
            )}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {moodEntries.length > 0
              ? `Across ${moodEntries.length} recent check-in${moodEntries.length === 1 ? '' : 's'}.`
              : 'Log a check-in to start the trend.'}
          </p>
        </DashboardWidget>

        <DashboardWidget
          title="Latest screener"
          icon={<Brain className="h-4 w-4" />}
          osSlug={HEALTH_SLUG}
          variant={latestScreener?.crisisFlag ? 'danger' : 'default'}
          href="/dashboard/os/health/screeners"
        >
          {latestScreener ? (
            <>
              <p className="text-3xl font-semibold tabular-nums text-text-primary">
                {latestScreener.score}
                <span className="text-base text-text-tertiary">
                  {' '}
                  {latestScreener.screener.toUpperCase()}
                </span>
              </p>
              <p className="mt-1 text-xs capitalize text-text-secondary">
                {latestScreener.severity.replace(/_/g, ' ')}
              </p>
            </>
          ) : (
            <>
              <p className="text-3xl font-semibold text-text-tertiary">—</p>
              <p className="mt-1 text-xs text-text-secondary">
                Take a PHQ-9 or GAD-7 to start your timeline.
              </p>
            </>
          )}
        </DashboardWidget>

        <DashboardWidget
          title="Practice this period"
          icon={<Flower2 className="h-4 w-4" />}
          osSlug={HEALTH_SLUG}
          href="/dashboard/os/health/cbt"
        >
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {cbtLogs.length}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            CBT exercises logged recently.
          </p>
        </DashboardWidget>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(0,380px)]">
        <ChartCard
          title="Mood, energy & anxiety"
          icon={<HeartPulse className="h-4 w-4" />}
          osSlug={HEALTH_SLUG}
          series={moodSeries}
          kind="line"
          yDomain={[0, 10]}
          height={220}
          emptyState={{
            title: 'No mood data yet',
            description:
              'Log a daily check-in and your mood trend will plot here.',
            primaryCta: {
              label: 'Log a check-in',
              href: '/dashboard/os/health/mood',
            },
          }}
        />

        <DashboardWidget
          title="Recent activity"
          icon={<Activity className="h-4 w-4" />}
          osSlug={HEALTH_SLUG}
        >
          {events.length === 0 ? (
            <EmptyState
              variant="bare"
              icon={<Activity className="h-6 w-6" />}
              title="Nothing logged yet"
              description="Mood check-ins, journal entries, screeners, and CBT work will show up here."
              primaryCta={{
                label: 'Start with a mood check-in',
                href: '/dashboard/os/health/mood',
              }}
            />
          ) : (
            <div className="max-h-[260px] overflow-y-auto">
              <ActivityFeed events={events} grouping="day" />
            </div>
          )}
        </DashboardWidget>
      </div>
    </section>
  );
}

/**
 * Health OS — hub dashboard-spec adapter (Wave D, UI Depth Wave).
 *
 * Pure data-shape adapter: turns the Health repo payloads (recent mood
 * entries, screener submissions, CBT logs, journal entries, risk flags,
 * plus recent meal + activity entries) into the declarative `DashboardSpec`
 * consumed by `_shared/DashboardHub`'s `dashboard` prop.
 *
 * Wave D retrofit: Health's Wave C-1b sub shipped its hub dashboard as
 * `HealthHubOverview` — a sibling strip bolted *above* `DashboardHub`,
 * because at that time `DashboardHub` had no integration prop. Since
 * v0.1.61 the hub has a declarative `dashboard` prop, so this adapter
 * mirrors how Cyber / secure-dev / filmmaker wire their hubs: the page
 * server-component fetches the data and calls this to assemble the spec.
 * No DB access, no new queries — every datum already loads in the page.
 *
 * The rollup widens Wave C's mood/screener focus to the full
 * mood / screener / activity / nutrition picture the Wave D brief calls
 * for, while preserving every existing deep-link and capability.
 *
 * @license MIT — Tiresias Health OS (internal).
 */

import {
  Activity,
  Apple,
  Brain,
  BookOpen,
  Dumbbell,
  Flame,
  Flower2,
  HeartPulse,
  ShieldAlert,
} from 'lucide-react';
import type {
  DashboardSpec,
  DashboardWidgetSpec,
} from '@/components/agentic-os/_shared/dashboard-hub';
import type {
  ActivityEvent,
  ChartSeries,
} from '@/components/agentic-os/_shared/views';
import type {
  ActivityEntry,
  CbtLog,
  MealEntry,
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

/** Minimal journal projection — the page only forwards these three fields. */
export interface JournalEntryLite {
  id: string;
  title: string | null;
  entryAt: string;
}

/**
 * Everything the Health hub rollup needs. All of it is already loaded by
 * `health/page.tsx` under the mental-scope gate — this adapter only
 * reshapes it.
 */
export interface HealthDashboardInput {
  /** Active (un-dismissed) risk flags. */
  flags: RiskFlagRow[];
  /** Recent mood entries — last ~14 days, any order. */
  moodEntries: MoodEntry[];
  /** Recent screener submissions — newest first. */
  screeners: ScreenerRow[];
  /** Recent journal entries — minimal projection. */
  journalEntries: JournalEntryLite[];
  /** Recent CBT logs — newest first. */
  cbtLogs: CbtLog[];
  /** Recent meal-log entries — last ~7 days. */
  mealEntries: MealEntry[];
  /** Recent activity-log entries — last ~7 days. */
  activityEntries: ActivityEntry[];
}

/** Average a numeric field over the supplied values, ignoring nulls. */
function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** A short "Mon 12" style label for an ISO date, formatted in UTC. */
function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/** Build the mood / energy / anxiety chart series from raw entries. */
function buildMoodSeries(entries: MoodEntry[]): ChartSeries[] {
  // Oldest → newest so the x-axis reads left-to-right.
  const asc = [...entries].sort(
    (a, b) => new Date(a.entryAt).getTime() - new Date(b.entryAt).getTime(),
  );
  return [
    {
      key: 'mood',
      label: 'Mood',
      data: asc.map((e) => ({ x: dayLabel(e.entryAt), y: e.moodScore })),
    },
    {
      key: 'energy',
      label: 'Energy',
      data: asc.map((e) => ({ x: dayLabel(e.entryAt), y: e.energyScore })),
    },
    {
      key: 'anxiety',
      label: 'Anxiety',
      data: asc.map((e) => ({ x: dayLabel(e.entryAt), y: e.anxietyScore })),
    },
  ];
}

/**
 * Merge the recent surfaces into one chronological activity feed —
 * mood, screeners, journal, CBT, meals, and activity sessions.
 */
export function buildHealthActivityEvents(
  input: HealthDashboardInput,
): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  for (const m of input.moodEntries.slice(0, 8)) {
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
  for (const s of input.screeners.slice(0, 6)) {
    events.push({
      id: `screener-${s.id}`,
      occurredAt: s.createdAt,
      icon: <Brain className="h-3.5 w-3.5" />,
      tone: s.crisisFlag ? 'danger' : 'neutral',
      summary: `Completed ${s.screener.toUpperCase()} — score ${s.score} (${s.severity.replace(/_/g, ' ')})`,
      href: '/dashboard/os/health/screeners',
    });
  }
  for (const j of input.journalEntries.slice(0, 6)) {
    events.push({
      id: `journal-${j.id}`,
      occurredAt: j.entryAt,
      icon: <BookOpen className="h-3.5 w-3.5" />,
      tone: 'positive',
      summary: `Wrote a journal entry — ${j.title || 'Untitled entry'}`,
      href: `/dashboard/os/health/journal/${j.id}`,
    });
  }
  for (const c of input.cbtLogs.slice(0, 6)) {
    events.push({
      id: `cbt-${c.id}`,
      occurredAt: c.completedAt ?? c.startedAt,
      icon: <Activity className="h-3.5 w-3.5" />,
      tone: 'neutral',
      summary: `Completed a CBT exercise — ${CBT_KIND_LABELS[c.kind] ?? c.kind}`,
      href: `/dashboard/os/health/cbt/logs/${c.id}`,
    });
  }
  for (const e of input.mealEntries.slice(0, 6)) {
    const label =
      e.foodItem?.name ?? e.freeformDescription ?? 'a meal';
    events.push({
      id: `meal-${e.id}`,
      // Meal entries carry only a date; anchor at local noon so they sort
      // mid-day rather than ambiguously at the day boundary.
      occurredAt: `${e.entryDate}T12:00:00`,
      icon: <Apple className="h-3.5 w-3.5" />,
      tone: 'positive',
      summary: `Logged ${e.mealSlot} — ${label}`,
      href: '/dashboard/os/health/nutrition',
    });
  }
  for (const a of input.activityEntries.slice(0, 6)) {
    events.push({
      id: `activity-${a.id}`,
      occurredAt: `${a.entryDate}T12:00:00`,
      icon: <Dumbbell className="h-3.5 w-3.5" />,
      tone: 'accent',
      summary: `Logged activity — ${a.activityType} (${a.durationMin} min, ${a.intensity})`,
      href: '/dashboard/os/health/activity',
    });
  }

  return events;
}

/**
 * Assemble the full `DashboardSpec` for the Health OS hub.
 *
 * - `widgets`: the mood / screener / activity / nutrition rollup — active
 *   risk flags, average mood, latest screener, CBT practice count, meals
 *   logged + calorie intake, activity sessions + minutes moved. Each
 *   drills into its underlying feature page via `href`.
 * - `chart`: the 14-day mood / energy / anxiety line chart.
 * - `activity`: a merged chronological feed across all six surfaces.
 */
export function buildHealthDashboardSpec(
  input: HealthDashboardInput,
): DashboardSpec {
  const {
    flags,
    moodEntries,
    screeners,
    cbtLogs,
    mealEntries,
    activityEntries,
  } = input;

  const moodSeries = buildMoodSeries(moodEntries);
  const avgMood = avg(moodEntries.map((m) => m.moodScore));
  const latestScreener = screeners[0] ?? null;
  const highSeverityFlags = flags.filter(
    (f) => f.severity === 'critical' || f.severity === 'high',
  ).length;
  const hasCrisisFlag = flags.some((f) => f.kind === 'crisis-language');

  const mealKcal = mealEntries.reduce(
    (sum, e) => sum + (e.nutrients.kcal ?? 0),
    0,
  );
  const activityMinutes = activityEntries.reduce(
    (sum, e) => sum + e.durationMin,
    0,
  );

  const widgets: DashboardWidgetSpec[] = [
    {
      title: 'Active risk flags',
      icon: <ShieldAlert className="h-4 w-4" />,
      href: '/dashboard/os/health',
      variant: hasCrisisFlag
        ? 'danger'
        : highSeverityFlags > 0
          ? 'attention'
          : 'default',
      'data-testid': 'health-widget-risk-flags',
      children: (
        <div>
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {flags.length}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {flags.length === 0
              ? 'Nothing needs your attention right now.'
              : hasCrisisFlag
                ? 'Crisis-language flag active — see the banner below.'
                : highSeverityFlags > 0
                  ? `${highSeverityFlags} high-severity — review the banner below.`
                  : 'Review the badges in the banner below.'}
          </p>
        </div>
      ),
    },
    {
      title: 'Average mood',
      icon: <HeartPulse className="h-4 w-4" />,
      href: '/dashboard/os/health/mood',
      'data-testid': 'health-widget-avg-mood',
      children: (
        <div>
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
        </div>
      ),
    },
    {
      title: 'Latest screener',
      icon: <Brain className="h-4 w-4" />,
      href: '/dashboard/os/health/screeners',
      variant: latestScreener?.crisisFlag ? 'danger' : 'default',
      'data-testid': 'health-widget-latest-screener',
      children: latestScreener ? (
        <div>
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
        </div>
      ) : (
        <div>
          <p className="text-3xl font-semibold text-text-tertiary">—</p>
          <p className="mt-1 text-xs text-text-secondary">
            Take a PHQ-9 or GAD-7 to start your timeline.
          </p>
        </div>
      ),
    },
    {
      title: 'CBT practice',
      icon: <Flower2 className="h-4 w-4" />,
      href: '/dashboard/os/health/cbt',
      'data-testid': 'health-widget-cbt-practice',
      children: (
        <div>
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {cbtLogs.length}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            CBT exercises logged recently.
          </p>
        </div>
      ),
    },
    {
      title: 'Nutrition (7d)',
      icon: <Apple className="h-4 w-4" />,
      href: '/dashboard/os/health/nutrition',
      'data-testid': 'health-widget-nutrition',
      children: (
        <div>
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {mealEntries.length}
            <span className="text-base text-text-tertiary"> meals</span>
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-text-secondary">
            <Flame className="h-3 w-3" />
            {mealEntries.length > 0
              ? `${Math.round(mealKcal).toLocaleString()} kcal logged this week.`
              : 'Log a meal to start tracking intake.'}
          </p>
        </div>
      ),
    },
    {
      title: 'Activity (7d)',
      icon: <Dumbbell className="h-4 w-4" />,
      href: '/dashboard/os/health/activity',
      'data-testid': 'health-widget-activity',
      children: (
        <div>
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {activityEntries.length}
            <span className="text-base text-text-tertiary"> sessions</span>
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {activityEntries.length > 0
              ? `${activityMinutes} min moved this week.`
              : 'Log a workout to start the streak.'}
          </p>
        </div>
      ),
    },
  ];

  return {
    widgets,
    chart: {
      title: 'Mood, energy & anxiety',
      icon: <HeartPulse className="h-4 w-4" />,
      kind: 'line',
      yDomain: [0, 10],
      height: 220,
      series: moodSeries,
      emptyState: {
        title: 'No mood data yet',
        description:
          'Log a daily check-in and your mood trend will plot here.',
        primaryCta: {
          label: 'Log a check-in',
          href: '/dashboard/os/health/mood',
        },
      },
    },
    activity: {
      events: buildHealthActivityEvents(input),
      grouping: 'day',
      emptyState: {
        title: 'Nothing logged yet',
        description:
          'Mood check-ins, journal entries, screeners, CBT work, meals, and workouts will show up here.',
        primaryCta: {
          label: 'Start with a mood check-in',
          href: '/dashboard/os/health/mood',
        },
      },
    },
  };
}

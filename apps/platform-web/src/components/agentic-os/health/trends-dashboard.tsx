'use client';

/**
 * Client wrapper for the Health OS trends dashboard. The server page
 * passes the initial trends payload + window; this component owns the
 * window selector and refetches on change.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ActivitySquare,
  BookOpen,
  Brain,
  Flower2,
  TrendingUp,
  Utensils,
} from 'lucide-react';
import { TrendChart, type TrendSeries } from '@/components/agentic-os/_shared/trend-chart';
import { TagHeatmap } from '@/components/agentic-os/_shared/tag-heatmap';
import { StatCard } from '@/components/agentic-os/_shared/stat-card';
import { ActivitySuggestionCard } from '@/components/agentic-os/health/activity/activity-suggestion-card';
import {
  ACCENT,
  ACCENT_INFO,
  DANGER,
  OS_ACCENT,
  POSITIVE,
  WARNING,
} from '@/lib/design/chart-tokens';
const SERIES_VIOLET = OS_ACCENT['secure-dev']!; // secure-dev OS accent — reused here for cross-OS palette consistency

export type TrendWindow = '7d' | '30d' | '90d';

export interface TrendsPayload {
  window: TrendWindow;
  windowDays: number;
  mood_series: {
    date: string;
    mood: number | null;
    energy: number | null;
    anxiety: number | null;
    sleep: number | null;
  }[];
  screener_series: { date: string; kind: string; score: number }[];
  tag_heatmap: { tag: string; bucket: string; count: number }[];
  nutrition_series: {
    date: string;
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }[];
  activity_series: {
    date: string;
    duration_min: number;
    kcal_burned: number;
  }[];
  stats: {
    avg_mood: number | null;
    journal_count: number;
    cbt_count: number;
    meditation_count: number;
    screener_trend: 'up' | 'down' | 'flat';
    avg_daily_kcal: number | null;
    avg_daily_active_min: number | null;
  };
}

const WINDOWS: TrendWindow[] = ['7d', '30d', '90d'];
const DOW_BUCKETS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function buildMoodSeries(rows: TrendsPayload['mood_series']): TrendSeries[] {
  return [
    {
      key: 'mood',
      label: 'Mood',
      color: POSITIVE,
      data: rows.map((r) => ({ date: r.date, value: r.mood })),
    },
    {
      key: 'energy',
      label: 'Energy',
      color: ACCENT,
      data: rows.map((r) => ({ date: r.date, value: r.energy })),
    },
    {
      key: 'anxiety',
      label: 'Anxiety',
      color: WARNING,
      data: rows.map((r) => ({ date: r.date, value: r.anxiety })),
    },
    {
      key: 'sleep',
      label: 'Sleep (1-4)',
      color: SERIES_VIOLET,
      data: rows.map((r) => ({ date: r.date, value: r.sleep })),
    },
  ];
}

function buildNutritionSeries(
  rows: TrendsPayload['nutrition_series'],
): TrendSeries[] {
  return [
    {
      key: 'kcal',
      label: 'kcal',
      color: POSITIVE,
      data: rows.map((r) => ({ date: r.date, value: r.kcal })),
    },
    {
      key: 'protein_g',
      label: 'Protein g',
      color: ACCENT,
      data: rows.map((r) => ({ date: r.date, value: r.protein_g })),
    },
    {
      key: 'carbs_g',
      label: 'Carbs g',
      color: WARNING,
      data: rows.map((r) => ({ date: r.date, value: r.carbs_g })),
    },
    {
      key: 'fat_g',
      label: 'Fat g',
      color: SERIES_VIOLET,
      data: rows.map((r) => ({ date: r.date, value: r.fat_g })),
    },
  ];
}

function buildActivitySeries(
  rows: TrendsPayload['activity_series'],
): TrendSeries[] {
  return [
    {
      key: 'duration_min',
      label: 'Duration (min)',
      color: POSITIVE,
      data: rows.map((r) => ({ date: r.date, value: r.duration_min })),
    },
    {
      key: 'kcal_burned',
      label: 'kcal burned',
      color: WARNING,
      data: rows.map((r) => ({ date: r.date, value: r.kcal_burned })),
    },
  ];
}

function buildScreenerSeries(
  rows: TrendsPayload['screener_series'],
): TrendSeries[] {
  const kinds: Record<string, { label: string; color: string }> = {
    phq9: { label: 'PHQ-9', color: DANGER },
    gad7: { label: 'GAD-7', color: WARNING },
    pss: { label: 'PSS-10', color: ACCENT_INFO },
  };
  return Object.entries(kinds).map(([key, meta]) => ({
    key,
    label: meta.label,
    color: meta.color,
    data: rows
      .filter((r) => r.kind === key)
      .map((r) => ({ date: r.date, value: r.score })),
  }));
}

export function TrendsDashboard({ initial }: { initial: TrendsPayload }) {
  const [window, setWindow] = useState<TrendWindow>(initial.window);
  const [data, setData] = useState<TrendsPayload>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (w: TrendWindow) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/health/trends?window=${w}`,
        { cache: 'no-store' },
      );
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? 'Failed to load trends');
      setData(json as TrendsPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load trends');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (window !== initial.window) {
      void refetch(window);
    }
    // We intentionally do NOT refetch on mount — `initial` is already
    // server-rendered for the default window. The effect only fires
    // when the user picks a different window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window]);

  const trendDirection = data.stats.screener_trend;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center rounded-lg border border-border-subtle bg-surface-0 p-1">
          {WINDOWS.map((w) => {
            const active = w === window;
            return (
              <button
                key={w}
                type="button"
                onClick={() => setWindow(w)}
                disabled={loading}
                className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
                  active
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:text-white'
                }`}
              >
                {w}
              </button>
            );
          })}
        </div>
        {loading && (
          <span className="text-xs text-text-secondary">Updating…</span>
        )}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>

      <ActivitySuggestionCard />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          label={`Avg mood (${window})`}
          value={
            data.stats.avg_mood === null
              ? '—'
              : data.stats.avg_mood.toFixed(1)
          }
          icon={<TrendingUp className="w-3.5 h-3.5" />}
        />
        <StatCard
          label="Journal entries"
          value={data.stats.journal_count}
          icon={<BookOpen className="w-3.5 h-3.5" />}
        />
        <StatCard
          label="CBT logs"
          value={data.stats.cbt_count}
          icon={<Brain className="w-3.5 h-3.5" />}
        />
        <StatCard
          label="Meditations"
          value={data.stats.meditation_count}
          icon={<Flower2 className="w-3.5 h-3.5" />}
        />
        <StatCard
          label="Avg daily kcal"
          value={
            data.stats.avg_daily_kcal === null
              ? '—'
              : data.stats.avg_daily_kcal.toFixed(0)
          }
          icon={<Utensils className="w-3.5 h-3.5" />}
        />
        <StatCard
          label="Avg daily active min"
          value={
            data.stats.avg_daily_active_min === null
              ? '—'
              : data.stats.avg_daily_active_min.toFixed(0)
          }
          icon={<Activity className="w-3.5 h-3.5" />}
        />
      </div>

      <section className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <div className="flex items-center gap-2 mb-3">
          <ActivitySquare className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold text-white">
            Mood, energy, anxiety, sleep
          </h2>
        </div>
        <TrendChart
          series={buildMoodSeries(data.mood_series)}
          yDomain={[0, 10]}
        />
      </section>

      <section className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-white">Screener scores</h2>
          </div>
          <span className="text-[10px] uppercase tracking-wide text-text-secondary">
            PHQ-9 trend:{' '}
            <span
              className={
                trendDirection === 'up'
                  ? 'text-warning'
                  : trendDirection === 'down'
                    ? 'text-positive'
                    : 'text-text-primary'
              }
            >
              {trendDirection === 'up'
                ? '↑ worsening'
                : trendDirection === 'down'
                  ? '↓ improving'
                  : '→ flat'}
            </span>
          </span>
        </div>
        <TrendChart
          series={buildScreenerSeries(data.screener_series)}
          emptyLabel="No screeners in this window — take PHQ-9 / GAD-7 / PSS-10 to start the trend."
        />
      </section>

      <section className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Utensils className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold text-white">Nutrition</h2>
        </div>
        <TrendChart
          series={buildNutritionSeries(data.nutrition_series)}
          emptyLabel="No meals logged in this window — start tracking on the Nutrition page."
        />
      </section>

      <section className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold text-white">Activity</h2>
        </div>
        <TrendChart
          series={buildActivitySeries(data.activity_series)}
          emptyLabel="No activity logged in this window — start tracking on the Activity page."
        />
      </section>

      <section className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <h2 className="text-sm font-semibold text-white mb-3">
          Mood tag × weekday
        </h2>
        <TagHeatmap data={data.tag_heatmap} buckets={DOW_BUCKETS} />
      </section>
    </div>
  );
}

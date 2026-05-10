'use client';

/**
 * Client wrapper for the Health OS trends dashboard. The server page
 * passes the initial trends payload + window; this component owns the
 * window selector and refetches on change.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivitySquare,
  BookOpen,
  Brain,
  Flower2,
  TrendingUp,
} from 'lucide-react';
import { TrendChart, type TrendSeries } from '@/components/agentic-os/_shared/trend-chart';
import { TagHeatmap } from '@/components/agentic-os/_shared/tag-heatmap';
import { StatCard } from '@/components/agentic-os/_shared/stat-card';

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
  stats: {
    avg_mood: number | null;
    journal_count: number;
    cbt_count: number;
    meditation_count: number;
    screener_trend: 'up' | 'down' | 'flat';
  };
}

const WINDOWS: TrendWindow[] = ['7d', '30d', '90d'];
const DOW_BUCKETS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function buildMoodSeries(rows: TrendsPayload['mood_series']): TrendSeries[] {
  return [
    {
      key: 'mood',
      label: 'Mood',
      color: '#10b981',
      data: rows.map((r) => ({ date: r.date, value: r.mood })),
    },
    {
      key: 'energy',
      label: 'Energy',
      color: '#4361EE',
      data: rows.map((r) => ({ date: r.date, value: r.energy })),
    },
    {
      key: 'anxiety',
      label: 'Anxiety',
      color: '#f59e0b',
      data: rows.map((r) => ({ date: r.date, value: r.anxiety })),
    },
    {
      key: 'sleep',
      label: 'Sleep (1-4)',
      color: '#a855f7',
      data: rows.map((r) => ({ date: r.date, value: r.sleep })),
    },
  ];
}

function buildScreenerSeries(
  rows: TrendsPayload['screener_series'],
): TrendSeries[] {
  const kinds: Record<string, { label: string; color: string }> = {
    phq9: { label: 'PHQ-9', color: '#ef4444' },
    gad7: { label: 'GAD-7', color: '#f59e0b' },
    pss: { label: 'PSS-10', color: '#06b6d4' },
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
        <div className="inline-flex items-center rounded-lg border border-[#2a2d3e] bg-[#0f1117] p-1">
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
                    ? 'bg-[#4361EE] text-white'
                    : 'text-[#94a3b8] hover:text-white'
                }`}
              >
                {w}
              </button>
            );
          })}
        </div>
        {loading && (
          <span className="text-xs text-[#94a3b8]">Updating…</span>
        )}
        {error && <span className="text-xs text-red-300">{error}</span>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
      </div>

      <section className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
        <div className="flex items-center gap-2 mb-3">
          <ActivitySquare className="w-4 h-4 text-[#4361EE]" />
          <h2 className="text-sm font-semibold text-white">
            Mood, energy, anxiety, sleep
          </h2>
        </div>
        <TrendChart
          series={buildMoodSeries(data.mood_series)}
          yDomain={[0, 10]}
        />
      </section>

      <section className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-[#4361EE]" />
            <h2 className="text-sm font-semibold text-white">Screener scores</h2>
          </div>
          <span className="text-[10px] uppercase tracking-wide text-[#94a3b8]">
            PHQ-9 trend:{' '}
            <span
              className={
                trendDirection === 'up'
                  ? 'text-amber-300'
                  : trendDirection === 'down'
                    ? 'text-emerald-300'
                    : 'text-[#cbd5e1]'
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

      <section className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
        <h2 className="text-sm font-semibold text-white mb-3">
          Mood tag × weekday
        </h2>
        <TagHeatmap data={data.tag_heatmap} buckets={DOW_BUCKETS} />
      </section>
    </div>
  );
}

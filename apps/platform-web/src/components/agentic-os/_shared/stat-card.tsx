/**
 * Reusable stat tile for Agentic OS dashboards. OS-agnostic — pass a
 * label, a value, and an optional trend indicator. Layout matches the
 * rest of the dashboard cards (dark border, dark surface, blue accent).
 */

import type { ReactNode } from 'react';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';

export type StatTrend = 'up' | 'down' | 'flat';

export interface StatCardProps {
  label: string;
  /** The value to display. Strings/numbers/null are accepted. */
  value: string | number | null;
  /** Optional secondary line under the value. */
  sublabel?: string;
  /** Optional small icon rendered at the top-left. */
  icon?: ReactNode;
  /** Optional trend indicator. */
  trend?: StatTrend;
  /** Override the default trend semantic: when true, "down" is good (e.g. screener scores). */
  trendDownIsGood?: boolean;
}

const TREND_ICON = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
} as const;

export function StatCard({
  label,
  value,
  sublabel,
  icon,
  trend,
  trendDownIsGood,
}: StatCardProps) {
  const Icon = trend ? TREND_ICON[trend] : null;
  const trendColor = (() => {
    if (!trend || trend === 'flat') return 'text-[#94a3b8]';
    const isGood = trend === 'up' ? !trendDownIsGood : trendDownIsGood;
    return isGood ? 'text-emerald-300' : 'text-amber-300';
  })();

  return (
    <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {icon ? (
            <span className="text-[#4361EE] shrink-0">{icon}</span>
          ) : null}
          <span className="text-[10px] uppercase tracking-wide text-[#94a3b8] truncate">
            {label}
          </span>
        </div>
        {Icon && (
          <Icon className={`w-4 h-4 ${trendColor} shrink-0`} aria-hidden="true" />
        )}
      </div>
      <div className="text-2xl font-semibold text-white tabular-nums">
        {value === null || value === undefined || value === '' ? '—' : value}
      </div>
      {sublabel ? (
        <p className="text-xs text-[#94a3b8] mt-1">{sublabel}</p>
      ) : null}
    </div>
  );
}

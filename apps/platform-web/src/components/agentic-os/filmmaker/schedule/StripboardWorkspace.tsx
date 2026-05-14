'use client';

/**
 * Filmmaker OS — StripboardWorkspace.
 *
 * Two-pane layout: unscheduled scenes on the left, day stack on the
 * right. Handles "Add day" and orchestrates the children.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus } from 'lucide-react';
import type { ScreenplayScene } from '@/lib/agentic-os/filmmaker/screenplays';
import type {
  ProjectScheduleSummary,
  ShootingDay,
  ShootingDayWithStrips,
} from '@/lib/agentic-os/filmmaker/schedule';
import { pagesLabel } from '@/lib/agentic-os/filmmaker/breakdown';
import { UnscheduledScenesPanel } from './UnscheduledScenesPanel';
import { ShootingDayCard } from './ShootingDayCard';
import { ScheduleTimelineView } from './ScheduleTimelineView';

interface Props {
  projectId: string;
  unscheduledScenes: ScreenplayScene[];
  days: ShootingDayWithStrips[];
  summary: ProjectScheduleSummary;
}

export function StripboardWorkspace({
  projectId,
  unscheduledScenes,
  days,
  summary,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function addDay() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/filmmaker/projects/${projectId}/shooting-days`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const pct =
    summary.totalScenes === 0
      ? 0
      : Math.round((summary.scheduledScenes / summary.totalScenes) * 100);
  const allDaysBare: ShootingDay[] = days.map((d) => ({
    id: d.id,
    projectId: d.projectId,
    shootDate: d.shootDate,
    dayNumber: d.dayNumber,
    label: d.label,
    callTime: d.callTime,
    wrapTime: d.wrapTime,
    unit: d.unit,
    status: d.status,
    notes: d.notes,
    metadata: d.metadata,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Days" value={String(summary.totalDays)} />
        <Stat
          label="Scheduled"
          value={`${pct}%`}
          hint={`${summary.scheduledScenes} / ${summary.totalScenes} scenes`}
        />
        <Stat
          label="Scheduled pages"
          value={pagesLabel(summary.scheduledEighths)}
          hint={`${summary.scheduledEighths} / ${summary.totalEighths} eighths`}
        />
        <Stat
          label="Total minutes"
          value={summary.totalScheduledMinutes > 0 ? `${summary.totalScheduledMinutes}` : '—'}
          hint="est. shoot minutes"
        />
      </div>

      {/* Shoot-calendar overview — TimelineView specialization over dated days.
          Renders null when no day has a shootDate; the editor below is the
          source of truth for ordinal (undated) days. */}
      <ScheduleTimelineView days={days} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: unscheduled */}
        <div className="lg:col-span-1">
          <UnscheduledScenesPanel
            projectId={projectId}
            scenes={unscheduledScenes}
            days={allDaysBare}
          />
        </div>

        {/* Right: day cards */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">
              Shooting days{' '}
              <span className="text-text-secondary font-normal">({days.length})</span>
            </h2>
            <button
              type="button"
              onClick={addDay}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border-subtle bg-surface-2 text-text-primary hover:border-accent/60 hover:text-white disabled:opacity-40"
            >
              <CalendarPlus className="w-3.5 h-3.5" /> Add day
            </button>
          </div>
          {days.length === 0 ? (
            <div className="rounded-xl border border-border-subtle bg-surface-2 p-8 text-center">
              <p className="text-sm text-text-secondary">
                No shooting days yet. Add one to start laying out the schedule.
              </p>
            </div>
          ) : (
            days.map((d) => (
              <ShootingDayCard key={d.id} day={d} allDays={allDaysBare} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 p-4">
      <p className="text-[10px] uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="text-xl font-semibold text-text-primary mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-text-tertiary mt-0.5">{hint}</p>}
    </div>
  );
}

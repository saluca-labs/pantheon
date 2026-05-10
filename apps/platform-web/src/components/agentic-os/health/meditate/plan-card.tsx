import { CalendarDays, Clock } from 'lucide-react';
import type { MeditationPlan } from '@/lib/agentic-os/health/repo';
import {
  getMeditationEntry,
  type MeditationCatalogEntry,
} from '@/lib/agentic-os/health/meditation-catalog';

interface Props {
  plan: MeditationPlan | null;
  /** Optional remote catalog (when proxy returned a real Medito payload). */
  catalog?: MeditationCatalogEntry[];
}

const DAY_LABELS: Record<string, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

export function PlanCard({ plan, catalog }: Props) {
  if (!plan) {
    return (
      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6">
        <div className="flex items-center gap-2 mb-2">
          <CalendarDays className="w-5 h-5 text-[#4361EE]" />
          <h2 className="text-base font-semibold text-white">
            No active plan yet
          </h2>
        </div>
        <p className="text-sm text-[#94a3b8] leading-relaxed">
          Generate a 7-day plan tailored to your recent mood, sleep, and
          stress signals. Plans are rules-based — no LLM is involved.
        </p>
      </div>
    );
  }

  function lookup(slug: string): MeditationCatalogEntry | null {
    if (catalog) {
      const remote = catalog.find((c) => c.slug === slug);
      if (remote) return remote;
    }
    return getMeditationEntry(slug);
  }

  return (
    <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-[#4361EE]" />
          <h2 className="text-base font-semibold text-white">
            Week of {plan.weekStart}
          </h2>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-[#94a3b8]/70">
          {plan.plan.length} days
        </span>
      </div>
      <ul className="space-y-2">
        {plan.plan.map((slot, idx) => {
          const entry = lookup(slot.session_slug);
          return (
            <li
              key={`${slot.day}-${idx}`}
              className="flex items-center gap-3 rounded-lg border border-[#2a2d3e] bg-[#0f1117] px-3 py-2"
            >
              <span className="text-xs font-mono text-[#94a3b8] w-10">
                {DAY_LABELS[slot.day] ?? slot.day}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">
                  {entry?.title ?? slot.session_slug}
                </div>
                {entry?.description && (
                  <div className="text-xs text-[#94a3b8] truncate">
                    {entry.description}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 text-[10px] text-[#94a3b8]">
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {slot.duration_min}m
                </span>
                <span className="rounded-full border border-[#2a2d3e] px-2 py-0.5">
                  {slot.focus}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

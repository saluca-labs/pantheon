'use client';

/**
 * Research OS — ExperimentPhaseProgress.
 *
 * Read-only stepper visualization for the 5 lifecycle phases (planning,
 * running, analysis, writeup, published). Mirrors the UX of Maker's
 * PhaseProgressMini.
 *
 * Phase 1 ships the visualization only — phase edits route through the
 * full experiment PATCH endpoint (PATCH /experiments/[id]) rather than a
 * dedicated phase-progress endpoint. Phase 2+ may add the dedicated
 * endpoint if real-time editing on the experiment detail page becomes
 * the dominant write pattern.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import {
  EXPERIMENT_PHASES,
  EXPERIMENT_PHASE_LABELS,
  experimentPhaseAvg,
  type PhaseProgress,
} from '@/lib/agentic-os/research/experiments';

interface Props {
  phaseProgress: PhaseProgress;
}

export function ExperimentPhaseProgress({ phaseProgress }: Props) {
  const avg = experimentPhaseAvg(phaseProgress);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs text-[#94a3b8]">
          Overall progress: <span className="text-white font-medium">{avg}%</span>
        </span>
      </div>

      {EXPERIMENT_PHASES.map((key) => {
        const pct = phaseProgress[key] ?? 0;
        return (
          <div key={key} className="rounded-lg border border-[#2a2d3e] bg-[#1a1d27] p-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-sm font-medium text-white">
                {EXPERIMENT_PHASE_LABELS[key]}
              </span>
              <span className="text-xs text-[#94a3b8]">
                <span className="text-white font-medium">{pct}</span>%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[#0f1117] overflow-hidden">
              <div
                className="h-full bg-[#4361EE] transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Compact, read-only version for list cards. Shows a single row of N=5
 * mini bars with abbreviated phase labels under each.
 */
export function ExperimentPhaseProgressMini({
  phaseProgress,
}: {
  phaseProgress: PhaseProgress;
}) {
  return (
    <div className="grid grid-cols-5 gap-1">
      {EXPERIMENT_PHASES.map((key) => (
        <div key={key} className="flex flex-col items-center gap-1">
          <div className="h-1 w-full rounded-full bg-[#0f1117] overflow-hidden">
            <div
              className="h-full bg-[#4361EE]"
              style={{ width: `${phaseProgress[key] ?? 0}%` }}
            />
          </div>
          <span className="text-[9px] uppercase tracking-wide text-[#94a3b8]">
            {EXPERIMENT_PHASE_LABELS[key].slice(0, 4)}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Maker OS — ProjectPhaseStrip (Wave D.4).
 *
 * A compact, horizontal at-a-glance strip of the project's 7 lifecycle
 * phases — concept → done — rendered above the project hub's tab strip so
 * the maker sees overall build state without opening the Overview tab.
 *
 * Each phase is a segment whose fill height/intensity tracks its stored
 * `phase_progress` percentage; the segment matching the project's current
 * `status` carries a "current" marker. Fully read-only — the editable
 * `PhaseProgressEditor` still lives on the Overview tab and owns all
 * mutations. This is a server-renderable presentation component (no client
 * hooks), so it costs nothing on first paint.
 *
 * Why bespoke, not `TimelineView`: the phase strip is a sequential
 * progress ladder (ordinal phases, 0-100% fill each), not a time-axis of
 * dated spans. `TimelineView` positions items by date offset within a
 * range — there are no dates here. A bespoke strip is the honest fit;
 * `TimelineView` stays the primitive for the dated Milestones surface.
 *
 * @license MIT — Tiresias Maker OS Wave D.4 (internal).
 */

import {
  MAKER_PHASES,
  MAKER_PHASE_LABELS,
  coercePhaseProgress,
  projectPhaseAvg,
  type MakerPhase,
  type ProjectStatus,
} from '@/lib/agentic-os/maker/projects';

interface Props {
  /** Raw `phase_progress` JSONB read from the project row. */
  phaseProgress: unknown;
  /** The project's current lifecycle status — marks the "current" segment. */
  status: ProjectStatus;
}

/** Fill tint for a phase segment by completion band. */
function fillClass(pct: number): string {
  if (pct >= 100) return 'bg-positive';
  if (pct >= 50) return 'bg-accent';
  if (pct > 0) return 'bg-accent/60';
  return 'bg-surface-0';
}

export function ProjectPhaseStrip({ phaseProgress, status }: Props) {
  const phases = coercePhaseProgress(phaseProgress);
  const avg = projectPhaseAvg(phaseProgress);
  // `archived` is not a phase slot — fall back to no current marker.
  const currentPhase: MakerPhase | null = (MAKER_PHASES as readonly string[]).includes(
    status,
  )
    ? (status as MakerPhase)
    : null;

  return (
    <div
      data-testid="project-phase-strip"
      className="mb-6 rounded-xl border border-border-subtle bg-surface-2 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Phase progress
        </h2>
        <span className="text-xs text-text-secondary">
          Overall{' '}
          <span className="font-semibold tabular-nums text-white">{avg}%</span>
        </span>
      </div>
      <div className="flex items-end gap-1.5">
        {MAKER_PHASES.map((key) => {
          const pct = phases[key];
          const isCurrent = key === currentPhase;
          return (
            <div
              key={key}
              data-testid={`phase-segment-${key}`}
              data-current={isCurrent || undefined}
              className="flex flex-1 flex-col items-center gap-1.5"
            >
              {/* Vertical fill bar — height tracks completion. */}
              <div className="relative h-12 w-full overflow-hidden rounded-md bg-surface-0">
                <div
                  className={`absolute inset-x-0 bottom-0 transition-all ${fillClass(pct)}`}
                  style={{ height: `${pct}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular-nums text-white mix-blend-difference">
                  {pct}%
                </span>
                {isCurrent && (
                  <span
                    className="absolute inset-x-0 top-0 h-0.5 bg-os-maker"
                    aria-hidden="true"
                  />
                )}
              </div>
              <span
                className={`text-center text-[9px] uppercase tracking-wide ${
                  isCurrent
                    ? 'font-semibold text-os-maker'
                    : 'text-text-secondary'
                }`}
              >
                {MAKER_PHASE_LABELS[key]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

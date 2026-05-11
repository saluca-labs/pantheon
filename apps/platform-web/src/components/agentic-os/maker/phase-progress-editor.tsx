'use client';

/**
 * Maker OS — PhaseProgressEditor.
 *
 * Renders one stepper per non-archived lifecycle phase (7 phases). Each
 * phase is editable inline via +/- buttons in 5% increments or a numeric
 * input; changes are debounced and PATCHed to the
 * `projects/[id]/phase-progress` endpoint.
 *
 * Two convenience buttons sit at the top:
 *   - "Reset to 0" per slider (the small × at the right of each row).
 *   - "Mark all done (100)" — bulk-sets every slider to 100 and flushes.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MAKER_PHASES,
  MAKER_PHASE_LABELS,
  type MakerPhase,
  type PhaseProgress,
} from '@/lib/agentic-os/maker/projects';

interface Props {
  projectId: string;
  initial: PhaseProgress;
}

const STEP = 5;
const FLUSH_DELAY_MS = 600;

export function PhaseProgressEditor({ projectId, initial }: Props) {
  const [phases, setPhases] = useState<PhaseProgress>(initial);
  const [pending, setPending] = useState<Partial<PhaseProgress>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(
    async (toFlush: Partial<PhaseProgress>) => {
      if (Object.keys(toFlush).length === 0) return;
      setSaving(true);
      try {
        const r = await fetch(
          `/api/tiresias/agentic-os/maker/projects/${projectId}/phase-progress`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toFlush),
          },
        );
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error ?? `Save failed (${r.status})`);
        }
        setPending({});
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setSaving(false);
      }
    },
    [projectId],
  );

  // Debounced flush on every change.
  useEffect(() => {
    if (Object.keys(pending).length === 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      flush(pending);
    }, FLUSH_DELAY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pending, flush]);

  function bump(key: MakerPhase, delta: number) {
    setPhases((prev) => {
      const next = Math.max(0, Math.min(100, prev[key] + delta));
      const updated = { ...prev, [key]: next };
      setPending((p) => ({ ...p, [key]: next }));
      return updated;
    });
  }

  function setValue(key: MakerPhase, raw: string) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const v = Math.max(0, Math.min(100, Math.round(parsed)));
    setPhases((prev) => ({ ...prev, [key]: v }));
    setPending((p) => ({ ...p, [key]: v }));
  }

  function resetOne(key: MakerPhase) {
    setPhases((prev) => ({ ...prev, [key]: 0 }));
    setPending((p) => ({ ...p, [key]: 0 }));
  }

  function markAllDone() {
    const allHundred: PhaseProgress = {
      concept: 100,
      design: 100,
      procurement: 100,
      fabrication: 100,
      assembly: 100,
      commissioning: 100,
      done: 100,
    };
    setPhases(allHundred);
    setPending(allHundred);
  }

  const overallAvg = useMemo(() => {
    let sum = 0;
    for (const k of MAKER_PHASES) sum += phases[k];
    return Math.round(sum / MAKER_PHASES.length);
  }, [phases]);

  return (
    <div className="space-y-3">
      {/* Bulk actions row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-[#94a3b8]">
          Overall progress: <span className="text-white font-medium">{overallAvg}%</span>
          {saving && <span className="ml-3 text-[#4361EE]">Saving…</span>}
          {error && <span className="ml-3 text-red-300">{error}</span>}
        </div>
        <button
          type="button"
          onClick={markAllDone}
          className="text-xs px-3 py-1 rounded-lg border border-[#2a2d3e] bg-[#0f1117] hover:border-[#4361EE]/60 text-[#cbd5e1] hover:text-white transition"
        >
          Mark all done (100)
        </button>
      </div>

      {MAKER_PHASES.map((key) => {
        const pct = phases[key];
        return (
          <div key={key} className="rounded-lg border border-[#2a2d3e] bg-[#1a1d27] p-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-sm font-medium text-white">{MAKER_PHASE_LABELS[key]}</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => bump(key, -STEP)}
                  disabled={pct <= 0}
                  className="w-7 h-7 rounded border border-[#2a2d3e] bg-[#0f1117] text-[#94a3b8] hover:text-white hover:border-[#4361EE]/60 disabled:opacity-40 disabled:cursor-not-allowed text-sm transition"
                  aria-label={`Decrease ${MAKER_PHASE_LABELS[key]}`}
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={pct}
                  onChange={(e) => setValue(key, e.target.value)}
                  onBlur={() => flush(pending)}
                  className="w-14 text-center rounded border border-[#2a2d3e] bg-[#0f1117] px-1.5 py-1 text-sm text-white focus:border-[#4361EE] focus:outline-none"
                />
                <span className="text-xs text-[#94a3b8]">%</span>
                <button
                  type="button"
                  onClick={() => bump(key, STEP)}
                  disabled={pct >= 100}
                  className="w-7 h-7 rounded border border-[#2a2d3e] bg-[#0f1117] text-[#94a3b8] hover:text-white hover:border-[#4361EE]/60 disabled:opacity-40 disabled:cursor-not-allowed text-sm transition"
                  aria-label={`Increase ${MAKER_PHASE_LABELS[key]}`}
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => resetOne(key)}
                  disabled={pct === 0}
                  className="text-[10px] uppercase tracking-wide px-2 py-1 rounded border border-[#2a2d3e] bg-[#0f1117] text-[#94a3b8] hover:text-white hover:border-[#4361EE]/60 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  aria-label={`Reset ${MAKER_PHASE_LABELS[key]} to 0`}
                  title="Reset to 0"
                >
                  Reset
                </button>
              </div>
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
 * Compact, read-only version for project list cards. Shows a single
 * progress bar with the overall average + the 7 phase labels as ticks.
 */
export function PhaseProgressMini({ phases }: { phases: PhaseProgress }) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {MAKER_PHASES.map((key) => (
        <div key={key} className="flex flex-col items-center gap-1">
          <div className="h-1 w-full rounded-full bg-[#0f1117] overflow-hidden">
            <div className="h-full bg-[#4361EE]" style={{ width: `${phases[key]}%` }} />
          </div>
          <span className="text-[9px] uppercase tracking-wide text-[#94a3b8]">
            {MAKER_PHASE_LABELS[key].slice(0, 4)}
          </span>
        </div>
      ))}
    </div>
  );
}

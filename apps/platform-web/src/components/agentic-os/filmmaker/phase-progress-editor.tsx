'use client';

/**
 * Filmmaker OS — PhaseProgressEditor.
 *
 * Renders one stepper per lifecycle phase. Each phase is editable inline
 * via +/- buttons in 5% increments; the bar PATCHes back to the
 * `projects/[id]/phase-progress` endpoint on blur (i.e. after the user
 * stops clicking for ~600 ms).
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PHASE_KEYS,
  PHASE_LABELS,
  type PhaseProgress,
  type PhaseKey,
} from '@/lib/agentic-os/filmmaker/projects';

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async (toFlush: Partial<PhaseProgress>) => {
    if (Object.keys(toFlush).length === 0) return;
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/filmmaker/projects/${projectId}/phase-progress`,
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
    }
  }, [projectId]);

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

  function bump(key: PhaseKey, delta: number) {
    setPhases((prev) => {
      const next = Math.max(0, Math.min(100, prev[key] + delta));
      const updated = { ...prev, [key]: next };
      setPending((p) => ({ ...p, [key]: next }));
      return updated;
    });
  }

  function setValue(key: PhaseKey, raw: string) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const v = Math.max(0, Math.min(100, Math.round(parsed)));
    setPhases((prev) => ({ ...prev, [key]: v }));
    setPending((p) => ({ ...p, [key]: v }));
  }

  return (
    <div className="space-y-3">
      {PHASE_KEYS.map((key) => {
        const pct = phases[key];
        return (
          <div key={key} className="rounded-lg border border-border-subtle bg-surface-2 p-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-sm font-medium text-white">{PHASE_LABELS[key]}</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => bump(key, -STEP)}
                  disabled={pct <= 0}
                  className="w-7 h-7 rounded border border-border-subtle bg-surface-0 text-text-secondary hover:text-white hover:border-accent/60 disabled:opacity-40 disabled:cursor-not-allowed text-sm transition"
                  aria-label={`Decrease ${PHASE_LABELS[key]}`}
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
                  className="w-14 text-center rounded border border-border-subtle bg-surface-0 px-1.5 py-1 text-sm text-white focus:border-accent focus:outline-none"
                />
                <span className="text-xs text-text-secondary">%</span>
                <button
                  type="button"
                  onClick={() => bump(key, STEP)}
                  disabled={pct >= 100}
                  className="w-7 h-7 rounded border border-border-subtle bg-surface-0 text-text-secondary hover:text-white hover:border-accent/60 disabled:opacity-40 disabled:cursor-not-allowed text-sm transition"
                  aria-label={`Increase ${PHASE_LABELS[key]}`}
                >
                  +
                </button>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-surface-0 overflow-hidden">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

/**
 * Compact, read-only version for project list cards.
 */
export function PhaseProgressMini({ phases }: { phases: PhaseProgress }) {
  return (
    <div className="grid grid-cols-5 gap-1">
      {PHASE_KEYS.map((key) => (
        <div key={key} className="flex flex-col items-center gap-1">
          <div className="h-1 w-full rounded-full bg-surface-0 overflow-hidden">
            <div
              className="h-full bg-accent"
              style={{ width: `${phases[key]}%` }}
            />
          </div>
          <span className="text-[9px] uppercase tracking-wide text-text-secondary">
            {PHASE_LABELS[key].split('-')[0].slice(0, 4)}
          </span>
        </div>
      ))}
    </div>
  );
}

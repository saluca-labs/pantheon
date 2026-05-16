'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Timer } from 'lucide-react';
import {
  SubmitBar,
  TextInput,
  useCbtSubmit,
} from './_shared';

interface Props {
  exerciseId?: string;
}

/**
 * Worry-time wizard — schedule + duration, list worries, then run a
 * countdown. The "save" button persists the log; users typically run
 * the countdown to completion before saving, but the form does not
 * enforce that.
 */
export function WorryTimeTimer({ exerciseId }: Props) {
  const { submit, submitting, error } = useCbtSubmit();
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMin, setDurationMin] = useState(15);
  const [worries, setWorries] = useState<string[]>(['']);
  const [reflection, setReflection] = useState('');
  const durationId = useId();

  // Countdown state
  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(durationMin * 60);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset countdown when duration changes (only if not running).
  useEffect(() => {
    if (!running) setSecondsLeft(durationMin * 60);
  }, [durationMin, running]);

  // Tick effect.
  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setRunning(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  function setWorryAt(idx: number, value: string) {
    setWorries((curr) => curr.map((w, i) => (i === idx ? value : w)));
  }
  function addWorry() {
    setWorries((curr) => [...curr, '']);
  }
  function removeWorry(idx: number) {
    setWorries((curr) =>
      curr.length === 1 ? curr : curr.filter((_, i) => i !== idx),
    );
  }

  function fmtTime(s: number): string {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function onSubmit() {
    void submit({
      kind: 'worry-time',
      exerciseId: exerciseId ?? null,
      data: {
        scheduled_at: scheduledAt,
        duration_min: durationMin,
        worries: worries.map((w) => w.trim()).filter((w) => w.length > 0),
        reflection,
      },
    });
  }

  const filledWorries = worries.filter((w) => w.trim().length > 0);
  const canSubmit = scheduledAt.trim().length > 0 && filledWorries.length > 0;

  return (
    <div className="space-y-4">
      <TextInput
        label="When is your worry window?"
        value={scheduledAt}
        onChange={setScheduledAt}
        placeholder="e.g. Today 6:00 PM, tomorrow morning"
      />
      <div>
        <label htmlFor={durationId} className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
          Duration (minutes)
        </label>
        <input
          id={durationId}
          type="number"
          min={1}
          max={120}
          value={durationMin}
          onChange={(e) =>
            setDurationMin(
              Math.max(1, Math.min(120, parseInt(e.target.value || '0', 10) || 1)),
            )
          }
          className="w-32 rounded-lg border border-border-subtle bg-surface-0 text-sm text-white px-3 py-2"
        />
      </div>

      <div>
        <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
          Worries to address
        </span>
        <ul className="space-y-2">
          {worries.map((w, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <textarea
                value={w}
                onChange={(e) => setWorryAt(idx, e.target.value)}
                rows={2}
                placeholder="Name one worry"
                className="flex-1 rounded-lg border border-border-subtle bg-surface-0 text-sm text-white placeholder:text-text-secondary px-3 py-2 leading-relaxed resize-y"
              />
              {worries.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeWorry(idx)}
                  className="text-xs text-text-secondary hover:text-danger px-2"
                >
                  remove
                </button>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addWorry}
          className="mt-2 text-xs text-accent hover:text-accent/80 transition"
        >
          + Add another worry
        </button>
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface-0 p-5">
        <div className="flex items-center gap-3 mb-3">
          <Timer className="w-5 h-5 text-accent" />
          <h3 className="text-sm font-semibold text-white">Countdown</h3>
        </div>
        <div className="text-4xl font-mono text-white tracking-tight">
          {fmtTime(secondsLeft)}
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={() => setRunning((r) => !r)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-2 hover:border-accent/50 text-white text-xs px-3 py-1.5 transition"
          >
            {running ? (
              <Pause className="w-3 h-3" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            {running ? 'Pause' : secondsLeft === 0 ? 'Done' : 'Start'}
          </button>
          <button
            type="button"
            onClick={() => {
              setRunning(false);
              setSecondsLeft(durationMin * 60);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-2 hover:border-accent/50 text-white text-xs px-3 py-1.5 transition"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        </div>
      </div>

      <TextInput
        label="Reflection (optional)"
        value={reflection}
        onChange={setReflection}
        multiline
        rows={3}
        placeholder="What did the window leave you with? Anything you can park until tomorrow?"
      />

      <SubmitBar
        submitting={submitting}
        disabled={!canSubmit}
        error={error}
        onClick={onSubmit}
      />
    </div>
  );
}

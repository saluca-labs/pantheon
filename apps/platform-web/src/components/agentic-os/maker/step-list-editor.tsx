'use client';

/**
 * Maker OS — StepListEditor.
 *
 * Ordered checklist of build steps for one project. Each row shows the
 * ordinal, a completion checkbox, the title, an optional body preview, an
 * est-minutes badge, and an optional blocker pill. Each row also exposes
 * up/down arrow buttons to nudge ordinals (no drag-and-drop library — we
 * keep the bundle lean and the UX accessible by default). A compose form
 * at the top adds new steps.
 *
 * Optimistic updates: every action mutates local state first and rolls back
 * on a non-2xx response. The component refetches the full list on mount and
 * after any reorder so the local view stays in sync with server state.
 *
 * @license MIT — Tiresias Maker OS Phase 3 (internal).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Trash2, AlertTriangle, Clock } from 'lucide-react';
import {
  stepStatus,
  summarizeSteps,
  type BuildStep,
} from '@/lib/agentic-os/maker/steps';

const API_BASE = '/api/tiresias/agentic-os/maker';

interface Props {
  projectId: string;
  initialSteps: BuildStep[];
}

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

const STATUS_COLOR: Record<'pending' | 'blocked' | 'done', string> = {
  pending: 'border-[#2a2d3e] text-[#94a3b8]',
  blocked: 'border-amber-500/50 text-amber-300',
  done: 'border-emerald-500/50 text-emerald-300',
};

export function StepListEditor({ projectId, initialSteps }: Props) {
  const [steps, setSteps] = useState<BuildStep[]>(initialSteps);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newStep, setNewStep] = useState({
    title: '',
    body: '',
    estMinutes: '',
  });

  const refresh = useCallback(async () => {
    const r = await fetch(`${API_BASE}/projects/${projectId}/steps`);
    if (r.ok) {
      const { steps: latest } = await r.json();
      setSteps(latest ?? []);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const stats = useMemo(() => summarizeSteps(steps), [steps]);

  async function addStep(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newStep.title.trim()) {
      setError('Title is required.');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/projects/${projectId}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newStep.title.trim(),
          body: newStep.body.trim() || null,
          estMinutes: newStep.estMinutes ? Number.parseInt(newStep.estMinutes, 10) : null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Create failed (${r.status})`);
      }
      setNewStep({ title: '', body: '', estMinutes: '' });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setAdding(false);
    }
  }

  async function toggleComplete(step: BuildStep) {
    const undo = step.completedAt != null;
    const prev = steps;
    // Optimistic
    setSteps((s) =>
      s.map((x) =>
        x.id === step.id
          ? { ...x, completedAt: undo ? null : new Date().toISOString() }
          : x,
      ),
    );
    try {
      const r = await fetch(
        `${API_BASE}/projects/${projectId}/steps/${step.id}/complete${undo ? '?undo=true' : ''}`,
        { method: 'PATCH' },
      );
      if (!r.ok) throw new Error(`Toggle failed (${r.status})`);
    } catch (err) {
      setSteps(prev);
      setError(err instanceof Error ? err.message : 'Toggle failed');
    }
  }

  async function deleteStep(step: BuildStep) {
    const prev = steps;
    setSteps((s) => s.filter((x) => x.id !== step.id));
    try {
      const r = await fetch(`${API_BASE}/projects/${projectId}/steps/${step.id}`, {
        method: 'DELETE',
      });
      if (!r.ok) throw new Error(`Delete failed (${r.status})`);
    } catch (err) {
      setSteps(prev);
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function move(step: BuildStep, dir: -1 | 1) {
    const idx = steps.findIndex((s) => s.id === step.id);
    if (idx < 0) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= steps.length) return;
    const reordered = [...steps];
    const [removed] = reordered.splice(idx, 1);
    reordered.splice(targetIdx, 0, removed!);
    const prev = steps;
    setSteps(reordered);
    try {
      const r = await fetch(`${API_BASE}/projects/${projectId}/steps/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order: reordered.map((s, i) => ({ stepId: s.id, ordinal: i + 1 })),
        }),
      });
      if (!r.ok) throw new Error(`Reorder failed (${r.status})`);
      await refresh();
    } catch (err) {
      setSteps(prev);
      setError(err instanceof Error ? err.message : 'Reorder failed');
    }
  }

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-[#94a3b8]">
        <span>
          <span className="text-white font-medium">{stats.done}</span> / {stats.total} done
        </span>
        {stats.blocked > 0 && (
          <span className="inline-flex items-center gap-1 text-amber-300">
            <AlertTriangle className="w-3 h-3" />
            {stats.blocked} blocked
          </span>
        )}
        {stats.totalEstMinutes > 0 && (
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {stats.remainingEstMinutes} min remaining
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Step list */}
      <ul className="space-y-2">
        {steps.length === 0 && (
          <li className="rounded-lg border border-dashed border-[#2a2d3e] bg-[#1a1d27]/30 p-6 text-center text-sm text-[#94a3b8]">
            No steps yet. Add your first build step below.
          </li>
        )}
        {steps.map((step, idx) => {
          const status = stepStatus(step);
          const done = status === 'done';
          return (
            <li
              key={step.id}
              className={`flex items-start gap-3 rounded-lg border bg-[#1a1d27] px-3 py-3 ${
                done ? 'border-emerald-500/30' : 'border-[#2a2d3e]'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleComplete(step)}
                aria-label={done ? 'Mark step pending' : 'Mark step done'}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
                  done
                    ? 'border-emerald-500 bg-emerald-500/30 text-emerald-200'
                    : 'border-[#2a2d3e] hover:border-[#4361EE]'
                }`}
              >
                {done && <Check className="w-3 h-3" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-[#94a3b8]">
                    #{step.ordinal}
                  </span>
                  <span
                    className={`text-sm ${done ? 'text-[#94a3b8] line-through' : 'text-white'}`}
                  >
                    {step.title}
                  </span>
                  <span
                    className={`text-[9px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${STATUS_COLOR[status]}`}
                  >
                    {status}
                  </span>
                  {step.estMinutes != null && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-[#94a3b8]">
                      <Clock className="w-3 h-3" />
                      {step.estMinutes}m
                    </span>
                  )}
                </div>
                {step.body && (
                  <p className="mt-1 text-xs text-[#cbd5e1] whitespace-pre-wrap">
                    {step.body}
                  </p>
                )}
                {step.blockerText && (
                  <p className="mt-1 inline-flex items-start gap-1 text-xs text-amber-300">
                    <AlertTriangle className="w-3 h-3 mt-0.5" />
                    {step.blockerText}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(step, -1)}
                  disabled={idx === 0}
                  aria-label="Move up"
                  className="rounded p-1 text-[#94a3b8] hover:bg-[#0f1117] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(step, 1)}
                  disabled={idx === steps.length - 1}
                  aria-label="Move down"
                  className="rounded p-1 text-[#94a3b8] hover:bg-[#0f1117] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteStep(step)}
                  aria-label="Delete step"
                  className="rounded p-1 text-[#94a3b8] hover:bg-red-500/10 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Add form */}
      <form
        onSubmit={addStep}
        className="space-y-2 rounded-lg border border-[#2a2d3e] bg-[#1a1d27] p-4"
      >
        <h3 className="text-sm font-semibold text-white">Add a step</h3>
        <input
          type="text"
          value={newStep.title}
          onChange={(e) => setNewStep((s) => ({ ...s, title: e.target.value }))}
          placeholder="Step title (required)"
          maxLength={200}
          className={inputCls}
        />
        <textarea
          value={newStep.body}
          onChange={(e) => setNewStep((s) => ({ ...s, body: e.target.value }))}
          placeholder="Optional details, materials, tooling…"
          rows={3}
          maxLength={8000}
          className={`${inputCls} resize-y`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={newStep.estMinutes}
            onChange={(e) => setNewStep((s) => ({ ...s, estMinutes: e.target.value }))}
            placeholder="Estimated minutes"
            className={`${inputCls} max-w-[180px]`}
          />
          <button
            type="submit"
            disabled={adding || !newStep.title.trim()}
            className="ml-auto rounded-md bg-[#4361EE] px-4 py-2 text-sm font-medium text-white hover:bg-[#3651D9] disabled:opacity-50 disabled:hover:bg-[#4361EE]"
          >
            {adding ? 'Adding…' : 'Add step'}
          </button>
        </div>
      </form>
    </div>
  );
}

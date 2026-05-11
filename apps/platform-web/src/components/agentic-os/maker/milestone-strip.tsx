'use client';

/**
 * Maker OS — MilestoneStrip.
 *
 * Horizontal Gantt-like strip showing project milestones in the order
 * computed by `sortMilestones` (due-dated first by date, undated last).
 * Each card carries a status pill (overdue / due_soon / upcoming / undated /
 * done), a completion checkbox, and label/notes. A compose form sits below
 * for adding new milestones.
 *
 * @license MIT — Tiresias Maker OS Phase 3 (internal).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Trash2, AlertTriangle, Calendar, Flag } from 'lucide-react';
import {
  MILESTONE_STATUS_LABELS,
  milestoneStatus,
  sortMilestones,
  summarizeMilestones,
  type BuildMilestone,
  type MilestoneStatus,
} from '@/lib/agentic-os/maker/milestones';

const API_BASE = '/api/tiresias/agentic-os/maker';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

const STATUS_STYLE: Record<MilestoneStatus, string> = {
  done: 'border-emerald-500/50 text-emerald-300 bg-emerald-500/5',
  overdue: 'border-red-500/50 text-red-300 bg-red-500/5',
  due_soon: 'border-amber-500/50 text-amber-300 bg-amber-500/5',
  upcoming: 'border-[#4361EE]/50 text-[#cbd5e1] bg-[#4361EE]/5',
  undated: 'border-[#2a2d3e] text-[#94a3b8] bg-[#0f1117]',
};

interface Props {
  projectId: string;
  initialMilestones: BuildMilestone[];
}

export function MilestoneStrip({ projectId, initialMilestones }: Props) {
  const [milestones, setMilestones] = useState<BuildMilestone[]>(initialMilestones);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ label: '', dueAt: '', notes: '' });

  const refresh = useCallback(async () => {
    const r = await fetch(`${API_BASE}/projects/${projectId}/milestones`);
    if (r.ok) {
      const { milestones: latest } = await r.json();
      setMilestones(latest ?? []);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sorted = useMemo(() => sortMilestones(milestones), [milestones]);
  const stats = useMemo(() => summarizeMilestones(milestones), [milestones]);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!draft.label.trim()) {
      setError('Label is required.');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/projects/${projectId}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: draft.label.trim(),
          dueAt: draft.dueAt || null,
          notes: draft.notes.trim() || null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Create failed (${r.status})`);
      }
      setDraft({ label: '', dueAt: '', notes: '' });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setAdding(false);
    }
  }

  async function toggleComplete(m: BuildMilestone) {
    const undo = m.completedAt != null;
    const prev = milestones;
    setMilestones((arr) =>
      arr.map((x) =>
        x.id === m.id
          ? { ...x, completedAt: undo ? null : new Date().toISOString() }
          : x,
      ),
    );
    try {
      const r = await fetch(
        `${API_BASE}/projects/${projectId}/milestones/${m.id}/complete`,
        { method: 'PATCH' },
      );
      if (!r.ok) throw new Error(`Toggle failed (${r.status})`);
      await refresh();
    } catch (err) {
      setMilestones(prev);
      setError(err instanceof Error ? err.message : 'Toggle failed');
    }
  }

  async function remove(m: BuildMilestone) {
    const prev = milestones;
    setMilestones((arr) => arr.filter((x) => x.id !== m.id));
    try {
      const r = await fetch(`${API_BASE}/projects/${projectId}/milestones/${m.id}`, {
        method: 'DELETE',
      });
      if (!r.ok) throw new Error(`Delete failed (${r.status})`);
    } catch (err) {
      setMilestones(prev);
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-[#94a3b8]">
        <span>
          <span className="text-white font-medium">{stats.done}</span> / {stats.total} done
        </span>
        {stats.overdue > 0 && (
          <span className="inline-flex items-center gap-1 text-red-300">
            <AlertTriangle className="w-3 h-3" />
            {stats.overdue} overdue
          </span>
        )}
        {stats.dueSoon > 0 && (
          <span className="inline-flex items-center gap-1 text-amber-300">
            <Calendar className="w-3 h-3" />
            {stats.dueSoon} due soon
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Strip — horizontal scroller */}
      {sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#2a2d3e] bg-[#1a1d27]/30 p-6 text-center text-sm text-[#94a3b8]">
          No milestones yet. Add your first project beat below.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <ul className="flex gap-3 pb-2">
            {sorted.map((m) => {
              const status = milestoneStatus(m);
              const done = status === 'done';
              return (
                <li
                  key={m.id}
                  className={`min-w-[200px] max-w-[260px] flex-shrink-0 rounded-lg border bg-[#1a1d27] p-3 ${STATUS_STYLE[status]}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide">
                      <Flag className="w-3 h-3" />
                      {MILESTONE_STATUS_LABELS[status]}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleComplete(m)}
                        aria-label={done ? 'Mark milestone pending' : 'Mark milestone done'}
                        className={`flex h-5 w-5 items-center justify-center rounded border transition ${
                          done
                            ? 'border-emerald-500 bg-emerald-500/30 text-emerald-200'
                            : 'border-[#2a2d3e] hover:border-[#4361EE]'
                        }`}
                      >
                        {done && <Check className="w-3 h-3" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(m)}
                        aria-label="Delete milestone"
                        className="rounded p-1 text-[#94a3b8] hover:bg-red-500/10 hover:text-red-300"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className={`mt-2 text-sm font-medium ${done ? 'line-through' : ''}`}>
                    {m.label}
                  </p>
                  {m.dueAt && (
                    <p className="mt-1 text-xs text-[#94a3b8]">Due {m.dueAt}</p>
                  )}
                  {m.notes && (
                    <p className="mt-2 text-xs text-[#cbd5e1] whitespace-pre-wrap">
                      {m.notes}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Add form */}
      <form
        onSubmit={add}
        className="space-y-2 rounded-lg border border-[#2a2d3e] bg-[#1a1d27] p-4"
      >
        <h3 className="text-sm font-semibold text-white">Add a milestone</h3>
        <input
          type="text"
          value={draft.label}
          onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
          placeholder="Milestone label (required)"
          maxLength={200}
          className={inputCls}
        />
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={draft.dueAt}
            onChange={(e) => setDraft((d) => ({ ...d, dueAt: e.target.value }))}
            className={`${inputCls} max-w-[200px]`}
          />
        </div>
        <textarea
          value={draft.notes}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          rows={2}
          maxLength={4000}
          placeholder="Optional notes / acceptance criteria"
          className={`${inputCls} resize-y`}
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={adding || !draft.label.trim()}
            className="rounded-md bg-[#4361EE] px-4 py-2 text-sm font-medium text-white hover:bg-[#3651D9] disabled:opacity-50 disabled:hover:bg-[#4361EE]"
          >
            {adding ? 'Adding…' : 'Add milestone'}
          </button>
        </div>
      </form>
    </div>
  );
}

'use client';

/**
 * Maker OS — MilestoneStrip.
 *
 * Project milestone strip — sorted by due date ascending by default. Each
 * row shows a stored status pill, priority badge, blocker flag, derived
 * due-soon / overdue / done indicators, and an inline editor for the
 * Phase 6 deadline fields (due_at, priority, status, is_blocker,
 * blocked_reason).
 *
 * @license MIT — Tiresias Maker OS Phase 3 + Phase 6 (internal).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Trash2,
  AlertTriangle,
  Calendar,
  Flag,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
} from 'lucide-react';
import {
  MILESTONE_STATUS_LABELS,
  MILESTONE_STORED_STATUS_LABELS,
  MILESTONE_PRIORITY_LABELS,
  milestoneStatus,
  sortMilestones,
  summarizeMilestones,
  type BuildMilestone,
  type MilestoneStatus,
  type MilestonePriority,
  type MilestoneStoredStatus,
} from '@/lib/agentic-os/maker/milestones';
import { MilestoneDeadlineControls } from './milestone-deadline-controls';

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

const STORED_STATUS_BADGE: Record<MilestoneStoredStatus, string> = {
  pending: 'border-[#2a2d3e] text-[#94a3b8]',
  at_risk: 'border-yellow-500/50 text-yellow-300',
  blocked: 'border-red-500/50 text-red-300',
  on_track: 'border-emerald-500/50 text-emerald-300',
  done: 'border-emerald-600/50 text-emerald-200',
  missed: 'border-red-600/60 text-red-300',
};

const PRIORITY_BADGE: Record<MilestonePriority, string> = {
  low: 'border-[#2a2d3e] text-[#94a3b8]',
  medium: 'border-[#4361EE]/50 text-[#cbd5e1]',
  high: 'border-amber-500/50 text-amber-300',
  critical: 'border-red-500/50 text-red-300',
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  function patchLocal(next: BuildMilestone) {
    setMilestones((arr) => arr.map((m) => (m.id === next.id ? next : m)));
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

      {sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#2a2d3e] bg-[#1a1d27]/30 p-6 text-center text-sm text-[#94a3b8]">
          No milestones yet. Add your first project beat below.
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((m) => {
            const status = milestoneStatus(m);
            const done = status === 'done';
            const expanded = expandedId === m.id;
            return (
              <li
                key={m.id}
                className={`rounded-lg border bg-[#1a1d27] ${STATUS_STYLE[status]}`}
              >
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide">
                          <Flag className="w-3 h-3" />
                          {MILESTONE_STATUS_LABELS[status]}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${STORED_STATUS_BADGE[m.status]}`}
                        >
                          {MILESTONE_STORED_STATUS_LABELS[m.status]}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${PRIORITY_BADGE[m.priority]}`}
                        >
                          {MILESTONE_PRIORITY_LABELS[m.priority]}
                        </span>
                        {m.isBlocker && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-500/60 bg-red-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-red-300">
                            <ShieldAlert className="w-3 h-3" />
                            Blocker
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-sm font-medium ${done ? 'line-through' : ''}`}
                      >
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
                      {m.blockedReason && (
                        <p className="mt-2 text-xs text-red-300 whitespace-pre-wrap">
                          <ShieldAlert className="inline w-3 h-3 mr-1" />
                          {m.blockedReason}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
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
                        onClick={() => setExpandedId(expanded ? null : m.id)}
                        aria-label="Edit deadline"
                        className="rounded p-1 text-[#94a3b8] hover:text-white"
                      >
                        {expanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
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
                </div>
                {expanded && (
                  <div className="border-t border-[#2a2d3e]/60 px-3 py-3">
                    <MilestoneDeadlineControls
                      projectId={projectId}
                      milestone={m}
                      onChange={patchLocal}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
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

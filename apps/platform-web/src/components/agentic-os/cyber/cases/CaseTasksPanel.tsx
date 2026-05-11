'use client';

/**
 * CyberSec OS — Case tasks panel (checklist with up/down reorder).
 *
 * No drag-and-drop dep; up/down arrow buttons reorder via the bulk reorder
 * endpoint. Toggle status to 'done' via checkbox.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  ChevronUp,
  ChevronDown,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { Task } from '@/lib/agentic-os/cyber/cases';
import { TASK_STATUSES } from '@/lib/agentic-os/cyber/cases';
import { TaskForm } from './TaskForm';

const PRIORITY_STYLE: Record<string, string> = {
  urgent: 'text-red-300 bg-red-500/10',
  high:   'text-orange-300 bg-orange-500/10',
  medium: 'text-amber-300 bg-amber-500/10',
  low:    'text-slate-300 bg-slate-500/10',
};

export interface CaseTasksPanelProps {
  caseId: string;
  tasks: Task[];
}

export function CaseTasksPanel({ caseId, tasks }: CaseTasksPanelProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function patchTask(id: string, patch: Partial<Task>) {
    setBusy(id);
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/cyber/cases/${caseId}/tasks/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this task?')) return;
    setBusy(id);
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/cyber/cases/${caseId}/tasks/${id}`,
        { method: 'DELETE' },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(null);
    }
  }

  async function reorder(newOrder: string[]) {
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/cyber/cases/${caseId}/tasks`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reorder', orderedIds: newOrder }),
        },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reorder failed');
    }
  }

  function moveUp(index: number) {
    if (index <= 0) return;
    const next = tasks.map((t) => t.id);
    [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
    void reorder(next);
  }

  function moveDown(index: number) {
    if (index >= tasks.length - 1) return;
    const next = tasks.map((t) => t.id);
    [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
    void reorder(next);
  }

  function toggleDone(t: Task) {
    void patchTask(t.id, {
      status: t.status === 'done' ? 'open' : 'done',
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#94a3b8]">
          {tasks.length} task{tasks.length === 1 ? '' : 's'}
          {tasks.length > 0 && (
            <>
              {' '}·{' '}
              {tasks.filter((t) => t.status === 'done').length} done
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setCreating((c) => !c)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] text-white px-3 py-1.5 text-sm transition"
        >
          <Plus className="w-4 h-4" />
          {creating ? 'Close' : 'Add task'}
        </button>
      </div>

      {creating && (
        <TaskForm
          caseId={caseId}
          onSaved={() => setCreating(false)}
          onCancel={() => setCreating(false)}
        />
      )}

      {tasks.length === 0 ? (
        <p className="text-sm text-[#94a3b8] p-6 rounded-xl border border-dashed border-[#2a2d3e]">
          No tasks yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {tasks.map((t, i) => {
            const isEditing = editing === t.id;
            const done = t.status === 'done';
            const cancelled = t.status === 'cancelled';
            return (
              <li
                key={t.id}
                className={`rounded-lg border border-[#2a2d3e] bg-[#1a1d27] p-3 ${
                  cancelled ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => toggleDone(t)}
                    disabled={busy === t.id}
                    className="mt-0.5 h-4 w-4 accent-[#4361EE]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-sm ${
                          done ? 'line-through text-[#94a3b8]' : 'text-white'
                        }`}
                      >
                        {t.title}
                      </span>
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                          PRIORITY_STYLE[t.priority] ?? ''
                        }`}
                      >
                        {t.priority}
                      </span>
                      {t.status !== 'open' && t.status !== 'done' && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#0f1117] border border-[#2a2d3e] text-[#94a3b8]">
                          {TASK_STATUSES.find((s) => s.value === t.status)?.label ?? t.status}
                        </span>
                      )}
                    </div>
                    {t.description && (
                      <p className="text-xs text-[#cbd5e1] mt-1 whitespace-pre-wrap">
                        {t.description}
                      </p>
                    )}
                    <div className="text-[11px] text-[#94a3b8] mt-1 flex flex-wrap gap-x-3">
                      {t.assignedTo && <span>{t.assignedTo}</span>}
                      {t.dueAt && (
                        <span>Due {new Date(t.dueAt).toLocaleString()}</span>
                      )}
                      {t.completedAt && (
                        <span>
                          Completed {new Date(t.completedAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveUp(i)}
                      disabled={i === 0}
                      className="rounded border border-[#2a2d3e] text-[#94a3b8] hover:text-white disabled:opacity-30 p-1 transition"
                      aria-label="Move up"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveDown(i)}
                      disabled={i === tasks.length - 1}
                      className="rounded border border-[#2a2d3e] text-[#94a3b8] hover:text-white disabled:opacity-30 p-1 transition"
                      aria-label="Move down"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditing(isEditing ? null : t.id)}
                      className="rounded border border-[#2a2d3e] text-[#94a3b8] hover:text-white p-1 transition"
                      aria-label="Edit task"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(t.id)}
                      disabled={busy === t.id}
                      className="rounded border border-[#2a2d3e] text-[#94a3b8] hover:text-red-300 hover:border-red-500/50 disabled:opacity-60 p-1 transition"
                      aria-label="Delete task"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {isEditing && (
                  <div className="mt-3">
                    <TaskForm
                      caseId={caseId}
                      task={t}
                      onSaved={() => setEditing(null)}
                      onCancel={() => setEditing(null)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}

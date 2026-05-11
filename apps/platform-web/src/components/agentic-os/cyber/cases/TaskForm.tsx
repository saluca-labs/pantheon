'use client';

/**
 * CyberSec OS — Task form (add + edit).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Task, TaskStatus, TaskPriority } from '@/lib/agentic-os/cyber/cases';
import { TASK_STATUSES, TASK_PRIORITIES } from '@/lib/agentic-os/cyber/cases';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

export interface TaskFormProps {
  caseId: string;
  task?: Task | null;
  onSaved?: () => void;
  onCancel?: () => void;
}

export function TaskForm({ caseId, task, onSaved, onCancel }: TaskFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'open');
  const [assignedTo, setAssignedTo] = useState(task?.assignedTo ?? '');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium');
  const [dueAt, setDueAt] = useState(
    task?.dueAt ? task.dueAt.slice(0, 16) : '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!task;

  async function save() {
    setSaving(true);
    setError(null);
    const body = {
      title,
      description: description || null,
      status,
      assignedTo: assignedTo || null,
      priority,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
    };
    try {
      const base = `/api/tiresias/agentic-os/cyber/cases/${caseId}/tasks`;
      const target = isEdit ? `${base}/${task!.id}` : base;
      const r = await fetch(target, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      onSaved?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-3 rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Isolate prod-web-01"
            className={inputCls}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Optional details"
            className={inputCls + ' resize-y leading-relaxed'}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
            className={inputCls}
          >
            {TASK_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Priority</span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            className={inputCls}
          >
            {TASK_PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Assigned to</span>
          <input
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            placeholder="alice@example.com"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Due</span>
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className={inputCls}
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 text-white font-medium px-3 py-1.5 text-sm transition"
        >
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add task'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[#2a2d3e] text-[#94a3b8] hover:text-white px-3 py-1.5 text-sm transition"
          >
            Cancel
          </button>
        )}
        {error && <span className="text-sm text-red-300">{error}</span>}
      </div>
    </form>
  );
}

'use client';

/**
 * Research OS Phase 6 — milestone create/edit form.
 *
 * Client component. POSTs to /milestones (create) or PATCHes
 * /milestones/[mid] (edit). On success, calls `onSaved` so the parent
 * list refreshes.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import { useId, useState } from 'react';
import {
  MILESTONE_STATUS_VALUES,
  MILESTONE_PRIORITY_VALUES,
  MILESTONE_STATUS_LABELS,
  MILESTONE_PRIORITY_LABELS,
  type ExperimentMilestone,
  type MilestoneStatus,
  type MilestonePriority,
} from '@/lib/agentic-os/research/milestones';

interface Props {
  experimentId: string;
  initial?: ExperimentMilestone;
  onSaved?: (milestone: ExperimentMilestone) => void;
  onCancel?: () => void;
}

export function MilestoneForm({ experimentId, initial, onSaved, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [dueAt, setDueAt] = useState(initial?.dueAt ?? '');
  const [status, setStatus] = useState<MilestoneStatus>(initial?.status ?? 'pending');
  const [priority, setPriority] = useState<MilestonePriority>(
    initial?.priority ?? 'medium',
  );
  const [isBlocker, setIsBlocker] = useState(initial?.isBlocker ?? false);
  const [blockedReason, setBlockedReason] = useState(initial?.blockedReason ?? '');
  const [notesMd, setNotesMd] = useState(initial?.notesMd ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idBase = useId();
  const fid = (slug: string) => `${idBase}-${slug}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body: {
        title: string;
        dueAt: string | null;
        status: MilestoneStatus;
        priority: MilestonePriority;
        isBlocker: boolean;
        blockedReason: string | null;
        notesMd: string | null;
      } = {
        title: title.trim(),
        dueAt: dueAt ? dueAt : null,
        status,
        priority,
        isBlocker,
        blockedReason: blockedReason || null,
        notesMd: notesMd || null,
      };
      const url = initial
        ? `/api/tiresias/agentic-os/research/milestones/${initial.id}`
        : `/api/tiresias/agentic-os/research/experiments/${experimentId}/milestones`;
      const method = initial ? 'PATCH' : 'POST';
      const r = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const errBody = (await r.json().catch(() => ({}))) as { error?: string };
        setError(errBody.error ?? `Failed (${r.status})`);
        return;
      }
      const { milestone } = (await r.json()) as { milestone: ExperimentMilestone };
      onSaved?.(milestone);
    } catch (err: unknown) {
      const errErr = err instanceof Error ? err : new Error(String(err));
      setError(errErr?.message ?? 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-border-subtle bg-surface-2 p-4"
      data-testid="milestone-form"
    >
      <div className="space-y-1">
        <label htmlFor={fid('title')} className="text-xs uppercase tracking-wide text-text-secondary">Title</label>
        <input
          id={fid('title')}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
          className="w-full bg-surface-0 border border-border-subtle rounded px-2 py-1.5 text-sm text-white"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label htmlFor={fid('due-date')} className="text-xs uppercase tracking-wide text-text-secondary">
            Due date
          </label>
          <input
            id={fid('due-date')}
            type="date"
            value={dueAt ?? ''}
            onChange={(e) => setDueAt(e.target.value)}
            className="w-full bg-surface-0 border border-border-subtle rounded px-2 py-1.5 text-sm text-white"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={fid('status')} className="text-xs uppercase tracking-wide text-text-secondary">Status</label>
          <select
            id={fid('status')}
            value={status}
            onChange={(e) => setStatus(e.target.value as MilestoneStatus)}
            className="w-full bg-surface-0 border border-border-subtle rounded px-2 py-1.5 text-sm text-white"
          >
            {MILESTONE_STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {MILESTONE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={fid('priority')} className="text-xs uppercase tracking-wide text-text-secondary">
            Priority
          </label>
          <select
            id={fid('priority')}
            value={priority}
            onChange={(e) => setPriority(e.target.value as MilestonePriority)}
            className="w-full bg-surface-0 border border-border-subtle rounded px-2 py-1.5 text-sm text-white"
          >
            {MILESTONE_PRIORITY_VALUES.map((p) => (
              <option key={p} value={p}>
                {MILESTONE_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="inline-flex items-center gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          checked={isBlocker}
          onChange={(e) => setIsBlocker(e.target.checked)}
        />
        Flag as hard blocker
      </label>
      {(isBlocker || status === 'blocked' || status === 'at_risk' || status === 'missed') && (
        <div className="space-y-1">
          <label htmlFor={fid('blocked-reason')} className="text-xs uppercase tracking-wide text-text-secondary">
            Blocked reason
          </label>
          <textarea
            id={fid('blocked-reason')}
            value={blockedReason ?? ''}
            onChange={(e) => setBlockedReason(e.target.value)}
            rows={2}
            maxLength={4000}
            className="w-full bg-surface-0 border border-border-subtle rounded px-2 py-1.5 text-sm text-white"
          />
        </div>
      )}
      <div className="space-y-1">
        <label htmlFor={fid('notes')} className="text-xs uppercase tracking-wide text-text-secondary">
          Notes (markdown)
        </label>
        <textarea
          id={fid('notes')}
          value={notesMd ?? ''}
          onChange={(e) => setNotesMd(e.target.value)}
          rows={3}
          maxLength={20000}
          className="w-full bg-surface-0 border border-border-subtle rounded px-2 py-1.5 text-sm text-white font-mono"
        />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting || title.trim().length === 0}
          className="rounded bg-accent text-white text-sm font-medium px-3 py-1.5 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : initial ? 'Save changes' : 'Add milestone'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-border-subtle text-text-secondary hover:text-white text-sm px-3 py-1.5"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

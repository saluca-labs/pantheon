'use client';

/**
 * Research OS Phase 6 — milestone list component.
 *
 * Client component with inline add form + per-row edit/delete actions.
 * Renders the sorted milestone strip + footer with completion stats.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import { useState } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { MilestoneCard } from './milestone-card';
import { MilestoneForm } from './milestone-form';
import {
  sortMilestonesByDeadline,
  milestoneDerivedStatus,
  type ExperimentMilestone,
} from '@/lib/agentic-os/research/milestones';

interface Props {
  experimentId: string;
  initialMilestones: ExperimentMilestone[];
}

export function MilestoneList({ experimentId, initialMilestones }: Props) {
  const [milestones, setMilestones] = useState(initialMilestones);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const sorted = sortMilestonesByDeadline(milestones);
  const total = sorted.length;
  let done = 0;
  let overdue = 0;
  for (const m of sorted) {
    const d = milestoneDerivedStatus(m);
    if (d === 'done') done += 1;
    else if (d === 'overdue') overdue += 1;
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this milestone?')) return;
    const r = await fetch(`/api/tiresias/agentic-os/research/milestones/${id}`, {
      method: 'DELETE',
    });
    if (r.ok) {
      setMilestones((prev) => prev.filter((m) => m.id !== id));
    }
  }

  return (
    <div className="space-y-3" data-testid="milestone-list">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-text-secondary">
          {total} milestone{total === 1 ? '' : 's'} · {done} done · {overdue} overdue
        </p>
        {!showAdd && !editingId && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded border border-border-subtle text-sm text-white px-2 py-1 hover:bg-surface-2"
            data-testid="milestone-add-button"
          >
            <Plus className="w-4 h-4" />
            Add milestone
          </button>
        )}
      </div>

      {showAdd && (
        <MilestoneForm
          experimentId={experimentId}
          onSaved={(m) => {
            setMilestones((prev) => [...prev, m]);
            setShowAdd(false);
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {sorted.length === 0 && !showAdd ? (
        <p
          className="text-sm text-text-secondary italic py-6 text-center"
          data-testid="milestone-list-empty"
        >
          No milestones yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((m) => (
            <li key={m.id}>
              {editingId === m.id ? (
                <MilestoneForm
                  experimentId={experimentId}
                  initial={m}
                  onSaved={(updated) => {
                    setMilestones((prev) =>
                      prev.map((x) => (x.id === updated.id ? updated : x)),
                    );
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="relative group">
                  <MilestoneCard milestone={m} />
                  <div className="absolute top-2 right-2 hidden group-hover:flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingId(m.id)}
                      className="rounded border border-border-subtle bg-surface-0 p-1 text-text-secondary hover:text-white"
                      title="Edit"
                      data-testid={`milestone-edit-${m.id}`}
                    >
                      <Edit className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(m.id)}
                      className="rounded border border-red-500/40 bg-surface-0 p-1 text-red-300 hover:bg-red-500/10"
                      title="Delete"
                      data-testid={`milestone-delete-${m.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

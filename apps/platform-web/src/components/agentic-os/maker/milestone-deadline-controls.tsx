'use client';

/**
 * Maker OS — MilestoneDeadlineControls.
 *
 * Inline editor for the four Phase 6 deadline fields on a milestone row:
 *
 *   - due_at        — calendar date picker
 *   - priority      — low / medium / high / critical
 *   - status        — pending / at_risk / blocked / on_track / done / missed
 *   - is_blocker    — boolean flag (with blocked_reason input)
 *
 * Each change PATCHes immediately and refreshes the row. The component is
 * stateless about which milestone it edits — the parent passes the current
 * row and an `onChange` callback. The component does its own PATCH and
 * calls `onChange` on success so the parent can refresh its local state.
 *
 * @license MIT — Tiresias Maker OS Phase 6 (internal).
 */

import { useState } from 'react';
import { Flag, ShieldAlert } from 'lucide-react';
import {
  MILESTONE_PRIORITY_VALUES,
  MILESTONE_PRIORITY_LABELS,
  MILESTONE_STORED_STATUS_VALUES,
  MILESTONE_STORED_STATUS_LABELS,
  type BuildMilestone,
  type MilestonePriority,
  type MilestoneStoredStatus,
} from '@/lib/agentic-os/maker/milestones';

const API_BASE = '/api/tiresias/agentic-os/maker';

const inputCls =
  'rounded-md border border-[#2a2d3e] bg-[#0f1117] px-2 py-1 text-xs text-white focus:border-[#4361EE] focus:outline-none';

const PRIORITY_STYLE: Record<MilestonePriority, string> = {
  low: 'border-[#2a2d3e] text-[#94a3b8]',
  medium: 'border-[#4361EE]/50 text-[#cbd5e1]',
  high: 'border-amber-500/50 text-amber-300',
  critical: 'border-red-500/50 text-red-300',
};

const STATUS_STYLE: Record<MilestoneStoredStatus, string> = {
  pending: 'border-[#2a2d3e] text-[#94a3b8]',
  at_risk: 'border-yellow-500/50 text-yellow-300',
  blocked: 'border-red-500/50 text-red-300',
  on_track: 'border-emerald-500/50 text-emerald-300',
  done: 'border-emerald-600/50 text-emerald-200',
  missed: 'border-red-600/60 text-red-300',
};

interface Props {
  projectId: string;
  milestone: BuildMilestone;
  onChange: (next: BuildMilestone) => void;
}

export function MilestoneDeadlineControls({ projectId, milestone, onChange }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(payload: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(
        `${API_BASE}/projects/${projectId}/milestones/${milestone.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Patch failed (${r.status})`);
      }
      const { milestone: next } = await r.json();
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Patch failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-[#94a3b8]">
          Due
          <input
            type="date"
            value={milestone.dueAt ?? ''}
            disabled={saving}
            onChange={(e) => void patch({ dueAt: e.target.value || null })}
            className={`${inputCls} max-w-[160px]`}
          />
        </label>

        <label className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-[#94a3b8]">
          Priority
          <select
            value={milestone.priority}
            disabled={saving}
            onChange={(e) => void patch({ priority: e.target.value })}
            className={`${inputCls} ${PRIORITY_STYLE[milestone.priority]}`}
          >
            {MILESTONE_PRIORITY_VALUES.map((p) => (
              <option key={p} value={p}>
                {MILESTONE_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </label>

        <label className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-[#94a3b8]">
          Status
          <select
            value={milestone.status}
            disabled={saving}
            onChange={(e) => void patch({ status: e.target.value })}
            className={`${inputCls} ${STATUS_STYLE[milestone.status]}`}
          >
            {MILESTONE_STORED_STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {MILESTONE_STORED_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-[#94a3b8]">
          <input
            type="checkbox"
            checked={milestone.isBlocker}
            disabled={saving}
            onChange={(e) => void patch({ isBlocker: e.target.checked })}
            className="accent-red-400"
          />
          <ShieldAlert className="w-3 h-3" />
          Blocker
        </label>
      </div>

      {(milestone.isBlocker ||
        milestone.status === 'blocked' ||
        milestone.status === 'at_risk' ||
        milestone.status === 'missed') && (
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wide text-[#94a3b8] inline-flex items-center gap-1">
            <Flag className="w-3 h-3" />
            Blocked reason
          </label>
          <textarea
            rows={2}
            maxLength={4000}
            defaultValue={milestone.blockedReason ?? ''}
            disabled={saving}
            onBlur={(e) =>
              void patch({ blockedReason: e.target.value || null })
            }
            className={`${inputCls} w-full resize-y`}
            placeholder="What is blocking this milestone?"
          />
        </div>
      )}

      {error && (
        <p className="text-xs text-red-300">{error}</p>
      )}
    </div>
  );
}

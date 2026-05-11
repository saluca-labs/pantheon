'use client';

/**
 * CyberSec OS — Cases list + filters + create-case toggle.
 *
 * Mirrors AssetsManager (Phase 1).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { Plus } from 'lucide-react';
import type {
  CaseWithCounts,
  CaseSeverity,
  CaseStatus,
  CasePriority,
} from '@/lib/agentic-os/cyber/cases';
import {
  CASE_SEVERITIES,
  CASE_STATUSES,
  CASE_PRIORITIES,
} from '@/lib/agentic-os/cyber/cases';
import { CaseCard } from './CaseCard';
import { CaseForm } from './CaseForm';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

export function CasesManager({ initialCases }: { initialCases: CaseWithCounts[] }) {
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<CaseStatus | ''>('');
  const [severity, setSeverity] = useState<CaseSeverity | ''>('');
  const [priority, setPriority] = useState<CasePriority | ''>('');
  const [search, setSearch] = useState('');

  const filtered = initialCases.filter((c) => {
    if (status && c.status !== status) return false;
    if (severity && c.severity !== severity) return false;
    if (priority && c.priority !== priority) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !c.title.toLowerCase().includes(q) &&
        !((c.summary ?? '').toLowerCase().includes(q)) &&
        !((c.assignedTo ?? '').toLowerCase().includes(q)) &&
        !c.tags.some((t) => t.toLowerCase().includes(q))
      ) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4">
        <label className="block min-w-[180px] flex-1">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Title, summary, assignee, tag…"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as CaseStatus | '')}
            className={inputCls}
          >
            <option value="">All</option>
            {CASE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Severity</span>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as CaseSeverity | '')}
            className={inputCls}
          >
            <option value="">All</option>
            {CASE_SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Priority</span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as CasePriority | '')}
            className={inputCls}
          >
            <option value="">All</option>
            {CASE_PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setCreating((c) => !c)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] text-white font-medium px-3 py-2 text-sm transition"
        >
          <Plus className="w-4 h-4" />
          {creating ? 'Close' : 'New case'}
        </button>
      </div>

      {creating && (
        <CaseForm
          onSaved={() => setCreating(false)}
          onCancel={() => setCreating(false)}
        />
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-[#94a3b8] p-6 rounded-xl border border-dashed border-[#2a2d3e]">
          No cases match the current filters.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((c) => (
            <CaseCard key={c.id} caseItem={c} />
          ))}
        </div>
      )}
    </div>
  );
}

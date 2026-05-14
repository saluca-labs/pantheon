'use client';

/**
 * CyberSec OS — Cases list + filters + create-case toggle.
 *
 * Wave C-2a: search + saved-view presets via `CyberListControls` (composing
 * the Wave B `EntitySearch` + `SavedViews` primitives); ad-hoc empty state
 * replaced with the `EmptyState` primitive.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { Plus, FolderSearch } from 'lucide-react';
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
import { EmptyState } from '@/components/agentic-os/_shared/views';
import {
  CyberListControls,
  type CyberQuery,
} from '@/components/agentic-os/cyber/CyberListControls';
import { CaseCard } from './CaseCard';
import { CaseForm } from './CaseForm';

const selectCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

export function CasesManager({ initialCases }: { initialCases: CaseWithCounts[] }) {
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<CaseStatus | ''>('');
  const [severity, setSeverity] = useState<CaseSeverity | ''>('');
  const [priority, setPriority] = useState<CasePriority | ''>('');
  const [search, setSearch] = useState('');

  function applyQuery(q: CyberQuery) {
    setSearch(q.search ?? '');
    setStatus((q.status ?? '') as CaseStatus | '');
    setSeverity((q.severity ?? '') as CaseSeverity | '');
    setPriority((q.priority ?? '') as CasePriority | '');
  }

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

  const hasFilters =
    search.trim().length > 0 ||
    status !== '' ||
    severity !== '' ||
    priority !== '';

  return (
    <div className="space-y-4">
      <CyberListControls
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Title, summary, assignee, tag…"
        filters={{ status, severity, priority }}
        onApplyQuery={applyQuery}
        savedViewKey="cases"
        filterControls={
          <>
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
                Status
              </span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as CaseStatus | '')}
                className={selectCls}
              >
                <option value="">All</option>
                {CASE_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
                Severity
              </span>
              <select
                value={severity}
                onChange={(e) =>
                  setSeverity(e.target.value as CaseSeverity | '')
                }
                className={selectCls}
              >
                <option value="">All</option>
                {CASE_SEVERITIES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
                Priority
              </span>
              <select
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as CasePriority | '')
                }
                className={selectCls}
              >
                <option value="">All</option>
                {CASE_PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
        actions={
          <button
            type="button"
            onClick={() => setCreating((c) => !c)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent/90 text-white font-medium px-3 py-2 text-sm transition"
          >
            <Plus className="w-4 h-4" />
            {creating ? 'Close' : 'New case'}
          </button>
        }
      />

      {creating && (
        <CaseForm
          onSaved={() => setCreating(false)}
          onCancel={() => setCreating(false)}
        />
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<FolderSearch className="h-6 w-6" />}
          title={hasFilters ? 'No cases match these filters' : 'No cases yet'}
          description={
            hasFilters
              ? 'Try a broader search or clear a filter to see more cases.'
              : 'Open an investigation case to link alerts, evidence, tasks, and a full timeline.'
          }
          primaryCta={
            hasFilters
              ? undefined
              : {
                  label: 'New case',
                  icon: <Plus className="h-4 w-4" />,
                  onClick: () => setCreating(true),
                }
          }
        />
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

'use client';

/**
 * CyberSec OS — Case detail workspace.
 *
 * Header (title, status, severity, priority, assigned-to) + tabbed body:
 * Overview / Alerts / Evidence / Tasks / Timeline.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Activity,
  AlertTriangle,
  FileText,
  CheckSquare,
  Layers,
} from 'lucide-react';
import type {
  CaseDetail,
  CaseSeverity,
  CaseStatus,
  CasePriority,
} from '@/lib/agentic-os/cyber/cases';
import { CASE_STATUSES } from '@/lib/agentic-os/cyber/cases';
import { CaseForm } from './CaseForm';
import { CaseTimelinePanel } from './CaseTimelinePanel';
import { CaseAlertsPanel } from './CaseAlertsPanel';
import { CaseEvidencePanel } from './CaseEvidencePanel';
import { CaseTasksPanel } from './CaseTasksPanel';

const SEV_STYLE: Record<CaseSeverity, string> = {
  critical: 'text-red-200 bg-red-600/20 border-red-500/50',
  high:     'text-orange-300 bg-orange-500/10 border-orange-500/30',
  medium:   'text-amber-300 bg-amber-500/10 border-amber-500/30',
  low:      'text-blue-300 bg-blue-500/10 border-blue-500/30',
};

const STATUS_STYLE: Record<CaseStatus, string> = {
  open:           'text-sky-300 bg-sky-500/10 border-sky-500/30',
  triage:         'text-violet-300 bg-violet-500/10 border-violet-500/30',
  investigating:  'text-amber-300 bg-amber-500/10 border-amber-500/30',
  contained:      'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  eradicated:     'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  recovered:      'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  closed:         'text-slate-400 bg-slate-500/10 border-slate-500/30',
  false_positive: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
};

const PRI_STYLE: Record<CasePriority, string> = {
  p1: 'text-red-300 bg-red-500/10',
  p2: 'text-orange-300 bg-orange-500/10',
  p3: 'text-amber-300 bg-amber-500/10',
  p4: 'text-slate-300 bg-slate-500/10',
  p5: 'text-slate-400 bg-slate-500/10',
};

type Tab = 'overview' | 'alerts' | 'evidence' | 'tasks' | 'timeline';

export function CaseDetailWorkspace({
  caseDetail,
}: {
  caseDetail: CaseDetail;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirm(`Delete case "${caseDetail.title}"? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/cyber/cases/${caseDetail.id}`,
        { method: 'DELETE' },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      router.push('/dashboard/os/cyber/cases');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  const statusLabel =
    CASE_STATUSES.find((s) => s.value === caseDetail.status)?.label ??
    caseDetail.status;
  const openTaskCount = caseDetail.tasks.filter(
    (t) => t.status !== 'done' && t.status !== 'cancelled',
  ).length;

  return (
    <div className="max-w-5xl space-y-6">
      <Link
        href="/dashboard/os/cyber/cases"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to cases
      </Link>

      <header className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5 space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-2xl font-semibold text-white truncate">
                {caseDetail.title}
              </h1>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                  SEV_STYLE[caseDetail.severity]
                }`}
              >
                {caseDetail.severity}
              </span>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                  STATUS_STYLE[caseDetail.status]
                }`}
              >
                {statusLabel}
              </span>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${
                  PRI_STYLE[caseDetail.priority]
                }`}
              >
                {caseDetail.priority}
              </span>
            </div>
            <p className="text-sm text-[#94a3b8]">
              {caseDetail.assignedTo ? `Assigned to ${caseDetail.assignedTo}` : 'Unassigned'}
              {caseDetail.tactic && ` · ${caseDetail.tactic}`}
              {caseDetail.technique && ` · ${caseDetail.technique}`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2d3e] text-[#cbd5e1] hover:text-white hover:border-[#4361EE]/60 px-3 py-1.5 text-sm transition"
            >
              <Pencil className="w-4 h-4" />
              {editing ? 'Close' : 'Edit'}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2d3e] text-red-300 hover:text-red-200 hover:border-red-500/60 disabled:opacity-60 px-3 py-1.5 text-sm transition"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-red-300">{error}</p>}
        {editing && (
          <CaseForm
            caseItem={caseDetail}
            onSaved={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        )}
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-[#2a2d3e]">
        <TabBtn current={tab} value="overview" onClick={() => setTab('overview')}>
          <Layers className="w-4 h-4" /> Overview
        </TabBtn>
        <TabBtn current={tab} value="alerts" onClick={() => setTab('alerts')}>
          <AlertTriangle className="w-4 h-4" /> Alerts ({caseDetail.linkedAlerts.length})
        </TabBtn>
        <TabBtn current={tab} value="evidence" onClick={() => setTab('evidence')}>
          <FileText className="w-4 h-4" /> Evidence ({caseDetail.evidence.length})
        </TabBtn>
        <TabBtn current={tab} value="tasks" onClick={() => setTab('tasks')}>
          <CheckSquare className="w-4 h-4" /> Tasks ({openTaskCount})
        </TabBtn>
        <TabBtn current={tab} value="timeline" onClick={() => setTab('timeline')}>
          <Activity className="w-4 h-4" /> Timeline ({caseDetail.events.length})
        </TabBtn>
      </nav>

      <section>
        {tab === 'overview' && <OverviewPanel caseDetail={caseDetail} />}
        {tab === 'alerts' && (
          <CaseAlertsPanel
            caseId={caseDetail.id}
            linkedAlerts={caseDetail.linkedAlerts}
          />
        )}
        {tab === 'evidence' && (
          <CaseEvidencePanel caseId={caseDetail.id} evidence={caseDetail.evidence} />
        )}
        {tab === 'tasks' && (
          <CaseTasksPanel caseId={caseDetail.id} tasks={caseDetail.tasks} />
        )}
        {tab === 'timeline' && (
          <CaseTimelinePanel caseId={caseDetail.id} events={caseDetail.events} />
        )}
      </section>
    </div>
  );
}

function TabBtn({
  current,
  value,
  onClick,
  children,
}: {
  current: Tab;
  value: Tab;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 -mb-px border-b-2 text-sm transition ${
        active
          ? 'border-[#4361EE] text-white'
          : 'border-transparent text-[#94a3b8] hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function OverviewPanel({ caseDetail }: { caseDetail: CaseDetail }) {
  return (
    <div className="space-y-4">
      {caseDetail.summary && (
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
          <h2 className="text-base font-semibold text-white mb-2">Summary</h2>
          <p className="text-sm text-[#cbd5e1] whitespace-pre-wrap leading-relaxed">
            {caseDetail.summary}
          </p>
        </div>
      )}
      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
        <h2 className="text-base font-semibold text-white mb-3">Metadata</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Row label="MITRE tactic" value={caseDetail.tactic} />
          <Row label="MITRE technique" value={caseDetail.technique} />
          <Row label="Assigned to" value={caseDetail.assignedTo} />
          <Row
            label="Closed at"
            value={
              caseDetail.closedAt
                ? new Date(caseDetail.closedAt).toLocaleString()
                : null
            }
          />
          <Row label="Created" value={new Date(caseDetail.createdAt).toLocaleString()} />
          <Row label="Updated" value={new Date(caseDetail.updatedAt).toLocaleString()} />
        </dl>
        {caseDetail.tags.length > 0 && (
          <div className="mt-3">
            <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
              Tags
            </span>
            <div className="flex flex-wrap gap-1">
              {caseDetail.tags.map((t) => (
                <span
                  key={t}
                  className="text-xs px-2 py-0.5 rounded border border-[#2a2d3e] text-[#cbd5e1]"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[#94a3b8] mb-0.5">{label}</dt>
      <dd className="text-white">{value ?? '—'}</dd>
    </div>
  );
}

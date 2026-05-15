'use client';

/**
 * CyberSec OS — Case detail workspace.
 *
 * The flagship incident workspace: header (title, status, severity, priority,
 * assigned-to) + a tabbed body — Overview / Alerts / Evidence / Tasks /
 * Timeline.
 *
 * Wave C-2a replaced the bespoke `<nav>` + `TabBtn` strip with the shared
 * `CrossEntityTabs` primitive. Wave D wraps that in the `CaseWorkspaceTabs`
 * island so the active tab is URL-synced (`?tab=`) — shareable, refresh-safe,
 * and back/forward navigable. Tab content is unchanged; the server component
 * validates `?tab=` and passes it as `activeTab`.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
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
import { CaseWorkspaceTabs, normalizeCaseTab } from './CaseWorkspaceTabs';

const SEV_STYLE: Record<CaseSeverity, string> = {
  critical: 'text-danger bg-danger/20 border-danger/50',
  high:     'text-attention bg-attention/10 border-attention/30',
  medium:   'text-warning bg-warning/10 border-warning/30',
  low:      'text-accent bg-accent/10 border-accent/30',
};

const STATUS_STYLE: Record<CaseStatus, string> = {
  open:           'text-os-research bg-os-research/10 border-os-research/30',
  triage:         'text-accent bg-accent/10 border-accent/30',
  investigating:  'text-warning bg-warning/10 border-warning/30',
  contained:      'text-positive bg-positive/10 border-positive/30',
  eradicated:     'text-positive bg-positive/10 border-positive/30',
  recovered:      'text-positive bg-positive/10 border-positive/30',
  closed:         'text-text-secondary bg-text-secondary/10 border-text-secondary/30',
  false_positive: 'text-text-secondary bg-text-secondary/10 border-text-secondary/30',
};

const PRI_STYLE: Record<CasePriority, string> = {
  p1: 'text-danger bg-danger/10',
  p2: 'text-attention bg-attention/10',
  p3: 'text-warning bg-warning/10',
  p4: 'text-text-secondary bg-text-secondary/10',
  p5: 'text-text-secondary bg-text-secondary/10',
};

export function CaseDetailWorkspace({
  caseDetail,
  activeTab = 'overview',
}: {
  caseDetail: CaseDetail;
  /** The `?tab=` value the server validated — seeds the active workspace tab. */
  activeTab?: string;
}) {
  const router = useRouter();
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
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to cases
      </Link>

      <header className="rounded-xl border border-border-subtle bg-surface-2 p-5 space-y-3">
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
            <p className="text-sm text-text-secondary">
              {caseDetail.assignedTo ? `Assigned to ${caseDetail.assignedTo}` : 'Unassigned'}
              {caseDetail.tactic && ` · ${caseDetail.tactic}`}
              {caseDetail.technique && ` · ${caseDetail.technique}`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle text-text-primary hover:text-white hover:border-accent/60 px-3 py-1.5 text-sm transition"
            >
              <Pencil className="w-4 h-4" />
              {editing ? 'Close' : 'Edit'}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle text-danger hover:text-danger/80 hover:border-danger/60 disabled:opacity-60 px-3 py-1.5 text-sm transition"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        {editing && (
          <CaseForm
            caseItem={caseDetail}
            onSaved={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        )}
      </header>

      <CaseWorkspaceTabs
        activeTab={normalizeCaseTab(activeTab)}
        tabs={[
          {
            key: 'overview',
            label: 'Overview',
            content: () => <OverviewPanel caseDetail={caseDetail} />,
          },
          {
            key: 'alerts',
            label: 'Alerts',
            count: caseDetail.linkedAlerts.length,
            content: () => (
              <CaseAlertsPanel
                caseId={caseDetail.id}
                linkedAlerts={caseDetail.linkedAlerts}
              />
            ),
          },
          {
            key: 'evidence',
            label: 'Evidence',
            count: caseDetail.evidence.length,
            content: () => (
              <CaseEvidencePanel
                caseId={caseDetail.id}
                evidence={caseDetail.evidence}
              />
            ),
          },
          {
            key: 'tasks',
            label: 'Tasks',
            count: openTaskCount,
            content: () => (
              <CaseTasksPanel caseId={caseDetail.id} tasks={caseDetail.tasks} />
            ),
          },
          {
            key: 'timeline',
            label: 'Timeline',
            count: caseDetail.events.length,
            content: () => (
              <CaseTimelinePanel
                caseId={caseDetail.id}
                events={caseDetail.events}
              />
            ),
          },
        ]}
      />
    </div>
  );
}

function OverviewPanel({ caseDetail }: { caseDetail: CaseDetail }) {
  return (
    <div className="space-y-4">
      {caseDetail.summary && (
        <div className="rounded-xl border border-border-subtle bg-surface-2 p-5">
          <h2 className="text-base font-semibold text-white mb-2">Summary</h2>
          <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
            {caseDetail.summary}
          </p>
        </div>
      )}
      <div className="rounded-xl border border-border-subtle bg-surface-2 p-5">
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
            <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
              Tags
            </span>
            <div className="flex flex-wrap gap-1">
              {caseDetail.tags.map((t) => (
                <span
                  key={t}
                  className="text-xs px-2 py-0.5 rounded border border-border-subtle text-text-primary"
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
      <dt className="text-xs uppercase tracking-wide text-text-secondary mb-0.5">{label}</dt>
      <dd className="text-white">{value ?? '—'}</dd>
    </div>
  );
}

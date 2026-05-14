'use client';

/**
 * CyberSec OS — AlertTriageQueue: the OS's flagship triage workspace.
 *
 * The alert queue is Cyber's centerpiece surface — what an analyst lands on
 * to answer "what needs me, right now?". Wave D promotes it from a flat list
 * into a prioritized, scannable triage workspace:
 *
 *  - A triage rail at the top: per-status counts framed as a `DashboardWidget`
 *    grid, with the critical / open counts emphasized (danger / attention
 *    variants) so the worst is unmissable in the first 300 vertical pixels.
 *  - Severity-banded queue: alerts grouped under collapsible severity bands
 *    (Critical → Info), each band labelled with its count. A "flat" toggle
 *    keeps the old single-stream view for analysts who prefer it.
 *  - Everything from Wave C-2a is preserved: in-queue search + saved-view
 *    presets via `CyberListControls`, the expand / enrich card, all triage
 *    actions (status, assignee, notes, asset / log-source / MITRE enrichment),
 *    and the `EmptyState` primitive. No API routes or queries changed.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useMemo, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import type { Alert, AlertSeverity, AlertStatus } from '@/lib/agentic-os/cyber/triage';
import {
  sortAlerts,
  activeAlerts,
  countByStatus,
  ALERT_STATUSES,
  ALERT_SEVERITIES,
  SEVERITY_ORDER,
} from '@/lib/agentic-os/cyber/triage';
import type { Asset } from '@/lib/agentic-os/cyber/assets';
import type { LogSource } from '@/lib/agentic-os/cyber/log-sources';
import {
  DashboardWidget,
  EmptyState,
} from '@/components/agentic-os/_shared/views';
import {
  CyberListControls,
  type CyberQuery,
} from '@/components/agentic-os/cyber/CyberListControls';
import { AlertEnrichmentForm } from './AlertEnrichmentForm';

const API = '/api/tiresias/agentic-os/cyber/alerts';

const SEVERITY_STYLE: Record<AlertSeverity, { badge: string; border: string }> = {
  critical: { badge: 'text-red-200 bg-red-600/20 border-red-500/50',    border: 'border-l-red-500' },
  high:     { badge: 'text-orange-300 bg-orange-500/10 border-orange-500/30', border: 'border-l-orange-400' },
  medium:   { badge: 'text-amber-300 bg-amber-500/10 border-amber-500/30',    border: 'border-l-amber-400' },
  low:      { badge: 'text-blue-300 bg-blue-500/10 border-blue-500/30',       border: 'border-l-blue-400' },
  info:     { badge: 'text-slate-300 bg-slate-500/10 border-slate-500/30',    border: 'border-l-slate-400' },
};

/** Severity-band header accent — drives the band label dot + count pill. */
const SEVERITY_BAND: Record<AlertSeverity, string> = {
  critical: 'text-red-300',
  high:     'text-orange-300',
  medium:   'text-amber-300',
  low:      'text-blue-300',
  info:     'text-slate-400',
};

const STATUS_STYLE: Record<AlertStatus, string> = {
  open:          'text-red-300 bg-red-500/10 border-red-500/30',
  investigating: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  resolved:      'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  false_positive:'text-slate-300 bg-slate-500/10 border-slate-500/30',
};

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

function AlertCard({
  alert,
  assets,
  logSources,
  onUpdated,
}: {
  alert: Alert;
  assets: Asset[];
  logSources: LogSource[];
  onUpdated: (a: Alert) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [newStatus, setNewStatus] = useState<AlertStatus>(alert.status);
  const [assignee, setAssignee] = useState(alert.assignedTo ?? '');
  const [notes, setNotes] = useState(alert.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const sev = SEVERITY_STYLE[alert.severity];
  const asset = assets.find((a) => a.id === alert.assetId) ?? null;
  const logSource = logSources.find((s) => s.id === alert.logSourceId) ?? null;

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const r = await fetch(`${API}/${alert.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          assignedTo: assignee || null,
          notes: notes || null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      const { alert: updated } = await r.json();
      onUpdated(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const ts = new Date(alert.occurredAt).toLocaleString();

  return (
    <div className={`rounded-xl border border-border-subtle bg-surface-2 border-l-4 ${sev.border}`}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-start justify-between gap-3 p-4 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${sev.badge}`}>
              {alert.severity}
            </span>
            <span className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_STYLE[alert.status]}`}>
              {alert.status.replace('_', ' ')}
            </span>
            <span className="text-[10px] text-text-secondary">{alert.category.replace('_', ' ')}</span>
            {asset && (
              <span className="text-[10px] text-text-secondary">· asset: <span className="text-white">{asset.name}</span></span>
            )}
            {(alert.tactic || alert.technique) && (
              <span className="text-[10px] text-text-secondary">
                · {[alert.tactic, alert.technique].filter(Boolean).join(' / ')}
              </span>
            )}
          </div>
          <p className="text-sm text-white font-medium">{alert.title}</p>
          <p className="text-xs text-text-secondary mt-0.5">{alert.source} · {ts}</p>
          {alert.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {alert.tags.map((t) => (
                <span
                  key={t}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-border-subtle text-text-secondary"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className="text-text-secondary text-xs pt-1">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border-subtle pt-3">
          <p className="text-sm text-text-secondary leading-relaxed">{alert.description}</p>

          {alert.sourceIp && (
            <p className="text-xs text-text-secondary">Source IP: <span className="font-mono text-white">{alert.sourceIp}</span></p>
          )}
          {logSource && (
            <p className="text-xs text-text-secondary">
              Log source: <span className="text-white">{logSource.name}</span>{' '}
              <span className="text-text-secondary">({logSource.kind})</span>
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Status</span>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as AlertStatus)}
                className={inputCls}
              >
                {ALERT_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Assign to</span>
              <input
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="analyst@example.com"
                className={inputCls}
              />
            </label>
            <label className="block sm:col-span-1">
              <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Notes</span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Investigation notes…"
                className={inputCls}
              />
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-accent hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-3 py-1.5 text-sm transition"
            >
              {saving ? 'Saving…' : 'Update'}
            </button>
            {saveError && <span className="text-sm text-red-300">{saveError}</span>}
          </div>

          <AlertEnrichmentForm
            alert={alert}
            assets={assets}
            logSources={logSources}
            onSaved={onUpdated}
          />
        </div>
      )}
    </div>
  );
}

/** One collapsible severity band in the grouped triage view. */
function SeverityBand({
  severity,
  alerts,
  assets,
  logSources,
  onUpdated,
}: {
  severity: AlertSeverity;
  alerts: Alert[];
  assets: Asset[];
  logSources: LogSource[];
  onUpdated: (a: Alert) => void;
}) {
  // Critical + high bands open by default — that's where triage starts.
  const [open, setOpen] = useState(severity === 'critical' || severity === 'high');
  const label =
    ALERT_SEVERITIES.find((s) => s.value === severity)?.label ?? severity;

  if (alerts.length === 0) return null;

  return (
    <section data-testid={`alert-band-${severity}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-1 py-1.5 text-left"
        aria-expanded={open}
      >
        <span className={`text-xs ${SEVERITY_BAND[severity]}`}>
          {open ? '▾' : '▸'}
        </span>
        <span className={`text-sm font-semibold uppercase tracking-wide ${SEVERITY_BAND[severity]}`}>
          {label}
        </span>
        <span
          data-testid={`alert-band-count-${severity}`}
          className="text-[11px] tabular-nums rounded-full bg-surface-3 text-text-secondary px-2 py-0.5"
        >
          {alerts.length}
        </span>
      </button>
      {open && (
        <div className="space-y-3 mt-1.5">
          {alerts.map((a) => (
            <AlertCard
              key={a.id}
              alert={a}
              assets={assets}
              logSources={logSources}
              onUpdated={onUpdated}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function AlertTriageQueue({
  initialAlerts,
  assets = [],
  logSources = [],
}: {
  initialAlerts: Alert[];
  assets?: Asset[];
  logSources?: LogSource[];
}) {
  const [alerts, setAlerts] = useState<Alert[]>(initialAlerts);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  // Grouped (severity-banded) is the flagship default; flat keeps the old view.
  const [grouped, setGrouped] = useState(true);

  function onUpdated(updated: Alert) {
    setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }

  function applyQuery(q: CyberQuery) {
    setSearch(q.search ?? '');
    setShowAll(q.showAll === 'true');
  }

  const sorted = sortAlerts(alerts);
  const active = activeAlerts(sorted);
  const counts = countByStatus(alerts);
  const scoped = showAll ? sorted : active;
  const displayed = search.trim()
    ? scoped.filter((a) => {
        const q = search.trim().toLowerCase();
        return (
          a.title.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.source.toLowerCase().includes(q) ||
          (a.assignedTo?.toLowerCase().includes(q) ?? false) ||
          a.tags.some((t) => t.toLowerCase().includes(q))
        );
      })
    : scoped;

  const hasFilters = search.trim().length > 0 || showAll;

  // Bucket the displayed alerts by severity for the banded view. `displayed`
  // is already severity-sorted, so each bucket preserves intra-severity order.
  const bySeverity = useMemo(() => {
    const buckets: Record<AlertSeverity, Alert[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
      info: [],
    };
    for (const a of displayed) buckets[a.severity].push(a);
    return buckets;
  }, [displayed]);

  const severityOrder = (Object.keys(SEVERITY_ORDER) as AlertSeverity[]).sort(
    (a, b) => SEVERITY_ORDER[a] - SEVERITY_ORDER[b],
  );

  return (
    <div className="space-y-6">
      {/* Triage rail — what needs me, right now. */}
      <div
        data-testid="alert-triage-rail"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <DashboardWidget
          title="Open"
          osSlug="cyber"
          variant={counts.open > 0 ? 'danger' : 'default'}
          data-testid="alert-rail-open"
        >
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {counts.open}
          </p>
        </DashboardWidget>
        <DashboardWidget
          title="Investigating"
          osSlug="cyber"
          variant={counts.investigating > 0 ? 'warning' : 'default'}
          data-testid="alert-rail-investigating"
        >
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {counts.investigating}
          </p>
        </DashboardWidget>
        <DashboardWidget
          title="Resolved"
          osSlug="cyber"
          data-testid="alert-rail-resolved"
        >
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {counts.resolved}
          </p>
        </DashboardWidget>
        <DashboardWidget
          title="False positive"
          osSlug="cyber"
          data-testid="alert-rail-false-positive"
        >
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {counts.false_positive}
          </p>
        </DashboardWidget>
      </div>

      <CyberListControls
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Title, description, source, assignee, tag…"
        filters={{ showAll: showAll ? 'true' : '' }}
        onApplyQuery={applyQuery}
        savedViewKey="alerts"
        filterControls={
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="accent-accent"
              />
              Show resolved / closed
            </label>
            <label className="flex items-center gap-2 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={grouped}
                onChange={(e) => setGrouped(e.target.checked)}
                className="accent-accent"
              />
              Group by severity
            </label>
          </div>
        }
      />

      {/* Alert queue — severity-banded (default) or flat. */}
      {displayed.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6" />}
          title={
            hasFilters
              ? 'No alerts match the queue filters'
              : 'No active alerts — all clear'
          }
          description={
            hasFilters
              ? 'Try a broader search, or toggle "Show resolved / closed" to widen the queue.'
              : 'New alerts from your log sources will show up here, sorted by severity.'
          }
        />
      ) : grouped ? (
        <div className="space-y-5" data-testid="alert-queue-grouped">
          {severityOrder.map((sev) => (
            <SeverityBand
              key={sev}
              severity={sev}
              alerts={bySeverity[sev]}
              assets={assets}
              logSources={logSources}
              onUpdated={onUpdated}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3" data-testid="alert-queue-flat">
          {displayed.map((a) => (
            <AlertCard
              key={a.id}
              alert={a}
              assets={assets}
              logSources={logSources}
              onUpdated={onUpdated}
            />
          ))}
        </div>
      )}
    </div>
  );
}

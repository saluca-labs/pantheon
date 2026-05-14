'use client';

/**
 * CyberSec OS — AlertTriageQueue client component.
 *
 * Displays the alert queue with severity sorting. Allows analysts to
 * assign alerts, close/resolve them, and (Phase 1) enrich each alert
 * with asset + log source + MITRE tactic/technique + tags.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import type { Alert, AlertSeverity, AlertStatus } from '@/lib/agentic-os/cyber/triage';
import { sortAlerts, activeAlerts, countByStatus, ALERT_STATUSES } from '@/lib/agentic-os/cyber/triage';
import type { Asset } from '@/lib/agentic-os/cyber/assets';
import type { LogSource } from '@/lib/agentic-os/cyber/log-sources';
import { AlertEnrichmentForm } from './AlertEnrichmentForm';

const API = '/api/tiresias/agentic-os/cyber/alerts';

const SEVERITY_STYLE: Record<AlertSeverity, { badge: string; border: string }> = {
  critical: { badge: 'text-red-200 bg-red-600/20 border-red-500/50',    border: 'border-l-red-500' },
  high:     { badge: 'text-orange-300 bg-orange-500/10 border-orange-500/30', border: 'border-l-orange-400' },
  medium:   { badge: 'text-amber-300 bg-amber-500/10 border-amber-500/30',    border: 'border-l-amber-400' },
  low:      { badge: 'text-blue-300 bg-blue-500/10 border-blue-500/30',       border: 'border-l-blue-400' },
  info:     { badge: 'text-slate-300 bg-slate-500/10 border-slate-500/30',    border: 'border-l-slate-400' },
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

  function onUpdated(updated: Alert) {
    setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }

  const sorted = sortAlerts(alerts);
  const active = activeAlerts(sorted);
  const counts = countByStatus(alerts);
  const displayed = showAll ? sorted : active;

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="flex flex-wrap gap-4 rounded-xl border border-border-subtle bg-surface-2 p-4">
        <div className="flex gap-4 text-sm">
          <span className="text-red-300">{counts.open} Open</span>
          <span className="text-amber-300">{counts.investigating} Investigating</span>
          <span className="text-emerald-300">{counts.resolved} Resolved</span>
          <span className="text-text-secondary">{counts.false_positive} False Positive</span>
        </div>
        <button
          onClick={() => setShowAll((s) => !s)}
          className="ml-auto text-xs px-3 py-1 rounded border border-border-subtle bg-surface-0 text-text-secondary hover:text-white transition"
        >
          {showAll ? 'Show active only' : 'Show all'}
        </button>
      </div>

      {/* Alert list */}
      {displayed.length === 0 ? (
        <p className="text-sm text-text-secondary">{showAll ? 'No alerts.' : 'No active alerts. All clear!'}</p>
      ) : (
        <div className="space-y-3">
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

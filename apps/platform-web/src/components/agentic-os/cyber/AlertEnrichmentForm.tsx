'use client';

/**
 * CyberSec OS — Alert enrichment form.
 *
 * Inline form embedded inside the alert detail expansion. Links an alert
 * to an asset + log source, sets MITRE tactic/technique, and edits the
 * alert's tag set.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import type { Alert } from '@/lib/agentic-os/cyber/triage';
import type { Asset } from '@/lib/agentic-os/cyber/assets';
import type { LogSource } from '@/lib/agentic-os/cyber/log-sources';
import { Combobox, type ComboboxOption } from '@/components/agentic-os/_shared/combobox';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

const API = '/api/tiresias/agentic-os/cyber/alerts';

export interface AlertEnrichmentFormProps {
  alert: Alert;
  assets: Asset[];
  logSources: LogSource[];
  onSaved?: (alert: Alert) => void;
}

export function AlertEnrichmentForm({
  alert,
  assets,
  logSources,
  onSaved,
}: AlertEnrichmentFormProps) {
  const initialAsset = assets.find((a) => a.id === alert.assetId) ?? null;
  const initialSource = logSources.find((s) => s.id === alert.logSourceId) ?? null;

  const [assetId, setAssetId] = useState<string | null>(alert.assetId);
  const [assetQuery, setAssetQuery] = useState(initialAsset?.name ?? '');
  const [logSourceId, setLogSourceId] = useState<string | null>(alert.logSourceId);
  const [logSourceQuery, setLogSourceQuery] = useState(initialSource?.name ?? '');
  const [tactic, setTactic] = useState(alert.tactic ?? '');
  const [technique, setTechnique] = useState(alert.technique ?? '');
  const [tagsText, setTagsText] = useState(alert.tags.join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assetOptions: ComboboxOption<Asset>[] = assets
    .filter(
      (a) =>
        assetQuery.trim() === '' ||
        a.name.toLowerCase().includes(assetQuery.toLowerCase()) ||
        (a.hostname?.toLowerCase().includes(assetQuery.toLowerCase()) ?? false),
    )
    .slice(0, 20)
    .map((a) => ({
      id: a.id,
      label: a.name,
      sublabel: a.hostname ?? a.kind,
      data: a,
    }));

  const sourceOptions: ComboboxOption<LogSource>[] = logSources
    .filter(
      (s) =>
        logSourceQuery.trim() === '' ||
        s.name.toLowerCase().includes(logSourceQuery.toLowerCase()) ||
        (s.vendor?.toLowerCase().includes(logSourceQuery.toLowerCase()) ?? false),
    )
    .slice(0, 20)
    .map((s) => ({
      id: s.id,
      label: s.name,
      sublabel: s.vendor ?? s.kind,
      data: s,
    }));

  async function save() {
    setSaving(true);
    setError(null);
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    try {
      const r = await fetch(`${API}/${alert.id}/enrich`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId,
          logSourceId,
          tactic: tactic.trim() || null,
          technique: technique.trim() || null,
          tags,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      const { alert: updated } = await r.json();
      onSaved?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border-subtle bg-surface-0 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Enrichment</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Asset</span>
          <Combobox
            value={assetQuery}
            onChange={(v) => {
              setAssetQuery(v);
              if (v.trim() === '') setAssetId(null);
            }}
            onSelect={(opt) => {
              setAssetId(opt.data.id);
              setAssetQuery(opt.label);
            }}
            options={assetOptions}
            emptyLabel="No matching assets"
            placeholder="Link to asset…"
          />
        </div>
        <div>
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Log source</span>
          <Combobox
            value={logSourceQuery}
            onChange={(v) => {
              setLogSourceQuery(v);
              if (v.trim() === '') setLogSourceId(null);
            }}
            onSelect={(opt) => {
              setLogSourceId(opt.data.id);
              setLogSourceQuery(opt.label);
            }}
            options={sourceOptions}
            emptyLabel="No matching sources"
            placeholder="Link to log source…"
          />
        </div>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">MITRE tactic</span>
          <input
            value={tactic}
            onChange={(e) => setTactic(e.target.value)}
            placeholder="TA0001"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">MITRE technique</span>
          <input
            value={technique}
            onChange={(e) => setTechnique(e.target.value)}
            placeholder="T1190"
            className={inputCls}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Tags (comma-separated)</span>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="critical-incident, pci, escalated"
            className={inputCls}
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-3 py-1.5 text-sm transition"
        >
          {saving ? 'Saving…' : 'Save enrichment'}
        </button>
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    </div>
  );
}

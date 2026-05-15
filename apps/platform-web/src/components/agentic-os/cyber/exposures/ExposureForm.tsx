'use client';

/**
 * CyberSec OS — Exposure create + edit form.
 *
 * Used from the vulnerability detail page (preselects vulnerabilityId) and
 * the exposure detail page (edit mode).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Asset } from '@/lib/agentic-os/cyber/assets';
import type { Vulnerability } from '@/lib/agentic-os/cyber/vulnerabilities';
import type {
  Exposure,
  ExposurePriority,
  ExposureStatus,
  ExposureWithRefs,
} from '@/lib/agentic-os/cyber/exposures';
import {
  EXPOSURE_PRIORITIES,
  EXPOSURE_STATUSES,
} from '@/lib/agentic-os/cyber/exposures';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

const API = '/api/tiresias/agentic-os/cyber/exposures';

export interface ExposureFormProps {
  exposure?: ExposureWithRefs | null;
  /** Preselected/locked vulnerability when creating from a vuln detail page. */
  vulnerability?: Pick<Vulnerability, 'id' | 'title' | 'cveId'> | null;
  /** Available assets for the asset dropdown (create mode only). */
  assets?: Pick<Asset, 'id' | 'name'>[];
  onSaved?: (e: Exposure) => void;
  onCancel?: () => void;
}

export function ExposureForm({ exposure, vulnerability, assets = [], onSaved, onCancel }: ExposureFormProps) {
  const router = useRouter();
  const isEdit = !!exposure;
  const [assetId, setAssetId] = useState<string>(exposure?.assetId ?? '');
  const [status, setStatus] = useState<ExposureStatus>(exposure?.status ?? 'open');
  const [priority, setPriority] = useState<ExposurePriority>(exposure?.priority ?? 'p3');
  const [assignedTo, setAssignedTo] = useState(exposure?.assignedTo ?? '');
  const [detectedBy, setDetectedBy] = useState(exposure?.detectedBy ?? '');
  const [notes, setNotes] = useState(exposure?.notes ?? '');
  const [evidenceUrl, setEvidenceUrl] = useState(exposure?.evidenceUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    if (!isEdit && !vulnerability) {
      setError('Vulnerability required');
      setSaving(false);
      return;
    }
    const body: Record<string, unknown> = {
      status,
      priority,
      assignedTo: assignedTo.trim() || null,
      detectedBy: detectedBy.trim() || null,
      notes: notes.trim() || null,
      evidenceUrl: evidenceUrl.trim() || null,
    };
    if (!isEdit) {
      body.vulnerabilityId = vulnerability!.id;
      body.assetId = assetId;
    }
    const url = isEdit ? `${API}/${exposure!.id}` : API;
    const res = await fetch(url, {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'Save failed');
      return;
    }
    const j = await res.json();
    if (onSaved) onSaved(j.exposure);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 p-4 space-y-3">
      {vulnerability && !isEdit && (
        <p className="text-xs text-text-secondary">
          Linking to <span className="text-white">{vulnerability.cveId ?? vulnerability.title}</span>
        </p>
      )}
      {!isEdit && (
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Asset</span>
          <select value={assetId} onChange={(e) => setAssetId(e.target.value)} className={inputCls}>
            <option value="">Select…</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as ExposureStatus)} className={inputCls}>
            {EXPOSURE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Priority</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value as ExposurePriority)} className={inputCls}>
            {EXPOSURE_PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Detected by</span>
          <input value={detectedBy} onChange={(e) => setDetectedBy(e.target.value)} placeholder="Trivy, manual, …" className={inputCls} />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Assigned to</span>
          <input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={inputCls} />
        </label>
      </div>
      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Evidence URL</span>
        <input value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} placeholder="https://…" className={inputCls} />
      </label>
      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className={inputCls} />
      </label>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-3 py-2 text-sm rounded-md border border-border-subtle text-text-secondary hover:text-white">Cancel</button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving || (!isEdit && !assetId)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent/90 text-white font-medium px-3 py-2 text-sm disabled:opacity-50 transition"
        >
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create exposure'}
        </button>
      </div>
    </div>
  );
}

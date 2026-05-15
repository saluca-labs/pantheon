'use client';

/**
 * CyberSec OS — IOC create form.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { IocKind, ThreatType } from '@/lib/agentic-os/cyber/iocs';
import {
  IOC_KINDS,
  THREAT_TYPES,
  validateIocValue,
} from '@/lib/agentic-os/cyber/iocs';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

const API = '/api/tiresias/agentic-os/cyber/iocs';

export function IocForm({ onSaved, onCancel }: { onSaved?: () => void; onCancel?: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<IocKind>('ipv4');
  const [value, setValue] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [threatType, setThreatType] = useState<ThreatType | ''>('');
  const [confidence, setConfidence] = useState(50);
  const [source, setSource] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validation = validateIocValue(kind, value);

  async function save() {
    setSaving(true);
    setError(null);
    if (!validation.ok) {
      setError(validation.error ?? 'Invalid value');
      setSaving(false);
      return;
    }
    const body: Record<string, unknown> = {
      kind,
      value: value.trim(),
      title: title.trim() || null,
      description: description.trim() || null,
      threatType: threatType || null,
      confidence,
      source: source.trim() || null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      tags: tagsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'Save failed');
      return;
    }
    if (onSaved) onSaved();
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as IocKind)} className={inputCls}>
            {IOC_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Threat type</span>
          <select value={threatType} onChange={(e) => setThreatType(e.target.value as ThreatType | '')} className={inputCls}>
            <option value="">—</option>
            {THREAT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Value</span>
        <input value={value} onChange={(e) => setValue(e.target.value)} className={`${inputCls} font-mono text-xs`} />
        {value && !validation.ok && (
          <p className="text-[11px] text-warning mt-1">{validation.error}</p>
        )}
      </label>
      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Title (optional)</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
      </label>
      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Description</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputCls} />
      </label>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Confidence {confidence}</span>
          <input type="range" min={0} max={100} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="w-full" />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Source</span>
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="abuse.ch, manual…" className={inputCls} />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Expires</span>
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputCls} />
        </label>
      </div>
      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Tags (comma-sep)</span>
        <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} className={inputCls} />
      </label>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-3 py-2 text-sm rounded-md border border-border-subtle text-text-secondary hover:text-white">Cancel</button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving || !value.trim() || !validation.ok}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent/90 text-white font-medium px-3 py-2 text-sm disabled:opacity-50 transition"
        >
          {saving ? 'Saving…' : 'Create IOC'}
        </button>
      </div>
    </div>
  );
}

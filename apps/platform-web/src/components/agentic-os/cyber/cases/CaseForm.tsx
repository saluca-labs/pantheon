'use client';

/**
 * CyberSec OS — Case editor (create + edit).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  Case,
  CaseSeverity,
  CaseStatus,
  CasePriority,
} from '@/lib/agentic-os/cyber/cases';
import {
  CASE_SEVERITIES,
  CASE_STATUSES,
  CASE_PRIORITIES,
} from '@/lib/agentic-os/cyber/cases';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

const API = '/api/tiresias/agentic-os/cyber/cases';

export interface CaseFormProps {
  caseItem?: Case | null;
  onSaved?: (c: Case) => void;
  onCancel?: () => void;
}

export function CaseForm({ caseItem, onSaved, onCancel }: CaseFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(caseItem?.title ?? '');
  const [summary, setSummary] = useState(caseItem?.summary ?? '');
  const [severity, setSeverity] = useState<CaseSeverity>(caseItem?.severity ?? 'medium');
  const [status, setStatus] = useState<CaseStatus>(caseItem?.status ?? 'open');
  const [priority, setPriority] = useState<CasePriority>(caseItem?.priority ?? 'p3');
  const [assignedTo, setAssignedTo] = useState(caseItem?.assignedTo ?? '');
  const [tactic, setTactic] = useState(caseItem?.tactic ?? '');
  const [technique, setTechnique] = useState(caseItem?.technique ?? '');
  const [tagsText, setTagsText] = useState((caseItem?.tags ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!caseItem;

  async function save() {
    setSaving(true);
    setError(null);
    const tags = tagsText.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
    const body = {
      title,
      summary: summary || null,
      severity,
      status,
      priority,
      assignedTo: assignedTo || null,
      tactic: tactic || null,
      technique: technique || null,
      tags,
    };
    try {
      const url = isEdit ? `${API}/${caseItem!.id}` : API;
      const r = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      const { case: saved } = await r.json();
      onSaved?.(saved);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-4 rounded-xl border border-border-subtle bg-surface-2 p-5"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Suspicious PowerShell on prod-web-01"
            className={inputCls}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Summary</span>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            placeholder="What happened, scope, current state…"
            className={inputCls + ' resize-y leading-relaxed'}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Severity</span>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as CaseSeverity)}
            className={inputCls}
          >
            {CASE_SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as CaseStatus)}
            className={inputCls}
          >
            {CASE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Priority</span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as CasePriority)}
            className={inputCls}
          >
            {CASE_PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Assigned to</span>
          <input
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            placeholder="alice@example.com"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">MITRE tactic</span>
          <input
            value={tactic}
            onChange={(e) => setTactic(e.target.value)}
            placeholder="TA0002 / Execution"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">MITRE technique</span>
          <input
            value={technique}
            onChange={(e) => setTechnique(e.target.value)}
            placeholder="T1059.001 / PowerShell"
            className={inputCls}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Tags (comma-separated)</span>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="ransomware, prod, customer-data"
            className={inputCls}
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="rounded-lg bg-accent hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-3 py-1.5 text-sm transition"
        >
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create case'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border-subtle text-text-secondary hover:text-white px-3 py-1.5 text-sm transition"
          >
            Cancel
          </button>
        )}
        {error && <span className="text-sm text-red-300">{error}</span>}
      </div>
    </form>
  );
}

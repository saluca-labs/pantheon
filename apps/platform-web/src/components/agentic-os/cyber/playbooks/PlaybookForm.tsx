'use client';

/**
 * CyberSec OS — Playbook metadata editor (create + edit top-level fields).
 *
 * Steps are managed separately by PlaybookStepsEditor (PUT-replace endpoint).
 * Category is a free-form text field — agos_cyber_playbooks.category is TEXT
 * with no enum constraint in migration 0007.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Playbook, PlaybookLifecycle } from '@/lib/agentic-os/cyber/playbooks';
import {
  PLAYBOOK_LIFECYCLES,
} from '@/lib/agentic-os/cyber/playbooks';
import { ATTACK_TACTICS } from '@/lib/agentic-os/cyber/detections';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

const API = '/api/tiresias/agentic-os/cyber/playbooks';

const CATEGORY_SUGGESTIONS = [
  'incident_response',
  'investigation',
  'hunting',
  'remediation',
  'compliance',
];

export interface PlaybookFormProps {
  playbook?: Playbook | null;
  onSaved?: (p: Playbook) => void;
  onCancel?: () => void;
}

export function PlaybookForm({ playbook, onSaved, onCancel }: PlaybookFormProps) {
  const router = useRouter();
  const isEdit = !!playbook;

  const [name, setName] = useState(playbook?.name ?? '');
  const [category, setCategory] = useState(playbook?.category ?? '');
  const [description, setDescription] = useState(playbook?.description ?? '');
  const [lifecycle, setLifecycle] = useState<PlaybookLifecycle>(playbook?.lifecycle ?? 'active');
  const [tactic, setTactic] = useState(playbook?.tactic ?? '');
  const [tagsText, setTagsText] = useState((playbook?.tags ?? []).join(', '));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const body = {
      name,
      category: category || null,
      description: description || null,
      lifecycle,
      tactic: tactic || null,
      tags,
    };
    try {
      const url = isEdit ? `${API}/${playbook!.id}` : API;
      const r = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      const { playbook: saved } = await r.json();
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
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Ransomware incident response"
            className={inputCls}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="When and how to use this playbook…"
            className={inputCls + ' resize-y leading-relaxed'}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Category</span>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            list="cyber-playbook-categories"
            placeholder="incident_response"
            className={inputCls}
          />
          <datalist id="cyber-playbook-categories">
            {CATEGORY_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Lifecycle</span>
          <select
            value={lifecycle}
            onChange={(e) => setLifecycle(e.target.value as PlaybookLifecycle)}
            className={inputCls}
          >
            {PLAYBOOK_LIFECYCLES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">MITRE tactic</span>
          <select
            value={tactic}
            onChange={(e) => setTactic(e.target.value)}
            className={inputCls}
          >
            <option value="">(none)</option>
            {ATTACK_TACTICS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
            Tags (comma-separated)
          </span>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="ransomware, ir, p1"
            className={inputCls}
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-3 py-1.5 text-sm transition"
        >
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create playbook'}
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
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    </form>
  );
}

'use client';

/**
 * CyberSec OS — Evidence form (add + edit).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Evidence, EvidenceKind } from '@/lib/agentic-os/cyber/cases';
import { EVIDENCE_KINDS } from '@/lib/agentic-os/cyber/cases';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

export interface EvidenceFormProps {
  caseId: string;
  evidence?: Evidence | null;
  onSaved?: () => void;
  onCancel?: () => void;
}

export function EvidenceForm({
  caseId,
  evidence,
  onSaved,
  onCancel,
}: EvidenceFormProps) {
  const router = useRouter();
  const [kind, setKind] = useState<EvidenceKind>(evidence?.kind ?? 'file');
  const [title, setTitle] = useState(evidence?.title ?? '');
  const [description, setDescription] = useState(evidence?.description ?? '');
  const [url, setUrl] = useState(evidence?.url ?? '');
  const [content, setContent] = useState(evidence?.content ?? '');
  const [collectedBy, setCollectedBy] = useState(evidence?.collectedBy ?? '');
  const [tagsText, setTagsText] = useState((evidence?.tags ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!evidence;

  async function save() {
    setSaving(true);
    setError(null);
    const tags = tagsText.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
    const body = {
      kind,
      title,
      description: description || null,
      url: url || null,
      content: content || null,
      collectedBy: collectedBy || null,
      tags,
    };
    try {
      const baseUrl = `/api/tiresias/agentic-os/cyber/cases/${caseId}/evidence`;
      const target = isEdit ? `${baseUrl}/${evidence!.id}` : baseUrl;
      const r = await fetch(target, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      onSaved?.();
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
      className="space-y-3 rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Kind</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as EvidenceKind)}
            className={inputCls}
          >
            {EVIDENCE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Collected by</span>
          <input
            value={collectedBy}
            onChange={(e) => setCollectedBy(e.target.value)}
            placeholder="alice@example.com"
            className={inputCls}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="PowerShell process tree, prod-web-01"
            className={inputCls}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What this evidence shows, where it came from…"
            className={inputCls + ' resize-y leading-relaxed'}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">URL (optional)</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://siem.example.com/event/12345"
            className={inputCls}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Content (optional)</span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            placeholder="Paste log excerpt, command output, IOC list…"
            className={inputCls + ' font-mono resize-y leading-relaxed'}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Tags (comma-separated)</span>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="ioc, sigma-rule, dns"
            className={inputCls}
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 text-white font-medium px-3 py-1.5 text-sm transition"
        >
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add evidence'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[#2a2d3e] text-[#94a3b8] hover:text-white px-3 py-1.5 text-sm transition"
          >
            Cancel
          </button>
        )}
        {error && <span className="text-sm text-red-300">{error}</span>}
      </div>
    </form>
  );
}

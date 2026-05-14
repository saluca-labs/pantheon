'use client';

/**
 * CyberSec OS — Case evidence panel.
 *
 * Evidence rows with add / edit / delete via EvidenceForm.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, FileText } from 'lucide-react';
import type { Evidence } from '@/lib/agentic-os/cyber/cases';
import { EVIDENCE_KINDS } from '@/lib/agentic-os/cyber/cases';
import { EmptyState } from '@/components/agentic-os/_shared/views';
import { EvidenceForm } from './EvidenceForm';

export interface CaseEvidencePanelProps {
  caseId: string;
  evidence: Evidence[];
}

export function CaseEvidencePanel({ caseId, evidence }: CaseEvidencePanelProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(id: string) {
    if (!confirm('Delete this evidence?')) return;
    setBusy(id);
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/cyber/cases/${caseId}/evidence/${id}`,
        { method: 'DELETE' },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-secondary">
          {evidence.length} evidence item{evidence.length === 1 ? '' : 's'}
        </p>
        <button
          type="button"
          onClick={() => setCreating((c) => !c)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-[#3a56d4] text-white px-3 py-1.5 text-sm transition"
        >
          <Plus className="w-4 h-4" />
          {creating ? 'Close' : 'Add evidence'}
        </button>
      </div>

      {creating && (
        <EvidenceForm
          caseId={caseId}
          onSaved={() => setCreating(false)}
          onCancel={() => setCreating(false)}
        />
      )}

      {evidence.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No evidence captured yet"
          description="Add artifacts, screenshots, logs, and IOCs so the investigation has a paper trail."
          primaryCta={{
            label: 'Add evidence',
            icon: <Plus className="h-4 w-4" />,
            onClick: () => setCreating(true),
          }}
        />
      ) : (
        <ul className="space-y-2">
          {evidence.map((ev) => {
            const kindLabel =
              EVIDENCE_KINDS.find((k) => k.value === ev.kind)?.label ?? ev.kind;
            const isEditing = editing === ev.id;
            return (
              <li
                key={ev.id}
                className="rounded-lg border border-border-subtle bg-surface-2 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border border-border-subtle text-text-primary">
                        {kindLabel}
                      </span>
                      <span className="text-sm text-white truncate">
                        {ev.title}
                      </span>
                    </div>
                    {ev.description && (
                      <p className="text-xs text-text-primary mt-1 whitespace-pre-wrap">
                        {ev.description}
                      </p>
                    )}
                    {ev.url && (
                      <a
                        href={ev.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent hover:underline break-all mt-1 block"
                      >
                        {ev.url}
                      </a>
                    )}
                    {ev.content && (
                      <pre className="text-[11px] text-text-primary bg-surface-0 border border-border-subtle rounded p-2 mt-2 overflow-auto max-h-48 whitespace-pre-wrap font-mono">
                        {ev.content}
                      </pre>
                    )}
                    <p className="text-[11px] text-text-secondary mt-1">
                      Collected {new Date(ev.collectedAt).toLocaleString()}
                      {ev.collectedBy && ` · ${ev.collectedBy}`}
                    </p>
                    {ev.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {ev.tags.map((t) => (
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
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditing(isEditing ? null : ev.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-border-subtle text-text-secondary hover:text-white px-2 py-1 text-xs transition"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      {isEditing ? 'Close' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(ev.id)}
                      disabled={busy === ev.id}
                      className="inline-flex items-center gap-1 rounded-md border border-border-subtle text-text-secondary hover:text-red-300 hover:border-red-500/50 disabled:opacity-60 px-2 py-1 text-xs transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
                {isEditing && (
                  <div className="mt-3">
                    <EvidenceForm
                      caseId={caseId}
                      evidence={ev}
                      onSaved={() => setEditing(null)}
                      onCancel={() => setEditing(null)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}

'use client';

/**
 * Research OS Phase 3 — Single evidence card with delete affordance.
 *
 * Deep-links the source when source_kind = notebook_entry — clicking
 * the icon row navigates to the notebook entry detail (Phase 2's
 * surface). For external_url the row links directly to the URL.
 *
 * No edit path — evidence is append-or-delete only.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import { useState } from 'react';
import {
  Trash2,
  BookOpen,
  FileText,
  Database,
  Link as LinkIcon,
  AlignLeft,
} from 'lucide-react';
import Link from 'next/link';
import {
  EVIDENCE_SOURCE_KIND_LABELS,
  type Evidence,
  type EvidenceSourceKind,
} from '@/lib/agentic-os/research/evidence';

const ICONS: Record<EvidenceSourceKind, React.ComponentType<{ className?: string }>> = {
  notebook_entry: BookOpen,
  paper:          FileText,
  dataset:        Database,
  external_url:   LinkIcon,
  free_text:      AlignLeft,
};

interface Props {
  evidence: Evidence;
  onDeleted: (id: string) => void;
}

export function EvidenceCard({ evidence, onDeleted }: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/research/evidence/${evidence.id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? `Failed (${res.status})`);
        return;
      }
      onDeleted(evidence.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  const Icon = ICONS[evidence.sourceKind] ?? AlignLeft;

  function renderSourceLine() {
    switch (evidence.sourceKind) {
      case 'notebook_entry':
        return evidence.sourceId ? (
          <Link
            href={`/dashboard/os/research/notebook/${evidence.sourceId}`}
            className="text-accent hover:underline"
          >
            Notebook entry
          </Link>
        ) : (
          <span className="text-text-secondary">Notebook entry</span>
        );
      case 'paper':
        return (
          <span className="text-text-secondary">
            Paper{' '}
            <span className="text-text-secondary/60">(Phase 4 library — placeholder linkage)</span>
          </span>
        );
      case 'dataset':
        return (
          <span className="text-text-secondary">
            Dataset{' '}
            <span className="text-text-secondary/60">(Phase 5 library — placeholder linkage)</span>
          </span>
        );
      case 'external_url':
        return evidence.sourceUrl ? (
          <a
            href={evidence.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline break-all"
          >
            {evidence.sourceUrl}
          </a>
        ) : (
          <span className="text-text-secondary">External URL</span>
        );
      case 'free_text':
        return <span className="text-text-secondary">Free-text evidence</span>;
    }
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-0/60 p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="inline-flex items-center gap-2 min-w-0">
          <Icon className="w-3.5 h-3.5 text-text-secondary shrink-0" />
          <span className="text-[10px] uppercase tracking-wide text-text-secondary">
            {EVIDENCE_SOURCE_KIND_LABELS[evidence.sourceKind]}
          </span>
          <span className="text-xs">{renderSourceLine()}</span>
        </div>
        <div className="inline-flex items-center gap-2">
          {confirmingDelete ? (
            <span className="inline-flex items-center gap-1.5 text-xs">
              <span className="text-text-secondary">Unlink?</span>
              <button
                onClick={handleDelete}
                disabled={busy}
                className="text-red-300 hover:text-red-200 disabled:opacity-50"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="text-text-secondary hover:text-white"
              >
                No
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-red-300 transition"
              aria-label="Unlink evidence"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      {evidence.notes && (
        <p className="text-xs text-white/80 leading-relaxed pl-5">{evidence.notes}</p>
      )}
      {error && (
        <p className="text-xs text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

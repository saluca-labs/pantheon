'use client';

/**
 * Research OS Phase 3 — Hypothesis detail header banner.
 *
 * Renders the "If / Then / Because" clauses in a prominent banner with a
 * status pill, confidence pill, and an inline archive action that hits
 * `PATCH /hypotheses/[id]` with `{ archived: true }`. The archive button
 * is replaced by a "Restore" button when the hypothesis is already
 * archived (fires the POST /restore route instead).
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore } from 'lucide-react';
import {
  HYPOTHESIS_STATUSES,
  type Hypothesis,
  type HypothesisStatus,
} from '@/lib/agentic-os/research/hypotheses';

const STATUS_COLOR: Record<HypothesisStatus, string> = {
  draft:        'text-slate-300 bg-slate-500/10 border-slate-500/30',
  active:       'text-blue-300 bg-blue-500/10 border-blue-500/30',
  testing:      'text-amber-300 bg-amber-500/10 border-amber-500/30',
  supported:    'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  refuted:      'text-red-300 bg-red-500/10 border-red-500/30',
  inconclusive: 'text-violet-300 bg-violet-500/10 border-violet-500/30',
  archived:     'text-[#94a3b8] bg-[#1a1d27] border-[#2a2d3e]',
};

const CONFIDENCE_COLOR: Record<string, string> = {
  low:    'text-rose-300 bg-rose-500/10 border-rose-500/30',
  medium: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  high:   'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
};

function statusLabel(status: HypothesisStatus): string {
  return HYPOTHESIS_STATUSES.find((s) => s.value === status)?.label ?? status;
}

interface Props {
  hypothesis: Hypothesis;
}

export function HypothesisDetailHeader({ hypothesis }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isArchived = Boolean(hypothesis.archivedAt);

  async function handleArchive() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tiresias/agentic-os/research/hypotheses/${hypothesis.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? `Failed to archive (${res.status})`);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/research/hypotheses/${hypothesis.id}/restore`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? `Failed to restore (${res.status})`);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6 mb-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-white mb-2">{hypothesis.title}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_COLOR[hypothesis.status]}`}
            >
              {statusLabel(hypothesis.status)}
            </span>
            <span
              className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${CONFIDENCE_COLOR[hypothesis.confidence] ?? CONFIDENCE_COLOR.medium}`}
            >
              {hypothesis.confidence} confidence
            </span>
            {isArchived && (
              <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border border-[#2a2d3e] bg-[#0f1117] text-[#94a3b8]">
                Archived
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isArchived ? (
            <button
              onClick={handleRestore}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-1.5 text-xs text-[#94a3b8] hover:text-white disabled:opacity-50 transition"
            >
              <ArchiveRestore className="w-3.5 h-3.5" />
              {busy ? 'Restoring…' : 'Restore'}
            </button>
          ) : (
            <button
              onClick={handleArchive}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-1.5 text-xs text-[#94a3b8] hover:text-white disabled:opacity-50 transition"
            >
              <Archive className="w-3.5 h-3.5" />
              {busy ? 'Archiving…' : 'Archive'}
            </button>
          )}
        </div>
      </div>

      {/* If / Then / Because banner */}
      <div className="space-y-2 mb-2">
        <ClauseRow label="If" text={hypothesis.ifClause} />
        <ClauseRow label="Then" text={hypothesis.thenClause} />
        <ClauseRow label="Because" text={hypothesis.becauseClause} />
      </div>

      {hypothesis.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-2">
          {hypothesis.tags.map((t) => (
            <span
              key={t}
              className="text-[10px] px-1.5 py-0.5 rounded bg-[#0f1117] border border-[#2a2d3e] text-[#94a3b8]"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-300 mt-3" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ClauseRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex gap-3 items-baseline">
      <span className="text-[10px] uppercase tracking-wide text-[#94a3b8] w-14 shrink-0">
        {label}
      </span>
      <span className="text-sm text-white leading-relaxed">{text}</span>
    </div>
  );
}

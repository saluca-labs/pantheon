/**
 * Autobiographer OS — RevisionCard.
 *
 * Single revision row used inside `revision-history-rail`. Shows
 * version + author chip, created-at, word count, and (Wave D) the
 * word-count delta against the previous revision so the rail reads
 * as a real revision history, not just a flat list. Active-revision
 * highlight when `isActive` is true.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import { ArrowDownRight, ArrowUpRight, Minus, Sparkles, User } from 'lucide-react';

export interface RevisionCardData {
  id: string;
  version: number;
  author: 'user' | 'coach';
  wordCount: number;
  createdAt: string;
  /** Optional one-line summary the author attached to the revision. */
  summary?: string | null;
}

interface Props {
  revision: RevisionCardData;
  isActive: boolean;
  onSelect: (revisionId: string) => void;
  /**
   * Word count of the chronologically-previous revision (version - 1),
   * when one exists. Used to render the per-revision delta chip.
   */
  previousWordCount?: number | null;
}

function formatStamp(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  return t.toISOString().slice(0, 10) + ' ' + t.toISOString().slice(11, 16);
}

/** Render the +N / −N / no-change delta chip against the prior revision. */
function DeltaChip({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-text-secondary">
        <Minus className="w-2.5 h-2.5" />
        no change
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] ${
        up ? 'text-positive' : 'text-danger'
      }`}
      title={`${up ? '+' : ''}${delta.toLocaleString()} words vs the previous revision`}
    >
      {up ? (
        <ArrowUpRight className="w-2.5 h-2.5" />
      ) : (
        <ArrowDownRight className="w-2.5 h-2.5" />
      )}
      {up ? '+' : ''}
      {delta.toLocaleString()}
    </span>
  );
}

export function RevisionCard({
  revision,
  isActive,
  onSelect,
  previousWordCount,
}: Props) {
  const Icon = revision.author === 'coach' ? Sparkles : User;
  const hasPrev =
    previousWordCount !== null && previousWordCount !== undefined;
  const delta = hasPrev ? revision.wordCount - previousWordCount! : null;
  return (
    <button
      type="button"
      data-testid={`revision-card-${revision.id}`}
      onClick={() => onSelect(revision.id)}
      className={`w-full text-left rounded-md border p-3 transition ${
        isActive
          ? 'border-accent bg-accent/10'
          : 'border-border-subtle bg-surface-0 hover:border-accent/40'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-white">
            v{revision.version}
          </span>
          <span
            className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${
              revision.author === 'coach'
                ? 'text-os-creator bg-os-creator/10 border-os-creator/30'
                : 'text-accent bg-accent/10 border-accent/30'
            }`}
          >
            <Icon className="w-2.5 h-2.5" />
            {revision.author}
          </span>
        </div>
        {isActive ? (
          <span className="text-[10px] uppercase tracking-wide text-accent font-medium">
            Viewing
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between text-[11px] text-text-secondary">
        <span className="inline-flex items-center gap-2">
          <span>{revision.wordCount.toLocaleString()} words</span>
          {delta !== null ? <DeltaChip delta={delta} /> : null}
        </span>
        <span className="font-mono">{formatStamp(revision.createdAt)}</span>
      </div>
      {revision.summary ? (
        <p className="mt-1.5 text-[11px] text-text-primary/80 leading-snug line-clamp-2">
          {revision.summary}
        </p>
      ) : null}
    </button>
  );
}

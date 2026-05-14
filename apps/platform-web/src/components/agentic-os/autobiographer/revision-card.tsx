/**
 * Autobiographer OS — RevisionCard.
 *
 * Single revision row used inside `revision-history-rail`. Shows
 * version + author chip, created-at, and word count. Active-revision
 * highlight when `isActive` is true.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import { Sparkles, User } from 'lucide-react';

export interface RevisionCardData {
  id: string;
  version: number;
  author: 'user' | 'coach';
  wordCount: number;
  createdAt: string;
}

interface Props {
  revision: RevisionCardData;
  isActive: boolean;
  onSelect: (revisionId: string) => void;
}

function formatStamp(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  return t.toISOString().slice(0, 10) + ' ' + t.toISOString().slice(11, 16);
}

export function RevisionCard({ revision, isActive, onSelect }: Props) {
  const Icon = revision.author === 'coach' ? Sparkles : User;
  return (
    <button
      type="button"
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
                ? 'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/30'
                : 'text-blue-300 bg-blue-500/10 border-blue-500/30'
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
        <span>{revision.wordCount.toLocaleString()} words</span>
        <span className="font-mono">{formatStamp(revision.createdAt)}</span>
      </div>
    </button>
  );
}

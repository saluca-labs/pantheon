'use client';

/**
 * Research OS Phase 5 — single dataset card.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Trash2 } from 'lucide-react';
import type { Dataset } from '@/lib/agentic-os/research/datasets';
import { DatasetKindPill } from './dataset-kind-pill';
import { DatasetArchivedToggle } from './dataset-archived-toggle';
import { Spinner } from '@/components/agentic-os/_shared/views';

interface Props {
  dataset: Dataset;
}

function formatSize(bytes: number | null): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function DatasetCard({ dataset }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function onDelete() {
    if (!confirm(`Delete dataset "${dataset.name}"? This removes only the pointer row.`)) {
      return;
    }
    setDeleting(true);
    setErr(null);
    try {
      const r = await fetch(`/api/tiresias/agentic-os/research/datasets/${dataset.id}`, {
        method: 'DELETE',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setDeleting(false);
    }
  }

  const sizeLabel = formatSize(dataset.sizeBytes);

  return (
    <div
      className="rounded-lg border border-border-subtle bg-surface-2 p-4 space-y-2"
      data-testid={`dataset-card-${dataset.id}`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-sm font-semibold text-white truncate">{dataset.name}</h3>
            <DatasetKindPill kind={dataset.kind} />
            {dataset.archived && (
              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded-full border border-amber-500/40 text-amber-300 bg-amber-500/10">
                Archived raw
              </span>
            )}
          </div>
          <a
            href={dataset.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline break-all"
          >
            <ExternalLink className="w-3 h-3" />
            {dataset.url}
          </a>
          <div className="mt-2 text-xs text-text-secondary flex flex-wrap gap-x-3 gap-y-1">
            {dataset.version && <span>v{dataset.version}</span>}
            {sizeLabel && <span>{sizeLabel}</span>}
            {dataset.checksum && (
              <span className="font-mono">sha:{dataset.checksum.slice(0, 12)}…</span>
            )}
            {dataset.publishedDoi && <span>doi:{dataset.publishedDoi}</span>}
          </div>
          {dataset.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {dataset.tags.map((t) => (
                <span
                  key={t}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-surface-0 border border-border-subtle text-text-secondary"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          {dataset.notesMd && (
            <p className="mt-2 text-xs text-text-secondary whitespace-pre-wrap">{dataset.notesMd}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <DatasetArchivedToggle datasetId={dataset.id} archived={dataset.archived} />
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 disabled:opacity-50"
            data-testid={`dataset-card-delete-${dataset.id}`}
          >
            {deleting ? (
              <Spinner size="xs" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
            Delete
          </button>
        </div>
      </div>
      {err && <p className="text-xs text-rose-400">{err}</p>}
    </div>
  );
}

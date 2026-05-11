'use client';

/**
 * Filmmaker OS — ScreenplayVersionHistory.
 *
 * Dropdown of versions with timestamps + labels. Restore copies the
 * target version into a new head version.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import Link from 'next/link';
import { History, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import type { ScreenplayVersion } from '@/lib/agentic-os/filmmaker/screenplays';

interface Props {
  projectId: string;
  screenplayId: string;
  versions: ScreenplayVersion[];
  onRestore?: (versionId: string) => void;
  restoring?: boolean;
}

export function ScreenplayVersionHistory({
  projectId,
  screenplayId,
  versions,
  onRestore,
  restoring,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-[#2a2d3e] bg-[#0f1117] text-[#cbd5e1] hover:text-white hover:border-[#4361EE]/60 transition"
      >
        <History className="w-3.5 h-3.5" />
        {open ? 'Hide history' : `History (${versions.length})`}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-3 shadow-xl z-30">
          {versions.length === 0 ? (
            <p className="text-xs text-[#94a3b8] p-2">No versions yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] p-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-white">
                        v{v.versionNumber}
                        {v.isHead ? (
                          <span className="ml-2 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                            head
                          </span>
                        ) : null}
                      </p>
                      {v.label ? (
                        <p className="text-[11px] text-[#cbd5e1] truncate">{v.label}</p>
                      ) : null}
                      <p className="text-[11px] text-[#94a3b8]">
                        {new Date(v.createdAt).toLocaleString()} ·{' '}
                        {v.wordCount.toLocaleString()} w · ~{v.pageCountEstimate.toFixed(1)} pg
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Link
                        href={`/dashboard/os/filmmaker/projects/${projectId}/screenplay/versions/${v.id}`}
                        className="text-[11px] px-2 py-0.5 rounded border border-[#2a2d3e] text-[#cbd5e1] hover:text-white hover:border-[#4361EE]/60 transition"
                      >
                        Open
                      </Link>
                      {!v.isHead && onRestore && (
                        <button
                          type="button"
                          disabled={restoring}
                          onClick={() => onRestore(v.id)}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-[#2a2d3e] text-[#cbd5e1] hover:text-white hover:border-[#4361EE]/60 disabled:opacity-50 transition"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Restore
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

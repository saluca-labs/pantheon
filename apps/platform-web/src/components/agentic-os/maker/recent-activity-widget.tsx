'use client';

/**
 * Maker OS — RecentActivityWidget.
 *
 * Hub-level card showing the most recent build-log entries across all of
 * the current user's Maker projects. Each row links to the source project's
 * Build log tab so the user can dive in with one click.
 *
 * Fetches `/api/tiresias/agentic-os/maker/recent-activity` on mount; the
 * server caps the response at 5 entries (or the requested `limit` up to 25).
 *
 * @license MIT — Tiresias Maker OS Phase 3 (internal).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Hammer, Image as ImageIcon, Link as LinkIcon } from 'lucide-react';
import type { RecentLogEntry } from '@/lib/agentic-os/maker/log';
import { SkeletonGroup, Skeleton } from '@/components/agentic-os/_shared/views';

const API_BASE = '/api/tiresias/agentic-os/maker';

interface Props {
  limit?: number;
}

export function RecentActivityWidget({ limit = 5 }: Props) {
  const [entries, setEntries] = useState<RecentLogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(`${API_BASE}/recent-activity?limit=${limit}`);
        if (!cancelled && r.ok) {
          const { entries: latest } = await r.json();
          setEntries(latest ?? []);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 p-4">
      <h2 className="text-sm font-semibold text-white uppercase tracking-wide mb-3 inline-flex items-center gap-2">
        <Hammer className="w-4 h-4" />
        Recent activity
      </h2>
      {!loaded && (
        <SkeletonGroup>
          <Skeleton variant="list-row" />
          <Skeleton variant="list-row" />
          <Skeleton variant="list-row" />
        </SkeletonGroup>
      )}
      {loaded && entries.length === 0 && (
        <p className="text-xs text-text-secondary">
          No build-log entries yet. Activity from any project will appear here.
        </p>
      )}
      <ul className="space-y-2">
        {entries.map((entry) => {
          const dt = new Date(entry.createdAt);
          const photoCount = entry.attachedUrls.filter((u) => u.kind === 'photo').length;
          const linkCount = entry.attachedUrls.length - photoCount;
          return (
            <li key={entry.id}>
              <Link
                href={`/dashboard/os/maker/projects/${entry.projectId}?tab=log`}
                className="block rounded-md border border-transparent px-2 py-2 hover:border-border-subtle hover:bg-surface-0"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-white truncate">
                    {entry.projectName}
                  </span>
                  <span className="text-[10px] text-text-secondary shrink-0">
                    {dt.toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-1 text-xs text-text-primary line-clamp-2">{entry.body}</p>
                {(photoCount > 0 || linkCount > 0) && (
                  <div className="mt-1 flex items-center gap-3 text-[10px] text-text-secondary">
                    {photoCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" />
                        {photoCount}
                      </span>
                    )}
                    {linkCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <LinkIcon className="w-3 h-3" />
                        {linkCount}
                      </span>
                    )}
                  </div>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

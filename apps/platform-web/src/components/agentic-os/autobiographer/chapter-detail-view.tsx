'use client';

/**
 * Autobiographer OS — ChapterDetailView.
 *
 * Three-column client shell for the chapter detail page. Manages the
 * active-revision selection so the rail + center editor stay in sync
 * without a page reload.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import { useMemo, useState } from 'react';
import {
  RevisionHistoryRail,
} from './revision-history-rail';
import { RevisionEditor } from './revision-editor';
import {
  ChapterSourcesPanel,
  type SourcePanelRow,
} from './chapter-sources-panel';

export interface RevisionForDetail {
  id: string;
  version: number;
  author: 'user' | 'coach';
  bodyText: string;
  summary: string | null;
  wordCount: number;
  createdAt: string;
}

interface Props {
  chapterId: string;
  revisions: RevisionForDetail[];
  sources: SourcePanelRow[];
}

export function ChapterDetailView({
  chapterId,
  revisions,
  sources,
}: Props) {
  // Default to the highest-version revision (revisions arrive
  // version-DESC from the repo).
  const initial = revisions[0]?.id ?? null;
  const [activeId, setActiveId] = useState<string | null>(initial);

  const active = useMemo(
    () => revisions.find((r) => r.id === activeId) ?? revisions[0] ?? null,
    [revisions, activeId],
  );

  const railRows = revisions.map((r) => ({
    id: r.id,
    version: r.version,
    author: r.author,
    wordCount: r.wordCount,
    createdAt: r.createdAt,
  }));

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-3">
        <RevisionHistoryRail
          chapterId={chapterId}
          revisions={railRows}
          activeRevisionId={active?.id ?? null}
          onSelect={(id) => setActiveId(id)}
          seedBody={active?.bodyText ?? ''}
        />
      </div>
      <div className="col-span-6">
        {active ? (
          <RevisionEditor
            chapterId={chapterId}
            revisionId={active.id}
            initialBody={active.bodyText}
            initialSummary={active.summary}
            readOnly={active.author === 'coach'}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-border-subtle bg-surface-2/50 p-6 text-sm text-text-secondary text-center">
            No revisions yet. Use the rail to create the first one — it will
            be authored by you and start at version 1.
          </div>
        )}
      </div>
      <div className="col-span-3">
        <ChapterSourcesPanel chapterId={chapterId} sources={sources} />
      </div>
    </div>
  );
}

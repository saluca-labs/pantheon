'use client';

/**
 * Creator OS — hub dashboard region (Wave E-3, UI Depth Wave).
 *
 * Rendered through `_shared/DashboardHub`'s `dashboardSlot` escape hatch.
 * Wave E-3 retired the bespoke `CreatorHub` client component — the icon /
 * name / status badge / tagline / description header and the registry
 * feature grid now come from the shared hub shell. Everything that hub
 * shell can't express declaratively lives here:
 *  - the quick-create "New Note" button (client `fetch` + navigate),
 *  - the four aggregate-stat `DashboardWidget` tiles (built by the pure
 *    `buildCreatorDashboardWidgets` adapter),
 *  - the merged recent-activity `ActivityFeed` (events from the pure
 *    `buildCreatorActivityEvents` adapter),
 *  - the conditional pinned-notes grid,
 *  - the recent-notes list with its quick-create `EmptyState`.
 *
 * The hub's declarative `dashboard` prop only models widgets / chart /
 * activity; the quick-create interactivity and the pinned + recent-notes
 * sections genuinely don't fit those three slots, so the whole region is
 * composed here and handed to `dashboardSlot` as one node.
 *
 * Zero capability loss: same data, same routes, same counts, same status
 * mixes, same empty states, same quick-create behavior as the bespoke hub.
 *
 * @license MIT — Tiresias Creator OS (internal).
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Pin, Clock, FileText } from 'lucide-react';
import {
  ActivityFeed,
  DashboardWidget,
  EmptyState,
} from '@/components/agentic-os/_shared/views';
import type { CreatorNote } from '@/lib/agentic-os/creator/notes';
import type { CreatorPost } from '@/lib/agentic-os/creator/posts';
import type { CreatorBook } from '@/lib/agentic-os/creator/books';
import type { CreatorSubscriber } from '@/lib/agentic-os/creator/subscribers';
import {
  buildCreatorActivityEvents,
  buildCreatorDashboardWidgets,
} from '@/lib/agentic-os/creator/dashboard-spec';

export interface CreatorDashboardProps {
  pinnedNotes: CreatorNote[];
  recentNotes: CreatorNote[];
  posts: CreatorPost[];
  books: CreatorBook[];
  subscribers: CreatorSubscriber[];
}

export function CreatorDashboard({
  pinnedNotes,
  recentNotes,
  posts,
  books,
  subscribers,
}: CreatorDashboardProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function handleQuickCreate() {
    setCreating(true);
    try {
      const res = await fetch('/api/tiresias/agentic-os/creator/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled' }),
      });
      if (res.ok) {
        const created = await res.json();
        router.push(`/dashboard/os/creator/notes/${created.id}`);
      }
    } finally {
      setCreating(false);
    }
  }

  const widgets = buildCreatorDashboardWidgets({
    notes: recentNotes,
    pinnedCount: pinnedNotes.length,
    posts,
    books,
    subscribers,
  });

  const activityEvents = buildCreatorActivityEvents({
    notes: recentNotes,
    posts,
    books,
  });

  return (
    <div className="flex flex-col gap-8" data-testid="creator-dashboard">
      {/* Quick-create — the bespoke header's "New Note" action. */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleQuickCreate}
          disabled={creating}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-os-creator text-white text-sm font-medium hover:bg-os-creator/90 disabled:opacity-50 transition"
        >
          <Plus className="w-4 h-4" />
          {creating ? 'Creating…' : 'New Note'}
        </button>
      </div>

      {/* Aggregate-state dashboard strip — Notes / Publishing / Books /
          Subscribers, built by the pure spec adapter. */}
      <section>
        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          data-testid="creator-hub-widgets"
        >
          {widgets.map((widget, i) => (
            <DashboardWidget key={widget['data-testid'] ?? i} {...widget} />
          ))}
        </div>
      </section>

      {/* Recent activity across notes / posts / books. */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-text-secondary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            Recent Activity
          </h2>
        </div>
        <div
          className="rounded-xl border border-border-subtle bg-surface-2 p-2"
          data-testid="creator-recent-activity"
        >
          <ActivityFeed
            events={activityEvents}
            grouping="day"
            emptyState={{
              title: 'Nothing here yet',
              description:
                'Write a note, draft a post, or start a book and recent edits will show up here.',
            }}
          />
        </div>
      </section>

      {/* Pinned notes. */}
      {pinnedNotes.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Pin className="w-4 h-4 text-os-creator" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
              Pinned
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pinnedNotes.map((note) => (
              <Link
                key={note.id}
                href={`/dashboard/os/creator/notes/${note.id}`}
                className="group rounded-xl border border-border-subtle bg-surface-2 p-4 hover:border-os-creator/50 transition"
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl flex-shrink-0">
                    {note.icon || (
                      <FileText className="w-5 h-5 text-text-secondary/60" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium text-white truncate group-hover:text-os-creator transition">
                      {note.title || 'Untitled'}
                    </h3>
                    {note.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {note.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-os-creator/10 text-os-creator/80 border border-os-creator/20"
                          >
                            {tag}
                          </span>
                        ))}
                        {note.tags.length > 3 && (
                          <span className="text-[10px] text-text-secondary">
                            +{note.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recent notes. */}
      <section data-testid="creator-recent-notes">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4 text-text-secondary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            Recent Notes
          </h2>
        </div>
        {recentNotes.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title="No notes yet"
            description="Create your first note to start organizing your content."
            primaryCta={{
              label: creating ? 'Creating…' : 'New Note',
              onClick: handleQuickCreate,
              icon: <Plus className="h-4 w-4" />,
            }}
          />
        ) : (
          <div className="rounded-xl border border-border-subtle bg-surface-2 divide-y divide-border-subtle">
            {recentNotes.map((note) => (
              <Link
                key={note.id}
                href={`/dashboard/os/creator/notes/${note.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-3 transition group"
              >
                <span className="text-lg flex-shrink-0">
                  {note.icon || (
                    <FileText className="w-4 h-4 text-text-secondary/60" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate group-hover:text-os-creator transition">
                    {note.title || 'Untitled'}
                  </p>
                  <p className="text-xs text-text-secondary/70">
                    Updated {new Date(note.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                {note.tags.length > 0 && (
                  <div className="hidden sm:flex items-center gap-1">
                    {note.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-border-subtle text-text-secondary"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

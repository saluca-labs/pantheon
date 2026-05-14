'use client';

/**
 * JournalEntryBrowser — the journal list surface for the Health OS journal
 * page (Wave C-1b adoption).
 *
 * Wraps the already-loaded journal entries with the shared `EntitySearch`
 * primitive for in-page filtering, and `EmptyState` for the zero-data and
 * no-matches cases. Behavior-preserving: the entries, routes, and links are
 * unchanged — this only adds a client-side title/body filter over the rows
 * the server already sent.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { EntitySearch, EmptyState } from '@/components/agentic-os/_shared/views';

/** Minimal projection of a journal entry the list needs to render. */
export interface JournalEntrySummary {
  id: string;
  title: string | null;
  body: string;
  entryAt: string;
  prompt?: { category: string } | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function JournalEntryBrowser({
  entries,
}: {
  entries: JournalEntrySummary[];
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const title = (e.title ?? '').toLowerCase();
      const body = e.body.toLowerCase();
      const cat = (e.prompt?.category ?? '').toLowerCase();
      return title.includes(q) || body.includes(q) || cat.includes(q);
    });
  }, [entries, query]);

  // Whole-feature empty: no entries at all.
  if (entries.length === 0) {
    return (
      <EmptyState
        variant="bare"
        icon={<BookOpen className="h-6 w-6" />}
        title="No entries yet"
        description="Pick a prompt or start from a blank page using the “New entry” button above."
        primaryCta={{
          label: 'New entry',
          href: '/dashboard/os/health/journal/new',
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <EntitySearch
        placeholder="Search your journal…"
        onQueryChange={setQuery}
      />

      {filtered.length === 0 ? (
        <EmptyState
          variant="bare"
          icon={<BookOpen className="h-6 w-6" />}
          title="No entries match that search"
          description="Try a different word, or clear the search to see everything."
        />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {filtered.map((e) => (
            <li key={e.id} className="py-3">
              <Link
                href={`/dashboard/os/health/journal/${e.id}`}
                className="block group"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-medium text-text-primary group-hover:text-accent transition truncate">
                    {e.title || 'Untitled entry'}
                  </h3>
                  <span className="text-xs text-text-secondary shrink-0">
                    {formatDate(e.entryAt)}
                  </span>
                </div>
                {e.prompt && (
                  <div className="text-2xs uppercase tracking-wide text-accent mt-0.5">
                    {e.prompt.category.replace(/-/g, ' ')}
                  </div>
                )}
                <p className="text-xs text-text-secondary mt-1 line-clamp-2 leading-relaxed">
                  {e.body}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

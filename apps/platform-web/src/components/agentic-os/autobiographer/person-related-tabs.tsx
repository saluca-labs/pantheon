'use client';

/**
 * Autobiographer OS — PersonRelatedTabs.
 *
 * Wave C-3b (UI Depth Wave) — wires the shared `CrossEntityTabs`
 * primitive into the person detail page. Surfaces the two linked-entity
 * collections (memories that mention this person, books they appear in)
 * as a tab strip with count badges instead of two stacked sections.
 *
 * Behavior-preserving: the row markup, links, and empty copy are carried
 * over verbatim from the prior bespoke sections — only the framing
 * changes from sibling `<section>`s to a tabbed surface.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import Link from 'next/link';
import { CrossEntityTabs } from '@/components/agentic-os/_shared/views';

export interface PersonRelatedMemory {
  memoryId: string;
  title: string;
  whenInLife: string | null;
  eraDateEstimate: string | null;
  role: string | null;
}

export interface PersonRelatedBook {
  bookId: string;
  bookTitle: string;
  memoryCount: number;
}

interface Props {
  personName: string;
  memories: PersonRelatedMemory[];
  books: PersonRelatedBook[];
}

export function PersonRelatedTabs({ personName, memories, books }: Props) {
  return (
    <CrossEntityTabs
      slug="autobiographer"
      tabs={[
        {
          key: 'memories',
          label: 'Memories',
          count: memories.length,
          content: () =>
            memories.length === 0 ? (
              <p className="text-xs text-text-tertiary italic">
                No memories link to this person yet. Open a memory and use the
                People picker to add them.
              </p>
            ) : (
              <ul className="space-y-2">
                {memories.map((m) => (
                  <li
                    key={m.memoryId}
                    className="rounded border border-border-subtle bg-surface-0 px-3 py-2"
                  >
                    <Link
                      href={`/dashboard/os/autobiographer/memories/${m.memoryId}`}
                      className="text-sm text-white hover:text-accent transition"
                    >
                      {m.title}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] text-text-secondary">
                      {(m.whenInLife || m.eraDateEstimate) && (
                        <span>{m.whenInLife ?? m.eraDateEstimate}</span>
                      )}
                      {m.role && (
                        <span className="px-1.5 py-0.5 rounded bg-surface-2 border border-border-subtle text-text-primary">
                          {m.role}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ),
        },
        {
          key: 'books',
          label: 'Books',
          count: books.length,
          content: () =>
            books.length === 0 ? (
              <p className="text-xs text-text-tertiary italic">
                They don&apos;t appear in any books yet. Memories must be
                attached to a book for it to show up here.
              </p>
            ) : (
              <ul className="space-y-2">
                {books.map((b) => (
                  <li
                    key={b.bookId}
                    className="flex items-center justify-between rounded border border-border-subtle bg-surface-0 px-3 py-2"
                  >
                    <Link
                      href={`/dashboard/os/autobiographer/books/${b.bookId}`}
                      className="text-sm text-white hover:text-accent transition"
                    >
                      {b.bookTitle}
                    </Link>
                    <span className="text-[10px] text-text-secondary">
                      {b.memoryCount}{' '}
                      {b.memoryCount === 1 ? 'memory' : 'memories'}
                    </span>
                  </li>
                ))}
              </ul>
            ),
        },
      ]}
    />
  );
}

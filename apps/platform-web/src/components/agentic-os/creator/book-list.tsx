'use client';

/**
 * Creator OS Phase 3 — Book list component.
 *
 * Displays a grid of book cards with title, description, status badge, and
 * a "New Book" button that creates via the POST API and navigates to the
 * editor.
 *
 * Wave C-4a (UI Depth Wave): adds the shared `EntitySearch` primitive for
 * client-side title/description filtering, and swaps the ad-hoc empty
 * state for `EmptyState`. The create flow and card routing are unchanged.
 *
 * @license MIT — Tiresias Creator OS Phase 3 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Plus } from 'lucide-react';
import { EntitySearch, EmptyState } from '@/components/agentic-os/_shared/views';
import type { CreatorBook } from '@/lib/agentic-os/creator/books';

interface BookListProps {
  books: CreatorBook[];
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-border-subtle text-text-secondary',
  writing: 'bg-accent/20 text-accent',
  complete: 'bg-emerald-500/20 text-emerald-400',
  published: 'bg-os-creator/20 text-os-creator',
};

function BookCard({ book }: { book: CreatorBook }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.push(`/dashboard/os/creator/books/${book.id}`)}
      className="group relative rounded-lg border border-border-subtle bg-surface-2 p-5 text-left hover:border-os-creator/50 hover:bg-surface-3 transition-colors"
    >
      {/* Cover image or placeholder */}
      <div className="mb-4 h-32 rounded-md bg-surface-0 border border-border-subtle flex items-center justify-center overflow-hidden">
        {book.coverImageUrl ? (
          <img
            src={book.coverImageUrl}
            alt={book.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <BookOpen className="w-8 h-8 text-text-tertiary" />
        )}
      </div>

      <h3 className="font-semibold text-white text-sm mb-1 truncate">
        {book.title}
      </h3>

      {book.description && (
        <p className="text-xs text-text-tertiary mb-3 line-clamp-2">
          {book.description}
        </p>
      )}

      <span
        className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[book.status] ?? STATUS_COLORS.draft}`}
      >
        {book.status}
      </span>
    </button>
  );
}

export function BookList({ books }: BookListProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = books.filter((b) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.title.toLowerCase().includes(q) ||
      (b.description ?? '').toLowerCase().includes(q)
    );
  });

  async function handleCreate() {
    setCreating(true);
    try {
      const r = await fetch('/api/tiresias/agentic-os/creator/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled Book' }),
      });
      if (r.ok) {
        const book = await r.json();
        router.push(`/dashboard/os/creator/books/${book.id}`);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Books</h2>
          <p className="text-sm text-text-tertiary mt-0.5">
            Long-form writing with chapters, word-count tracking, and Pandoc export.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-os-creator text-white text-sm font-medium hover:bg-os-creator/90 disabled:opacity-50 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {creating ? 'Creating…' : 'New Book'}
        </button>
      </div>

      {/* Search */}
      {books.length > 0 && (
        <EntitySearch
          placeholder="Search books by title or description…"
          defaultValue={searchQuery}
          onQueryChange={setSearchQuery}
        />
      )}

      {/* Book grid */}
      {filtered.length === 0 ? (
        searchQuery ? (
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title="No books match"
            description="Try a different search term."
          />
        ) : (
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title="No books yet"
            description="Create your first book to start writing long-form content."
            primaryCta={{
              label: creating ? 'Creating…' : 'New Book',
              onClick: handleCreate,
              icon: <Plus className="h-4 w-4" />,
            }}
          />
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      )}
    </div>
  );
}

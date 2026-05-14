'use client';

/**
 * Creator OS Phase 1 — Hub landing page.
 *
 * Renders a grid of pinned notes cards and a list of recent notes.
 * Includes a quick-create button that posts to the API then navigates
 * to the new note.
 *
 * @license MIT — Tiresias Creator OS Phase 1 (internal).
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Pin, Clock, Sparkles, FileText } from 'lucide-react';
import type { CreatorNote } from '@/lib/agentic-os/creator/notes';

interface CreatorHubProps {
  pinnedNotes: CreatorNote[];
  recentNotes: CreatorNote[];
}

export function CreatorHub({ pinnedNotes, recentNotes }: CreatorHubProps) {
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

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Sparkles className="w-7 h-7 text-[#d946ef]" />
            <h1 className="text-2xl font-semibold text-white">Creator Hub</h1>
          </div>
          <p className="text-sm text-text-secondary">
            Write, plan, and organize your content. Jump into your notes or
            start something new.
          </p>
        </div>
        <button
          type="button"
          onClick={handleQuickCreate}
          disabled={creating}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#d946ef] text-white text-sm font-medium hover:bg-[#c026d3] disabled:opacity-50 transition"
        >
          <Plus className="w-4 h-4" />
          {creating ? 'Creating…' : 'New Note'}
        </button>
      </div>

      {/* Pinned notes */}
      {pinnedNotes.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Pin className="w-4 h-4 text-[#d946ef]" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
              Pinned
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pinnedNotes.map((note) => (
              <Link
                key={note.id}
                href={`/dashboard/os/creator/notes/${note.id}`}
                className="group rounded-xl border border-border-subtle bg-surface-2 p-4 hover:border-[#d946ef]/50 transition"
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl flex-shrink-0">
                    {note.icon || <FileText className="w-5 h-5 text-text-secondary/60" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium text-white truncate group-hover:text-[#d946ef] transition">
                      {note.title || 'Untitled'}
                    </h3>
                    {note.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {note.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-[#d946ef]/10 text-[#d946ef]/80 border border-[#d946ef]/20"
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

      {/* Recent notes */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-text-secondary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            Recent Notes
          </h2>
        </div>
        {recentNotes.length === 0 ? (
          <div className="rounded-xl border border-border-subtle bg-surface-2 p-8 text-center">
            <FileText className="w-8 h-8 text-text-secondary/40 mx-auto mb-3" />
            <p className="text-sm text-text-secondary">
              No notes yet. Create your first note to get started.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border-subtle bg-surface-2 divide-y divide-border-subtle">
            {recentNotes.map((note) => (
              <Link
                key={note.id}
                href={`/dashboard/os/creator/notes/${note.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[#222633] transition group"
              >
                <span className="text-lg flex-shrink-0">
                  {note.icon || <FileText className="w-4 h-4 text-text-secondary/60" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate group-hover:text-[#d946ef] transition">
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

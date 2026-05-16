'use client';

/**
 * Autobiographer OS — AddSourceButton.
 *
 * Modal trigger that lets the author pick from their memory captures
 * and link one as a provenance source for this chapter. The picker is
 * a flat searchable list — the user's memory volume is modest enough
 * (low-hundreds typical) that pagination isn't worth the complexity in
 * Phase 4.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import { useState, useMemo, useEffect } from 'react';
import { Plus, Search } from 'lucide-react';
import { SkeletonGroup, Skeleton } from '@/components/agentic-os/_shared/views';

interface MemoryOption {
  id: string;
  title: string;
  whenInLife: string | null;
}

interface Props {
  chapterId: string;
  /** Memory ids already linked — hidden from the picker. */
  excludedMemoryIds: string[];
}

export function AddSourceButton({ chapterId, excludedMemoryIds }: Props) {
  const [open, setOpen] = useState(false);
  const [memories, setMemories] = useState<MemoryOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const excluded = useMemo(() => new Set(excludedMemoryIds), [excludedMemoryIds]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/tiresias/agentic-os/autobiographer/memories?limit=500`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Load failed (${r.status})`);
        return r.json();
      })
      .then((data: { memories?: { id: string; title?: string | null; whenInLife?: string | null }[] }) => {
        if (cancelled) return;
        const rows: MemoryOption[] = (data?.memories ?? []).map((m) => ({
          id: m.id,
          title: m.title ?? 'Untitled memory',
          whenInLife: m.whenInLife ?? null,
        }));
        setMemories(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Load failed.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return memories
      .filter((m) => !excluded.has(m.id))
      .filter((m) => {
        if (!q) return true;
        return (
          m.title.toLowerCase().includes(q) ||
          (m.whenInLife ?? '').toLowerCase().includes(q)
        );
      });
  }, [memories, query, excluded]);

  async function link(memoryId: string) {
    setAdding(memoryId);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/autobiographer/chapters/${chapterId}/sources`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ memory_id: memoryId, weight: 1.0 }),
        },
      );
      if (!res.ok && res.status !== 409) {
        const text = await res.text().catch(() => '');
        throw new Error(`Link failed (${res.status}): ${text}`);
      }
      setOpen(false);
      if (typeof window !== 'undefined') window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Link failed.');
    } finally {
      setAdding(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border border-border-subtle bg-surface-0 text-text-primary hover:border-accent/40"
      >
        <Plus className="w-3 h-3" />
        Add source
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border-subtle bg-surface-2 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">
                Link a memory as a source
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-text-secondary hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title or era"
                className="w-full rounded-md border border-border-subtle bg-surface-0 pl-7 pr-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none"
              />
            </div>
            {error ? (
              <p className="text-xs text-danger">{error}</p>
            ) : null}
            <div className="max-h-80 overflow-auto rounded-md border border-border-subtle bg-surface-0">
              {loading ? (
                <SkeletonGroup className="p-3">
                  <Skeleton variant="list-row" />
                  <Skeleton variant="list-row" />
                  <Skeleton variant="list-row" />
                </SkeletonGroup>
              ) : filtered.length === 0 ? (
                <p className="p-3 text-xs text-text-secondary">
                  No memories match. Capture more in the Memory Captures
                  page first.
                </p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {filtered.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-2 p-2 hover:bg-surface-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-white truncate">
                          {m.title}
                        </div>
                        {m.whenInLife ? (
                          <div className="text-[11px] text-text-secondary truncate">
                            {m.whenInLife}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        disabled={adding === m.id}
                        onClick={() => link(m.id)}
                        className="text-[11px] px-2 py-1 rounded bg-accent text-white hover:bg-accent/90 disabled:opacity-60 shrink-0"
                      >
                        {adding === m.id ? 'Linking…' : 'Link'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

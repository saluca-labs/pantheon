'use client';

/**
 * Research OS Phase 4 — paper reference linker.
 *
 * Sits in the experiment Literature tab. Shows the linked papers as a
 * list, with a search-driven picker to add a new reference and a
 * relevance dropdown per row. Also exposes a "Create new paper"
 * fallback that pops the user out to the library new-paper form.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, X, Link as LinkIcon } from 'lucide-react';
import Link from 'next/link';
import type {
  LinkedPaperReference,
  ReferenceRelevance,
} from '@/lib/agentic-os/research/experiment-references';
import {
  REFERENCE_RELEVANCES,
  REFERENCE_RELEVANCE_LABELS,
} from '@/lib/agentic-os/research/experiment-references';
import type { Paper } from '@/lib/agentic-os/research/papers';
import { PaperKindPill } from './paper-kind-pill';

interface Props {
  experimentId: string;
  initialReferences: LinkedPaperReference[];
}

export function PaperReferenceLinker({ experimentId, initialReferences }: Props) {
  const router = useRouter();
  const [references, setReferences] = useState<LinkedPaperReference[]>(initialReferences);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);
  const [relevance, setRelevance] = useState<ReferenceRelevance>('cites');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      setLoading(true);
      fetch(
        `/api/tiresias/agentic-os/research/papers?q=${encodeURIComponent(search.trim())}&limit=20`,
      )
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Failed (${r.status})`))))
        .then((data) => setResults(Array.isArray(data.papers) ? data.papers : []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [search]);

  async function handleLink(paper: Paper) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/research/experiments/${experimentId}/references`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            paperId: paper.id,
            relevance,
            notes: notes.trim() || null,
          }),
        },
      );
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        setError(
          detail && typeof detail.error === 'string'
            ? detail.error
            : `Failed (${res.status})`,
        );
        return;
      }
      const data = await res.json();
      setReferences((prev) => [...prev, { link: data.link, paper }]);
      setSearch('');
      setResults([]);
      setNotes('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnlink(paperId: string, rel: ReferenceRelevance) {
    setError(null);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/research/experiments/${experimentId}/references/${paperId}?relevance=${rel}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        setError(
          detail && typeof detail.error === 'string'
            ? detail.error
            : `Failed (${res.status})`,
        );
        return;
      }
      setReferences((prev) =>
        prev.filter((r) => !(r.paper.id === paperId && r.link.relevance === rel)),
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
  }

  return (
    <div className="space-y-4" data-testid="paper-reference-linker">
      {/* Linked list */}
      {references.length === 0 ? (
        <p
          className="text-sm text-text-secondary italic py-4 text-center"
          data-testid="paper-reference-linker-empty"
        >
          No papers linked yet. Search the library below to add one.
        </p>
      ) : (
        <ul className="space-y-2" data-testid="paper-reference-linker-list">
          {references.map((r) => (
            <li
              key={r.link.id}
              className="rounded-lg border border-border-subtle bg-surface-2 p-3"
              data-testid={`paper-reference-row-${r.link.id}`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/dashboard/os/research/library/${r.paper.id}`}
                      className="text-sm font-semibold text-white hover:underline truncate"
                    >
                      {r.paper.title}
                    </Link>
                    <PaperKindPill kind={r.paper.kind} />
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-accent/40 bg-accent/15 text-text-primary">
                      {REFERENCE_RELEVANCE_LABELS[r.link.relevance]}
                    </span>
                  </div>
                  {r.paper.authorsText && (
                    <p className="text-[10px] text-text-secondary mt-1 truncate">
                      {r.paper.authorsText}
                    </p>
                  )}
                  {r.link.notes && (
                    <p className="text-xs text-text-primary mt-2">{r.link.notes}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleUnlink(r.paper.id, r.link.relevance)}
                  className="text-text-secondary hover:text-rose-300"
                  aria-label="Unlink"
                  data-testid={`paper-reference-unlink-${r.link.id}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Picker */}
      <div className="rounded-lg border border-border-subtle bg-surface-0 p-3 space-y-3" data-testid="paper-reference-picker">
        <p className="text-xs font-semibold text-white uppercase tracking-wide">
          Add reference
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="md:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the library by title or authors"
              className="w-full pl-10 pr-3 py-2 rounded-lg bg-surface-2 border border-border-subtle text-sm text-white focus:border-accent/60 outline-none"
              data-testid="paper-reference-search"
            />
          </div>
          <select
            value={relevance}
            onChange={(e) => setRelevance(e.target.value as ReferenceRelevance)}
            className="px-3 py-2 rounded-lg bg-surface-2 border border-border-subtle text-sm text-white focus:border-accent/60 outline-none"
            data-testid="paper-reference-relevance-select"
          >
            {REFERENCE_RELEVANCES.map((r) => (
              <option key={r} value={r}>
                {REFERENCE_RELEVANCE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>

        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border-subtle text-sm text-white focus:border-accent/60 outline-none"
          data-testid="paper-reference-notes"
        />

        {loading && (
          <p className="text-xs text-text-secondary" data-testid="paper-reference-loading">
            Searching…
          </p>
        )}

        {results.length > 0 && (
          <ul className="rounded-lg border border-border-subtle bg-surface-2 overflow-hidden divide-y divide-border-subtle max-h-60 overflow-y-auto" data-testid="paper-reference-results">
            {results.map((p) => (
              <li
                key={p.id}
                className="px-3 py-2 hover:bg-surface-0 cursor-pointer flex items-center justify-between"
                onClick={() => handleLink(p)}
                data-testid={`paper-reference-result-${p.id}`}
              >
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{p.title}</p>
                  <p className="text-[10px] text-text-secondary truncate">
                    {p.authorsText || p.venue || p.year}
                  </p>
                </div>
                <span className="text-[10px] text-accent inline-flex items-center gap-1 shrink-0">
                  <LinkIcon className="w-3 h-3" />
                  Link
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Create-new fallback */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border-subtle">
          <p className="text-[10px] text-text-secondary">
            Don&apos;t see it?
          </p>
          <Link
            href="/dashboard/os/research/library?new=1"
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
            data-testid="paper-reference-new"
          >
            <Plus className="w-3 h-3" />
            Create new paper
          </Link>
        </div>

        {error && (
          <p className="text-xs text-rose-300" data-testid="paper-reference-error">
            {error}
          </p>
        )}
        {submitting && (
          <p className="text-xs text-text-secondary" data-testid="paper-reference-submitting">
            Linking…
          </p>
        )}
      </div>
    </div>
  );
}

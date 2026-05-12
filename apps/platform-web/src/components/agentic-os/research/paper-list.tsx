'use client';

/**
 * Research OS Phase 4 — paper list with filter chips + search.
 *
 * Client-side state for the library page. Holds the filter chip state
 * (kind + tag + year) and free-text query, refetches from
 * `/api/tiresias/agentic-os/research/papers` on change, and renders
 * the resulting list as `PaperCard`s.
 *
 * The author hydration is intentionally deferred — the list endpoint
 * does NOT carry per-paper joined authors (avoids N+1 on the list
 * surface). Detail page hydrates them when navigated to.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Paper } from '@/lib/agentic-os/research/papers';
import { PAPER_KINDS, PAPER_KIND_LABELS, type PaperKind } from '@/lib/agentic-os/research/paper-kinds';
import { PaperCard } from './paper-card';

interface Props {
  initialPapers: Paper[];
}

export function PaperList({ initialPapers }: Props) {
  const [papers, setPapers] = useState<Paper[]>(initialPapers);
  const [kind, setKind] = useState<PaperKind | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [q, setQ] = useState<string>('');
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tag cloud derived from initial set — Phase 4 deviates from spec's
  // shared `tag-heatmap` primitive (not in repo) and uses a flat tag
  // chip strip instead.
  const allTags = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of initialPapers) {
      for (const t of p.tags) {
        seen.set(t, (seen.get(t) ?? 0) + 1);
      }
    }
    return Array.from(seen.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 30);
  }, [initialPapers]);

  const allYears = useMemo(() => {
    const seen = new Set<number>();
    for (const p of initialPapers) {
      if (p.year != null) seen.add(p.year);
    }
    return Array.from(seen).sort((a, b) => b - a);
  }, [initialPapers]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (kind) params.set('kind', kind);
    if (tag) params.set('tag', tag);
    if (year != null) params.set('year', String(year));
    if (q.trim()) params.set('q', q.trim());
    if (showArchived) params.set('archived', 'true');
    fetch(`/api/tiresias/agentic-os/research/papers?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed (${r.status})`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setPapers(Array.isArray(data.papers) ? data.papers : []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Network error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, tag, year, q, showArchived]);

  return (
    <div className="space-y-4" data-testid="paper-list">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title or authors"
          className="w-full pl-10 pr-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3e] text-sm text-white focus:border-[#4361EE]/60 outline-none"
          data-testid="paper-list-search"
        />
      </div>

      {/* Kind filter chips */}
      <div className="flex flex-wrap gap-1" data-testid="paper-list-kind-chips">
        <ChipButton
          active={kind === null}
          onClick={() => setKind(null)}
          label="All kinds"
        />
        {PAPER_KINDS.map((k) => (
          <ChipButton
            key={k}
            active={kind === k}
            onClick={() => setKind(kind === k ? null : k)}
            label={PAPER_KIND_LABELS[k]}
            testId={`kind-chip-${k}`}
          />
        ))}
      </div>

      {/* Year filter chips */}
      {allYears.length > 0 && (
        <div className="flex flex-wrap gap-1" data-testid="paper-list-year-chips">
          <ChipButton
            active={year === null}
            onClick={() => setYear(null)}
            label="All years"
          />
          {allYears.slice(0, 12).map((y) => (
            <ChipButton
              key={y}
              active={year === y}
              onClick={() => setYear(year === y ? null : y)}
              label={String(y)}
              testId={`year-chip-${y}`}
            />
          ))}
        </div>
      )}

      {/* Tag chip strip */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1" data-testid="paper-list-tag-strip">
          {allTags.map(([t, count]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(tag === t ? null : t)}
              className={`text-[10px] px-1.5 py-0.5 rounded border transition ${
                tag === t
                  ? 'bg-[#4361EE]/20 border-[#4361EE]/60 text-white'
                  : 'bg-[#0f1117] border-[#2a2d3e] text-[#94a3b8] hover:border-[#4361EE]/40'
              }`}
              data-testid={`tag-chip-${t}`}
            >
              {t} <span className="text-[9px] opacity-60">({count})</span>
            </button>
          ))}
          {tag && (
            <button
              type="button"
              onClick={() => setTag(null)}
              className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border bg-rose-500/15 border-rose-500/40 text-rose-300 hover:bg-rose-500/25"
              data-testid="tag-clear"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
      )}

      {/* Archive toggle */}
      <label className="inline-flex items-center gap-2 text-xs text-[#94a3b8] cursor-pointer">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
          className="accent-[#4361EE]"
          data-testid="paper-list-archived-toggle"
        />
        Show archived
      </label>

      {/* Status row */}
      {loading && (
        <p className="text-xs text-[#94a3b8]" data-testid="paper-list-loading">
          Loading…
        </p>
      )}
      {error && (
        <p className="text-xs text-rose-300" data-testid="paper-list-error">
          {error}
        </p>
      )}

      {/* Results */}
      {papers.length === 0 && !loading ? (
        <p
          className="text-sm text-[#94a3b8] italic py-8 text-center"
          data-testid="paper-list-empty"
        >
          No papers match the current filters.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {papers.map((p) => (
            <PaperCard key={p.id} paper={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChipButton({
  active,
  onClick,
  label,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-2 py-1 rounded-full border transition ${
        active
          ? 'bg-[#4361EE]/20 border-[#4361EE]/60 text-white'
          : 'bg-[#0f1117] border-[#2a2d3e] text-[#94a3b8] hover:border-[#4361EE]/40'
      }`}
      data-testid={testId}
    >
      {label}
    </button>
  );
}

'use client';

/**
 * Research OS Phase 5 — protocol library list.
 *
 * Workshop-global protocols list. Filter chips (kind + tag), free-text
 * search across title. The list endpoint returns ROOT rows only (one
 * card per tree); per-row drill into /dashboard/os/research/protocols/:id
 * shows the full version history.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import { useEffect, useMemo, useState } from 'react';
import { Plus, X, FileText } from 'lucide-react';
import type { Protocol } from '@/lib/agentic-os/research/protocols';
import {
  PROTOCOL_KINDS,
  PROTOCOL_KIND_LABELS,
  type ProtocolKind,
} from '@/lib/agentic-os/research/protocol-kinds';
import {
  EntitySearch,
  EmptyState,
  SkeletonGroup,
  Skeleton,
} from '@/components/agentic-os/_shared/views';
import { ProtocolCard } from './protocol-card';
import { ProtocolForm } from './protocol-form';

interface Props {
  initialProtocols: Protocol[];
}

export function ProtocolList({ initialProtocols }: Props) {
  const [protocols, setProtocols] = useState<Protocol[]>(initialProtocols);
  const [kind, setKind] = useState<ProtocolKind | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const allTags = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of initialProtocols) {
      for (const t of p.tags) seen.set(t, (seen.get(t) ?? 0) + 1);
    }
    return Array.from(seen.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 30);
  }, [initialProtocols]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (kind) params.set('kind', kind);
    if (tag) params.set('tag', tag);
    if (q.trim()) params.set('q', q.trim());
    fetch(`/api/tiresias/agentic-os/research/protocols?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed (${r.status})`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setProtocols(Array.isArray(data.protocols) ? data.protocols : []);
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
  }, [kind, tag, q]);

  return (
    <div className="space-y-4" data-testid="protocol-list">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1" data-testid="protocol-list-search">
          <EntitySearch
            placeholder="Search title"
            defaultValue={q}
            debounceMs={200}
            onQueryChange={setQ}
          />
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((o) => !o)}
          className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-accent text-white hover:bg-accent/80 transition"
          data-testid="protocol-list-add"
        >
          <Plus className="w-3 h-3" />
          Add protocol
        </button>
      </div>

      <div className="flex flex-wrap gap-1" data-testid="protocol-list-kind-chips">
        <ChipButton active={kind === null} onClick={() => setKind(null)} label="All kinds" />
        {PROTOCOL_KINDS.map((k) => (
          <ChipButton
            key={k}
            active={kind === k}
            onClick={() => setKind(kind === k ? null : k)}
            label={PROTOCOL_KIND_LABELS[k]}
            testId={`protocol-list-kind-chip-${k}`}
          />
        ))}
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1" data-testid="protocol-list-tag-strip">
          {allTags.map(([t, count]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(tag === t ? null : t)}
              className={`text-[10px] px-1.5 py-0.5 rounded border transition ${
                tag === t
                  ? 'bg-accent/20 border-accent/60 text-white'
                  : 'bg-surface-0 border-border-subtle text-text-secondary hover:border-accent/40'
              }`}
              data-testid={`protocol-tag-chip-${t}`}
            >
              {t} <span className="text-[9px] opacity-60">({count})</span>
            </button>
          ))}
          {tag && (
            <button
              type="button"
              onClick={() => setTag(null)}
              className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border bg-danger/15 border-danger/40 text-danger hover:bg-danger/25"
              data-testid="protocol-tag-clear"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
      )}

      {formOpen && <ProtocolForm onClose={() => setFormOpen(false)} />}

      {loading && (
        <SkeletonGroup data-testid="protocol-list-loading">
          <Skeleton variant="list-row" />
          <Skeleton variant="list-row" />
          <Skeleton variant="list-row" />
        </SkeletonGroup>
      )}
      {error && (
        <p className="text-xs text-danger" data-testid="protocol-list-error">
          {error}
        </p>
      )}

      {protocols.length === 0 && !loading ? (
        <div data-testid="protocol-list-empty">
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title="No protocols yet"
            description="Workshop-global methods, SOPs, and analysis pipelines with version-history pinning. Pin a protocol to an experiment at a frozen version to keep it reproducible."
            primaryCta={{
              label: 'Add protocol',
              icon: <Plus className="h-4 w-4" />,
              onClick: () => setFormOpen(true),
            }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {protocols.map((p) => (
            <ProtocolCard key={p.id} protocol={p} />
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
          ? 'bg-accent/20 border-accent/60 text-white'
          : 'bg-surface-0 border-border-subtle text-text-secondary hover:border-accent/40'
      }`}
      data-testid={testId}
    >
      {label}
    </button>
  );
}

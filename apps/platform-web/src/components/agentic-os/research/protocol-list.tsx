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
import { Plus, Search, X } from 'lucide-react';
import type { Protocol } from '@/lib/agentic-os/research/protocols';
import {
  PROTOCOL_KINDS,
  PROTOCOL_KIND_LABELS,
  type ProtocolKind,
} from '@/lib/agentic-os/research/protocol-kinds';
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
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title"
            className="w-full pl-10 pr-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3e] text-sm text-white focus:border-[#4361EE]/60 outline-none"
            data-testid="protocol-list-search"
          />
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((o) => !o)}
          className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-[#4361EE] text-white hover:bg-[#4361EE]/80 transition"
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
                  ? 'bg-[#4361EE]/20 border-[#4361EE]/60 text-white'
                  : 'bg-[#0f1117] border-[#2a2d3e] text-[#94a3b8] hover:border-[#4361EE]/40'
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
              className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border bg-rose-500/15 border-rose-500/40 text-rose-300 hover:bg-rose-500/25"
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
        <p className="text-xs text-[#94a3b8]" data-testid="protocol-list-loading">
          Loading…
        </p>
      )}
      {error && (
        <p className="text-xs text-rose-300" data-testid="protocol-list-error">
          {error}
        </p>
      )}

      {protocols.length === 0 && !loading ? (
        <p
          className="text-sm text-[#94a3b8] italic py-8 text-center"
          data-testid="protocol-list-empty"
        >
          No protocols yet. Click <strong>Add protocol</strong> to record one.
        </p>
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
          ? 'bg-[#4361EE]/20 border-[#4361EE]/60 text-white'
          : 'bg-[#0f1117] border-[#2a2d3e] text-[#94a3b8] hover:border-[#4361EE]/40'
      }`}
      data-testid={testId}
    >
      {label}
    </button>
  );
}

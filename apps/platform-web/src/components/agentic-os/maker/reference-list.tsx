'use client';

/**
 * Maker OS — ReferenceList.
 *
 * Workshop-global reference library list view. Filterable by kind / tag,
 * with an inline compose form for adding new references.
 *
 * @license MIT — Tiresias Maker OS Phase 5 (internal).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  REFERENCE_KIND_VALUES,
  REFERENCE_KIND_LABELS,
  summarizeReferences,
  type Reference,
  type ReferenceKind,
} from '@/lib/agentic-os/maker/references';
import { ReferenceForm } from './reference-form';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

const API_BASE = '/api/tiresias/agentic-os/maker/references';

interface Props {
  initialReferences: Reference[];
}

export function ReferenceList({ initialReferences }: Props) {
  const [refs, setRefs] = useState<Reference[]>(initialReferences);
  const [kind, setKind] = useState<ReferenceKind | ''>('');
  const [tag, setTag] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (kind) params.set('kind', kind);
    if (tag.trim()) params.set('tag', tag.trim());
    const r = await fetch(`${API_BASE}?${params.toString()}`);
    if (r.ok) {
      const { references } = await r.json();
      setRefs(references ?? []);
    }
  }, [kind, tag]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = summarizeReferences(refs);

  async function handleDelete(id: string) {
    if (!confirm('Delete this reference? Linked projects will lose the reference.'))
      return;
    try {
      const r = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Delete failed (${r.status})`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats strip */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-[#94a3b8]">
        <span>
          <strong className="text-white">{stats.total}</strong> reference
          {stats.total === 1 ? '' : 's'}
        </span>
        {REFERENCE_KIND_VALUES.filter((k) => stats.byKind[k] > 0).map((k) => (
          <span key={k}>
            · {stats.byKind[k]} {REFERENCE_KIND_LABELS[k].toLowerCase()}
          </span>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <select
          value={kind}
          onChange={(e) => setKind((e.target.value || '') as ReferenceKind | '')}
          className={inputCls}
        >
          <option value="">All kinds</option>
          {REFERENCE_KIND_VALUES.map((k) => (
            <option key={k} value={k}>
              {REFERENCE_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Tag…"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          className={inputCls}
        />
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-md border border-[#4361EE] bg-[#4361EE]/10 px-3 py-2 text-sm text-white hover:bg-[#4361EE]/20 transition"
        >
          {showAdd ? 'Cancel' : '+ New reference'}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {showAdd && (
        <ReferenceForm
          onCreated={() => {
            setShowAdd(false);
            void load();
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* List */}
      {refs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#2a2d3e] bg-[#1a1d27]/50 p-8 text-center">
          <p className="text-sm text-[#94a3b8]">
            No references yet. Add your first one with the button above.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-[#2a2d3e] bg-[#0f1117]/50">
              <tr className="text-left text-xs uppercase tracking-wide text-[#94a3b8]">
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">Authors</th>
                <th className="px-4 py-3 font-medium">Published</th>
                <th className="px-4 py-3 font-medium">URL</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {refs.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-[#2a2d3e] last:border-b-0 hover:bg-[#0f1117]/30 transition"
                >
                  <td className="px-4 py-3 text-white font-medium">
                    {r.title}
                    {r.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.tags.map((t) => (
                          <span
                            key={t}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-[#0f1117] border border-[#2a2d3e] text-[#94a3b8]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#cbd5e1]">
                    {REFERENCE_KIND_LABELS[r.kind]}
                  </td>
                  <td className="px-4 py-3 text-[#cbd5e1]">{r.authors ?? '—'}</td>
                  <td className="px-4 py-3 text-[#cbd5e1]">{r.publishedAt ?? '—'}</td>
                  <td className="px-4 py-3">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#4361EE] hover:underline text-xs"
                    >
                      Open
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(r.id)}
                      className="text-xs text-[#94a3b8] hover:text-red-400 transition"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

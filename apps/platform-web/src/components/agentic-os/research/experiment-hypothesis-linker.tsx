'use client';

/**
 * Research OS Phase 3 — Experiment-side hypothesis linker.
 *
 * Renders a searchable picker over the workshop-global hypothesis
 * ledger plus a role selector. Submits to
 *   POST /experiments/:id/hypotheses
 * with `{ hypothesis_id, role, notes? }`. Returns 409 on duplicate
 * (same experiment + hypothesis + role); the picker surfaces that
 * inline.
 *
 * The "search" is in-memory over the candidate list passed in by the
 * server component — it's the user's workshop, scope is small enough
 * to filter client-side without a typeahead endpoint.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import { useState, useMemo } from 'react';
import { Plus, Search } from 'lucide-react';
import {
  LINK_ROLES,
  LINK_ROLE_LABELS,
  type LinkRole,
  type LinkedHypothesis,
  type ExperimentHypothesisLink,
} from '@/lib/agentic-os/research/experiment-hypotheses';
import type { Hypothesis } from '@/lib/agentic-os/research/hypotheses';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

interface Props {
  experimentId: string;
  candidates: Hypothesis[];
  onLinked: (link: LinkedHypothesis) => void;
  onCancel?: () => void;
}

export function ExperimentHypothesisLinker({
  experimentId,
  candidates,
  onLinked,
  onCancel,
}: Props) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Hypothesis | null>(null);
  const [role, setRole] = useState<LinkRole>('tests');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates.slice(0, 30);
    return candidates
      .filter((h) =>
        h.title.toLowerCase().includes(q) ||
        h.ifClause.toLowerCase().includes(q) ||
        h.thenClause.toLowerCase().includes(q) ||
        h.tags.some((t) => t.toLowerCase().includes(q)),
      )
      .slice(0, 30);
  }, [candidates, query]);

  async function submit() {
    if (!picked) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/research/experiments/${experimentId}/hypotheses`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            hypothesis_id: picked.id,
            role,
            notes: notes.trim() || null,
          }),
        },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? `Failed (${res.status})`);
        return;
      }
      const { link } = (await res.json()) as { link: ExperimentHypothesisLink };
      onLinked({ link, hypothesis: picked });
      setPicked(null);
      setQuery('');
      setNotes('');
      setRole('tests');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border-subtle bg-surface-0/60 p-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked(null);
          }}
          placeholder="Search workshop hypotheses by title, clause, or tag…"
          className={`${inputCls} pl-9`}
        />
      </div>

      {!picked ? (
        <div className="max-h-64 overflow-y-auto rounded-md border border-border-subtle bg-surface-0">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-text-secondary">No hypotheses match.</p>
          ) : (
            <ul role="listbox" className="divide-y divide-border-subtle">
              {filtered.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(h)}
                    className="w-full text-left px-3 py-2 hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
                  >
                    <div className="text-sm text-white">{h.title}</div>
                    <div className="text-xs text-text-secondary italic line-clamp-1">
                      If {h.ifClause}, then {h.thenClause}.
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-md border border-accent/40 bg-accent/10 p-3 text-sm text-white">
            {picked.title}
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="ml-2 text-xs text-text-secondary hover:text-white"
            >
              (change)
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1">Role</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as LinkRole)}
                className={inputCls}
              >
                {LINK_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {LINK_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1">
                Notes (optional)
              </span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>
        </>
      )}

      {error && (
        <p className="text-xs text-red-300" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={saving || !picked}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent hover:bg-[#3a56d4] disabled:opacity-50 px-3 py-1.5 text-sm text-white transition"
        >
          <Plus className="w-3.5 h-3.5" />
          {saving ? 'Linking…' : 'Link hypothesis'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border-subtle bg-surface-0 px-3 py-1.5 text-sm text-text-secondary hover:text-white transition"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

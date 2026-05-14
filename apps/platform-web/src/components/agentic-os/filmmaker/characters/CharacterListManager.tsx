'use client';

/**
 * Filmmaker OS — CharacterListManager.
 *
 * Client wrapper around the character grid: search box, role filter,
 * and "Add character" drawer. Loads the initial list from the server
 * and re-fetches on filter changes.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import {
  CHARACTER_ROLES,
  type Character,
  type CharacterRole,
  type CharacterUpsert,
} from '@/lib/agentic-os/filmmaker/characters';
import { CharacterCard } from './CharacterCard';
import { CharacterForm } from './CharacterForm';

interface Props {
  projectId: string;
  initialCharacters: Character[];
}

export function CharacterListManager({ projectId, initialCharacters }: Props) {
  const router = useRouter();
  const [characters, setCharacters] = useState<Character[]>(initialCharacters);
  const [q, setQ] = useState('');
  const [role, setRole] = useState<CharacterRole | 'all'>('all');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (role !== 'all') params.set('role', role);
    const qs = params.toString();
    fetch(
      `/api/tiresias/agentic-os/filmmaker/projects/${projectId}/characters${qs ? `?${qs}` : ''}`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.characters)) setCharacters(data.characters);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [q, role, projectId]);

  async function handleCreate(data: CharacterUpsert) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/filmmaker/projects/${projectId}/characters`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Create failed (${r.status})`);
      }
      const { character } = (await r.json()) as { character: Character };
      setCharacters((prev) => [...prev, character].sort((a, b) => a.name.localeCompare(b.name)));
      setAdding(false);
      startTransition(() => {
        router.push(
          `/dashboard/os/filmmaker/projects/${projectId}/characters/${character.id}`,
        );
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name…"
            className="w-full rounded-md border border-border-subtle bg-surface-0 pl-8 pr-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none"
          />
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as CharacterRole | 'all')}
          className="rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white"
        >
          <option value="all">All roles</option>
          {CHARACTER_ROLES.map((r) => (
            <option key={r.role} value={r.role}>
              {r.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-md border border-border-subtle bg-accent/80 hover:bg-accent text-white transition"
        >
          <Plus className="w-4 h-4" />
          Add character
        </button>
      </div>

      {characters.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-surface-2/40 p-10 text-center">
          <p className="text-sm text-white">No characters yet.</p>
          <p className="text-xs text-text-secondary mt-1">
            Add your first character to start building the cast.
          </p>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-4 inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-md border border-border-subtle bg-accent/80 hover:bg-accent text-white transition"
          >
            <Plus className="w-4 h-4" />
            Add character
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {characters.map((c) => (
            <CharacterCard key={c.id} character={c} projectId={projectId} />
          ))}
        </div>
      )}

      {adding && (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/60">
          <div className="h-full w-full max-w-xl overflow-y-auto border-l border-border-subtle bg-surface-0 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">New character</h3>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="text-sm text-text-secondary hover:text-white transition"
              >
                Close
              </button>
            </div>
            <CharacterForm
              submitLabel="Create character"
              busy={busy}
              error={error}
              onSubmit={handleCreate}
              onCancel={() => setAdding(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

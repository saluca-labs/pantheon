'use client';

/**
 * Autobiographer OS — ThemePicker.
 *
 * Multi-select theme attachment with a create-new affordance, mirroring
 * the Phase 2 MemoryPeoplePicker pattern. Used inline on memory edit and
 * chapter edit pages.
 *
 * Endpoints differ by entity: memories use
 * `/api/.../memories/[id]/themes` and chapters use
 * `/api/.../chapters/[id]/themes`. The component takes `entity` so it
 * can address the right one.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Tag, X } from 'lucide-react';
import { ThemeChip } from './theme-chip';
import { ThemeForm, type CreatedTheme } from './theme-form';

export interface PickerTheme {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}

export interface ThemePickerProps {
  /** Whose themes is this picker for? */
  entity: 'memory' | 'chapter';
  entityId: string;
  linked: PickerTheme[];
  available: PickerTheme[];
}

function endpointFor(entity: 'memory' | 'chapter', entityId: string) {
  if (entity === 'memory') {
    return `/api/tiresias/agentic-os/autobiographer/memories/${entityId}/themes`;
  }
  return `/api/tiresias/agentic-os/autobiographer/chapters/${entityId}/themes`;
}

export function ThemePicker({
  entity,
  entityId,
  linked,
  available,
}: ThemePickerProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkedIds = useMemo(() => new Set(linked.map((t) => t.id)), [linked]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return available
      .filter((t) => !linkedIds.has(t.id))
      .filter((t) => !q || t.name.toLowerCase().includes(q) || t.slug.includes(q))
      .slice(0, 25);
  }, [available, linkedIds, search]);

  async function attachTheme(themeId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpointFor(entity, entityId), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ themeId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `${res.status} ${res.statusText}`);
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to attach theme');
    } finally {
      setBusy(false);
    }
  }

  async function detachTheme(themeId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `${endpointFor(entity, entityId)}/${themeId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `${res.status} ${res.statusText}`);
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to detach theme');
    } finally {
      setBusy(false);
    }
  }

  async function onThemeCreated(t: CreatedTheme) {
    // Auto-link the freshly created theme to the current entity.
    await attachTheme(t.id);
  }

  return (
    <section className="rounded-xl border border-border-subtle bg-surface-2 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm uppercase tracking-wide text-text-secondary inline-flex items-center gap-1.5">
          <Tag className="w-4 h-4" />
          Themes
        </h2>
        <button
          type="button"
          onClick={() => setShowNewForm(true)}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-border-subtle bg-surface-0 text-text-primary hover:text-white transition"
        >
          <Plus className="w-3.5 h-3.5" />
          New theme
        </button>
      </div>

      {error && (
        <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2 mb-3">
          {error}
        </div>
      )}

      {linked.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {linked.map((t) => (
            <ThemeChip
              key={t.id}
              name={t.name}
              slug={t.slug}
              color={t.color}
              size="md"
              withIcon
              onRemove={() => detachTheme(t.id)}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-tertiary italic mb-4">
          No themes attached. Search below or create one.
        </p>
      )}

      <div className="space-y-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a theme to attach…"
          className="w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
        />
        {filtered.length > 0 && (
          <ul className="max-h-48 overflow-y-auto rounded border border-border-subtle bg-surface-0">
            {filtered.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => attachTheme(t.id)}
                  disabled={busy}
                  className="w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-2 hover:bg-surface-2 text-text-primary"
                >
                  <span className="truncate">{t.name}</span>
                  <ThemeChip name={t.name} color={t.color} size="sm" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {filtered.length === 0 && search.trim().length > 0 && (
          <button
            type="button"
            onClick={() => setShowNewForm(true)}
            className="text-xs px-3 py-1.5 rounded border border-dashed border-border-subtle bg-surface-0 text-text-secondary hover:text-white inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Create "{search.trim()}"
          </button>
        )}
      </div>

      <ThemeForm
        open={showNewForm}
        onClose={() => setShowNewForm(false)}
        onCreated={onThemeCreated}
        initialName={search.trim()}
      />
    </section>
  );
}

'use client';

/**
 * Autobiographer OS — ThemeForm.
 *
 * Inline modal-ish form for creating a theme (and editing in the future).
 * Used by the workshop themes section and the theme picker's "Create new"
 * affordance. Submits to `POST /api/.../themes` and on success calls
 * `onCreated` with the new theme so the picker can immediately attach it
 * to a memory or chapter.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  THEME_COLOR_TOKENS,
  type ThemeColorToken,
} from '@/lib/agentic-os/autobiographer/themes';

export interface CreatedTheme {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}

export interface ThemeFormProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (theme: CreatedTheme) => void;
  /** Pre-fill name (used by the picker's "search → create" flow). */
  initialName?: string;
}

export function ThemeForm({ open, onClose, onCreated, initialName }: ThemeFormProps) {
  const [name, setName] = useState(initialName ?? '');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<ThemeColorToken | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name: name.trim() };
      if (slug.trim()) body.slug = slug.trim();
      if (description.trim()) body.description = description.trim();
      if (color) body.color = color;
      const res = await fetch(
        '/api/tiresias/agentic-os/autobiographer/themes',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `${res.status} ${res.statusText}`);
      }
      const { theme } = await res.json();
      onCreated?.(theme);
      setName('');
      setSlug('');
      setDescription('');
      setColor('');
      onClose();
      if (typeof window !== 'undefined') window.location.reload();
    } catch (e: any) {
      setError(e.message ?? 'Failed to create theme');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm uppercase tracking-wide text-[#94a3b8]">
            New theme
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[#94a3b8] hover:text-white"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2 mb-3">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-[#94a3b8]">
              Name
            </span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="e.g. immigration, loss, music"
              className="mt-1 w-full bg-[#0f1117] border border-[#2a2d3e] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#4361EE]"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-[#94a3b8]">
              Slug (optional — derived from name)
            </span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              maxLength={120}
              pattern="[a-z0-9-]+"
              placeholder="kebab-case"
              className="mt-1 w-full bg-[#0f1117] border border-[#2a2d3e] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#4361EE]"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-[#94a3b8]">
              Description (optional)
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={4000}
              className="mt-1 w-full bg-[#0f1117] border border-[#2a2d3e] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#4361EE]"
            />
          </label>
          <div>
            <span className="text-[10px] uppercase tracking-wide text-[#94a3b8]">
              Color
            </span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              <button
                type="button"
                onClick={() => setColor('')}
                className={`text-[10px] px-2 py-0.5 rounded-full border ${color === '' ? 'border-white text-white' : 'border-[#2a2d3e] text-[#94a3b8]'}`}
              >
                neutral
              </button>
              {THEME_COLOR_TOKENS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${color === c ? 'border-white text-white' : 'border-[#2a2d3e] text-[#94a3b8]'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded border border-[#2a2d3e] text-[#94a3b8] hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || name.trim().length === 0}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-[#4361EE] text-white hover:bg-[#3a52d8] disabled:opacity-50 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

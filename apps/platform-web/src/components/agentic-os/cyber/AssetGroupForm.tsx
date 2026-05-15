'use client';

/**
 * CyberSec OS — Asset group editor + member picker.
 *
 * Combo create/edit form. When editing an existing group, a member picker
 * appears below the form: shows current members with remove buttons, and
 * a search field to add new assets.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Asset } from '@/lib/agentic-os/cyber/assets';
import type { AssetGroupDetail } from '@/lib/agentic-os/cyber/repo';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

const GROUPS_API = '/api/tiresias/agentic-os/cyber/asset-groups';
const ASSETS_API = '/api/tiresias/agentic-os/cyber/assets';

export interface AssetGroupFormProps {
  group?: AssetGroupDetail | null;
  /** All non-decommissioned assets for the owner, used by the picker. */
  candidates?: Asset[];
  onCancel?: () => void;
}

export function AssetGroupForm({ group, candidates = [], onCancel }: AssetGroupFormProps) {
  const router = useRouter();
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [tagsText, setTagsText] = useState((group?.tags ?? []).join(', '));
  const [members, setMembers] = useState<Asset[]>(group?.members ?? []);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!group;

  async function save() {
    setSaving(true);
    setError(null);
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    try {
      const url = isEdit ? `${GROUPS_API}/${group!.id}` : GROUPS_API;
      const r = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: description || null, tags }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      onCancel?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function addMember(asset: Asset) {
    if (!isEdit) return;
    const r = await fetch(`${GROUPS_API}/${group!.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId: asset.id }),
    });
    if (r.ok) {
      setMembers((prev) => (prev.find((m) => m.id === asset.id) ? prev : [...prev, asset]));
      router.refresh();
    }
  }

  async function removeMember(assetId: string) {
    if (!isEdit) return;
    const r = await fetch(`${GROUPS_API}/${group!.id}/members`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId }),
    });
    if (r.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== assetId));
      router.refresh();
    }
  }

  const memberIds = new Set(members.map((m) => m.id));
  const filtered = candidates.filter(
    (c) =>
      !memberIds.has(c.id) &&
      (search.trim() === '' ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.hostname?.toLowerCase().includes(search.toLowerCase()) ?? false)),
  ).slice(0, 25);

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-4 rounded-xl border border-border-subtle bg-surface-2 p-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block sm:col-span-2">
            <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="prod-public-facing"
              className={inputCls}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={inputCls}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Tags (comma-separated)</span>
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              className={inputCls}
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-3 py-1.5 text-sm transition"
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create group'}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-border-subtle text-text-secondary hover:text-white px-3 py-1.5 text-sm transition"
            >
              Cancel
            </button>
          )}
          {error && <span className="text-sm text-danger">{error}</span>}
        </div>
      </form>

      {isEdit && (
        <div className="rounded-xl border border-border-subtle bg-surface-2 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white">Members ({members.length})</h3>
          {members.length === 0 ? (
            <p className="text-sm text-text-secondary">No assets in this group yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-0 px-3 py-2"
                >
                  <span className="text-sm text-white truncate">
                    {m.name}{' '}
                    <span className="text-xs text-text-secondary">· {m.kind}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void removeMember(m.id)}
                    className="text-xs text-text-secondary hover:text-danger transition"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="pt-3 border-t border-border-subtle">
            <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Add member</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assets…"
              className={inputCls}
            />
            {filtered.length > 0 && (
              <ul className="mt-2 space-y-1.5 max-h-64 overflow-y-auto">
                {filtered.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-0 px-3 py-2"
                  >
                    <span className="text-sm text-white truncate">
                      {c.name}{' '}
                      <span className="text-xs text-text-secondary">· {c.kind}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void addMember(c)}
                      className="text-xs text-accent hover:text-accent/80 transition"
                    >
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

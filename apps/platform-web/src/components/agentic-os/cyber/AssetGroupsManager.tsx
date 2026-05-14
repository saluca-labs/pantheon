'use client';

/**
 * CyberSec OS — Asset groups list + create/edit (with member picker).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import type { Asset } from '@/lib/agentic-os/cyber/assets';
import type { AssetGroup, AssetGroupDetail } from '@/lib/agentic-os/cyber/repo';
import { AssetGroupForm } from './AssetGroupForm';

const API = '/api/tiresias/agentic-os/cyber/asset-groups';

export interface AssetGroupsManagerProps {
  initialGroups: AssetGroup[];
  assets: Asset[];
  ownerId: string;
}

export function AssetGroupsManager({
  initialGroups,
  assets,
}: AssetGroupsManagerProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AssetGroupDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function openEdit(group: AssetGroup) {
    setCreating(false);
    const r = await fetch(`${API}/${group.id}`);
    if (!r.ok) return;
    const { group: detail } = await r.json();
    setEditing(detail);
  }

  async function remove(group: AssetGroup) {
    if (!confirm(`Delete group "${group.name}"? Member assets are not deleted.`)) return;
    setBusy(group.id);
    try {
      const r = await fetch(`${API}/${group.id}`, { method: 'DELETE' });
      if (r.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-secondary">
          {initialGroups.length} {initialGroups.length === 1 ? 'group' : 'groups'}
        </p>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setCreating((c) => !c);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-[#3a56d4] text-white font-medium px-3 py-2 text-sm transition"
        >
          <Plus className="w-4 h-4" />
          {creating ? 'Close' : 'New group'}
        </button>
      </div>

      {creating && (
        <AssetGroupForm
          candidates={assets.filter((a) => !a.decommissionedAt)}
          onCancel={() => setCreating(false)}
        />
      )}
      {editing && (
        <AssetGroupForm
          group={editing}
          candidates={assets.filter((a) => !a.decommissionedAt)}
          onCancel={() => setEditing(null)}
        />
      )}

      {initialGroups.length === 0 ? (
        <p className="text-sm text-text-secondary p-6 rounded-xl border border-dashed border-border-subtle">
          No asset groups yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {initialGroups.map((g) => (
            <li
              key={g.id}
              className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-2 p-4"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{g.name}</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
                  {g.description && ` · ${g.description}`}
                </p>
                {g.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {g.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-border-subtle text-text-secondary"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void openEdit(g)}
                  className="inline-flex items-center gap-1 rounded border border-border-subtle text-text-primary hover:text-white px-2 py-1 text-xs transition"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void remove(g)}
                  disabled={busy === g.id}
                  className="inline-flex items-center gap-1 rounded border border-border-subtle text-red-300 hover:text-red-200 disabled:opacity-60 px-2 py-1 text-xs transition"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

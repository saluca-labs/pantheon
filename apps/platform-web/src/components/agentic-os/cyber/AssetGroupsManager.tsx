'use client';

/**
 * CyberSec OS — Asset groups list + create/edit (with member picker).
 *
 * Wave C-2a: in-list search + saved-view presets via `CyberListControls`
 * (composing the Wave B `EntitySearch` + `SavedViews` primitives); ad-hoc
 * empty state replaced with the `EmptyState` primitive. The row list is
 * kept ad-hoc — a compact edit/delete list, no selection model.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Boxes } from 'lucide-react';
import type { Asset } from '@/lib/agentic-os/cyber/assets';
import type { AssetGroup, AssetGroupDetail } from '@/lib/agentic-os/cyber/repo';
import { EmptyState } from '@/components/agentic-os/_shared/views';
import {
  CyberListControls,
  type CyberQuery,
} from '@/components/agentic-os/cyber/CyberListControls';
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
  const [search, setSearch] = useState('');

  function applyQuery(q: CyberQuery) {
    setSearch(q.search ?? '');
  }

  const filtered = initialGroups.filter((g) => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !g.name.toLowerCase().includes(q) &&
        !((g.description ?? '').toLowerCase().includes(q)) &&
        !g.tags.some((t) => t.toLowerCase().includes(q))
      ) {
        return false;
      }
    }
    return true;
  });

  const hasFilters = search.trim().length > 0;

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
      <CyberListControls
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Group name, description, tag…"
        filters={{}}
        onApplyQuery={applyQuery}
        savedViewKey="asset-groups"
        actions={
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setCreating((c) => !c);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent/90 text-white font-medium px-3 py-2 text-sm transition"
          >
            <Plus className="w-4 h-4" />
            {creating ? 'Close' : 'New group'}
          </button>
        }
      />

      <p className="text-xs text-text-secondary">
        {initialGroups.length} {initialGroups.length === 1 ? 'group' : 'groups'}
      </p>

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

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-6 w-6" />}
          title={
            hasFilters
              ? 'No asset groups match this search'
              : 'No asset groups yet'
          }
          description={
            hasFilters
              ? 'Try a broader search to see more groups.'
              : 'Bundle related assets into a group so future case management can scope actions to many at once.'
          }
          primaryCta={
            hasFilters
              ? undefined
              : {
                  label: 'New group',
                  icon: <Plus className="h-4 w-4" />,
                  onClick: () => {
                    setEditing(null);
                    setCreating(true);
                  },
                }
          }
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((g) => (
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
                  className="inline-flex items-center gap-1 rounded border border-border-subtle text-danger hover:text-danger/80 disabled:opacity-60 px-2 py-1 text-xs transition"
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

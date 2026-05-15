'use client';

/**
 * CyberSec OS — Asset detail action buttons.
 *
 * Edit (toggles inline AssetForm), decommission, delete. Client component
 * for the toggle / confirm dialogs.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, ArchiveX, Trash2 } from 'lucide-react';
import type { Asset } from '@/lib/agentic-os/cyber/assets';
import { AssetForm } from './AssetForm';

const API = '/api/tiresias/agentic-os/cyber/assets';

export function AssetDetailActions({ asset }: { asset: Asset }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decommission() {
    if (!confirm(`Decommission ${asset.name}? It will be hidden from default lists.`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API}/${asset.id}/decommission`, { method: 'POST' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decommission failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete ${asset.name}? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API}/${asset.id}`, { method: 'DELETE' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      router.push('/dashboard/os/cyber/assets');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle text-text-primary hover:text-white hover:border-accent/60 px-3 py-1.5 text-sm transition"
        >
          <Pencil className="w-4 h-4" />
          {editing ? 'Close' : 'Edit'}
        </button>
        {!asset.decommissionedAt && (
          <button
            type="button"
            onClick={decommission}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle text-warning hover:text-warning/80 hover:border-warning/60 disabled:opacity-60 px-3 py-1.5 text-sm transition"
          >
            <ArchiveX className="w-4 h-4" />
            Decommission
          </button>
        )}
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle text-danger hover:text-danger/80 hover:border-danger/60 disabled:opacity-60 px-3 py-1.5 text-sm transition"
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {editing && (
        <AssetForm
          asset={asset}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}

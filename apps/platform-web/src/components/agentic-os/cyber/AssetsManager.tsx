'use client';

/**
 * CyberSec OS — Assets list + filter + create-asset modal.
 *
 * Client component because filtering UI + "New asset" drawer toggle are
 * interactive. The initial data is fetched server-side and handed in.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { Asset, AssetCriticality, AssetKind } from '@/lib/agentic-os/cyber/assets';
import {
  ASSET_KINDS,
  ASSET_CRITICALITIES,
} from '@/lib/agentic-os/cyber/assets';
import { AssetCard } from './AssetCard';
import { AssetForm } from './AssetForm';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

export function AssetsManager({ initialAssets }: { initialAssets: Asset[] }) {
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<AssetKind | ''>('');
  const [criticality, setCriticality] = useState<AssetCriticality | ''>('');
  const [environment, setEnvironment] = useState('');
  const [search, setSearch] = useState('');
  const [showDecommissioned, setShowDecommissioned] = useState(false);

  const environments = useMemo(() => {
    const set = new Set<string>();
    for (const a of initialAssets) {
      if (a.environment) set.add(a.environment);
    }
    return Array.from(set).sort();
  }, [initialAssets]);

  const filtered = initialAssets.filter((a) => {
    if (!showDecommissioned && a.decommissionedAt) return false;
    if (kind && a.kind !== kind) return false;
    if (criticality && a.criticality !== criticality) return false;
    if (environment && a.environment !== environment) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !a.name.toLowerCase().includes(q) &&
        !(a.hostname?.toLowerCase().includes(q) ?? false) &&
        !(a.ownerEmail?.toLowerCase().includes(q) ?? false) &&
        !a.tags.some((t) => t.toLowerCase().includes(q))
      ) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border-subtle bg-surface-2 p-4">
        <label className="block min-w-[160px] flex-1">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, hostname, owner, tag…"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Kind</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as AssetKind | '')}
            className={inputCls}
          >
            <option value="">All</option>
            {ASSET_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Criticality</span>
          <select
            value={criticality}
            onChange={(e) => setCriticality(e.target.value as AssetCriticality | '')}
            className={inputCls}
          >
            <option value="">All</option>
            {ASSET_CRITICALITIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Environment</span>
          <select
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
            className={inputCls}
          >
            <option value="">All</option>
            {environments.map((env) => (
              <option key={env} value={env}>{env}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={showDecommissioned}
            onChange={(e) => setShowDecommissioned(e.target.checked)}
            className="accent-accent"
          />
          Show decommissioned
        </label>
        <button
          type="button"
          onClick={() => setCreating((c) => !c)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-[#3a56d4] text-white font-medium px-3 py-2 text-sm transition"
        >
          <Plus className="w-4 h-4" />
          {creating ? 'Close' : 'New asset'}
        </button>
      </div>

      {creating && (
        <AssetForm
          onSaved={() => setCreating(false)}
          onCancel={() => setCreating(false)}
        />
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-text-secondary p-6 rounded-xl border border-dashed border-border-subtle">
          No assets match the current filters.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((a) => (
            <AssetCard key={a.id} asset={a} />
          ))}
        </div>
      )}
    </div>
  );
}

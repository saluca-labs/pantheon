'use client';

/**
 * CyberSec OS — Assets list + filter + create-asset modal.
 *
 * Client component because filtering UI + "New asset" drawer toggle are
 * interactive. The initial data is fetched server-side and handed in.
 *
 * Wave C-2a: search + saved-view presets via `CyberListControls` (composing
 * the Wave B `EntitySearch` + `SavedViews` primitives); ad-hoc empty state
 * replaced with the `EmptyState` primitive.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useMemo, useState } from 'react';
import { Plus, Server } from 'lucide-react';
import type { Asset, AssetCriticality, AssetKind } from '@/lib/agentic-os/cyber/assets';
import {
  ASSET_KINDS,
  ASSET_CRITICALITIES,
} from '@/lib/agentic-os/cyber/assets';
import { EmptyState } from '@/components/agentic-os/_shared/views';
import {
  CyberListControls,
  type CyberQuery,
} from '@/components/agentic-os/cyber/CyberListControls';
import { AssetCard } from './AssetCard';
import { AssetForm } from './AssetForm';

const selectCls =
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

  function applyQuery(q: CyberQuery) {
    setSearch(q.search ?? '');
    setKind((q.kind ?? '') as AssetKind | '');
    setCriticality((q.criticality ?? '') as AssetCriticality | '');
    setEnvironment(q.environment ?? '');
    setShowDecommissioned(q.showDecommissioned === 'true');
  }

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

  const hasFilters =
    search.trim().length > 0 ||
    kind !== '' ||
    criticality !== '' ||
    environment !== '' ||
    showDecommissioned;

  return (
    <div className="space-y-4">
      <CyberListControls
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Name, hostname, owner, tag…"
        filters={{
          kind,
          criticality,
          environment,
          showDecommissioned: showDecommissioned ? 'true' : '',
        }}
        onApplyQuery={applyQuery}
        savedViewKey="assets"
        filterControls={
          <>
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
                Kind
              </span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as AssetKind | '')}
                className={selectCls}
              >
                <option value="">All</option>
                {ASSET_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
                Criticality
              </span>
              <select
                value={criticality}
                onChange={(e) =>
                  setCriticality(e.target.value as AssetCriticality | '')
                }
                className={selectCls}
              >
                <option value="">All</option>
                {ASSET_CRITICALITIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
                Environment
              </span>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                className={selectCls}
              >
                <option value="">All</option>
                {environments.map((env) => (
                  <option key={env} value={env}>
                    {env}
                  </option>
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
          </>
        }
        actions={
          <button
            type="button"
            onClick={() => setCreating((c) => !c)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent/90 text-white font-medium px-3 py-2 text-sm transition"
          >
            <Plus className="w-4 h-4" />
            {creating ? 'Close' : 'New asset'}
          </button>
        }
      />

      {creating && (
        <AssetForm
          onSaved={() => setCreating(false)}
          onCancel={() => setCreating(false)}
        />
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Server className="h-6 w-6" />}
          title={hasFilters ? 'No assets match these filters' : 'No assets yet'}
          description={
            hasFilters
              ? 'Try a broader search or clear a filter to see more assets.'
              : 'Add hosts, containers, accounts, and repos so alerts have something to link to.'
          }
          primaryCta={
            hasFilters
              ? undefined
              : {
                  label: 'New asset',
                  icon: <Plus className="h-4 w-4" />,
                  onClick: () => setCreating(true),
                }
          }
        />
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

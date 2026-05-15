/**
 * CyberSec OS — single-asset card.
 *
 * Server component — pure presentation. Used by the assets list grid.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { Server } from 'lucide-react';
import type { Asset, AssetCriticality } from '@/lib/agentic-os/cyber/assets';
import { ASSET_KINDS } from '@/lib/agentic-os/cyber/assets';

const CRIT_STYLE: Record<AssetCriticality, string> = {
  critical: 'text-danger bg-danger/20 border-danger/50',
  high:     'text-attention bg-attention/10 border-attention/30',
  medium:   'text-warning bg-warning/10 border-warning/30',
  low:      'text-text-secondary bg-text-secondary/10 border-text-secondary/30',
};

export function AssetCard({ asset }: { asset: Asset }) {
  const kindLabel =
    ASSET_KINDS.find((k) => k.value === asset.kind)?.label ?? asset.kind;
  const isDecommissioned = asset.decommissionedAt !== null;

  return (
    <Link
      href={`/dashboard/os/cyber/assets/${asset.id}`}
      className={`group rounded-xl border bg-surface-2 p-4 transition hover:border-accent/60 hover:bg-surface-3 ${
        isDecommissioned ? 'border-border-subtle/60 opacity-70' : 'border-border-subtle'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Server className="w-4 h-4 text-accent shrink-0" />
          <span className="text-sm font-medium text-white truncate">
            {asset.name}
          </span>
        </div>
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0 ${
            CRIT_STYLE[asset.criticality]
          }`}
        >
          {asset.criticality}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
        <span>{kindLabel}</span>
        {asset.environment && <span>· {asset.environment}</span>}
        {asset.hostname && (
          <span className="font-mono truncate">· {asset.hostname}</span>
        )}
      </div>
      {asset.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {asset.tags.slice(0, 4).map((t) => (
            <span
              key={t}
              className="text-[10px] px-1.5 py-0.5 rounded border border-border-subtle text-text-secondary"
            >
              {t}
            </span>
          ))}
          {asset.tags.length > 4 && (
            <span className="text-[10px] text-text-secondary">
              +{asset.tags.length - 4}
            </span>
          )}
        </div>
      )}
      {isDecommissioned && (
        <p className="text-[10px] text-text-secondary mt-2 italic">
          Decommissioned
        </p>
      )}
    </Link>
  );
}

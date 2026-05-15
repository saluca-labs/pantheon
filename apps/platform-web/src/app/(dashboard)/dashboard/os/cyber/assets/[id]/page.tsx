/**
 * CyberSec OS — Asset detail page.
 *
 * Header (name + kind icon + criticality + environment), metadata block,
 * and a `CrossEntityTabs` related-entity surface (alerts-on-this-asset as an
 * `ActivityFeed` + groups), edit/decommission/delete actions.
 *
 * Wave C-2a: the two stacked ad-hoc related-entity `<section>`s are replaced
 * by the `AssetDetailTabs` client island composing `CrossEntityTabs` +
 * `ActivityFeed`.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  getAsset,
  listAlertsForAsset,
  listAssetGroups,
} from '@/lib/agentic-os/cyber/repo';
import { ASSET_KINDS } from '@/lib/agentic-os/cyber/assets';
import { AssetDetailActions } from '@/components/agentic-os/cyber/AssetDetailActions';
import { AssetDetailTabs } from '@/components/agentic-os/cyber/AssetDetailTabs';

export const dynamic = 'force-dynamic';

const CRIT_STYLE: Record<string, string> = {
  critical: 'text-danger bg-danger/20 border-danger/50',
  high:     'text-attention bg-attention/10 border-attention/30',
  medium:   'text-warning bg-warning/10 border-warning/30',
  low:      'text-text-secondary bg-text-secondary/10 border-text-secondary/30',
};

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');

  const asset = await getAsset(id, user.userId);
  if (!asset) notFound();

  const [alertsOnAsset, groups] = await Promise.all([
    listAlertsForAsset(asset.id, user.userId, 30),
    listAssetGroups({ ownerId: user.userId }),
  ]);

  const kindLabel =
    ASSET_KINDS.find((k) => k.value === asset.kind)?.label ?? asset.kind;

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        href="/dashboard/os/cyber/assets"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to assets
      </Link>

      <header className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-semibold text-white truncate">{asset.name}</h1>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                  CRIT_STYLE[asset.criticality]
                }`}
              >
                {asset.criticality}
              </span>
            </div>
            <p className="text-sm text-text-secondary">
              {kindLabel}
              {asset.environment && ` · ${asset.environment}`}
              {asset.decommissionedAt && ' · Decommissioned'}
            </p>
          </div>
          <AssetDetailActions asset={asset} />
        </div>
      </header>

      <section className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <h2 className="text-base font-semibold text-white mb-3">Metadata</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Row label="Hostname" value={asset.hostname} />
          <Row label="IP address" value={asset.ipAddress} mono />
          <Row label="OS family" value={asset.osFamily} />
          <Row label="OS version" value={asset.osVersion} />
          <Row label="Technical owner" value={asset.ownerEmail} />
          <Row label="Environment" value={asset.environment} />
        </dl>
        {asset.tags.length > 0 && (
          <div className="mt-3">
            <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Tags</span>
            <div className="flex flex-wrap gap-1">
              {asset.tags.map((t) => (
                <span
                  key={t}
                  className="text-xs px-2 py-0.5 rounded border border-border-subtle text-text-primary"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <AssetDetailTabs alertsOnAsset={alertsOnAsset} groups={groups} />
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-text-secondary mb-0.5">{label}</dt>
      <dd className={`text-white ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</dd>
    </div>
  );
}

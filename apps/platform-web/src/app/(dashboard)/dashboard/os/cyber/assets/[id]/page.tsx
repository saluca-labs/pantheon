/**
 * CyberSec OS — Asset detail page.
 *
 * Header (name + kind icon + criticality + environment), metadata block,
 * alerts-on-this-asset panel, groups panel, edit/decommission/delete
 * actions.
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

export const dynamic = 'force-dynamic';

const CRIT_STYLE: Record<string, string> = {
  critical: 'text-red-200 bg-red-600/20 border-red-500/50',
  high:     'text-orange-300 bg-orange-500/10 border-orange-500/30',
  medium:   'text-amber-300 bg-amber-500/10 border-amber-500/30',
  low:      'text-slate-300 bg-slate-500/10 border-slate-500/30',
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'text-red-200 bg-red-600/20 border-red-500/50',
  high:     'text-orange-300 bg-orange-500/10 border-orange-500/30',
  medium:   'text-amber-300 bg-amber-500/10 border-amber-500/30',
  low:      'text-blue-300 bg-blue-500/10 border-blue-500/30',
  info:     'text-slate-300 bg-slate-500/10 border-slate-500/30',
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

      <section className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <h2 className="text-base font-semibold text-white mb-3">
          Alerts on this asset ({alertsOnAsset.length})
        </h2>
        {alertsOnAsset.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No alerts have been linked to this asset yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {alertsOnAsset.map((a) => (
              <li key={a.id} className="flex items-start gap-2">
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0 ${
                    SEVERITY_BADGE[a.severity] ?? ''
                  }`}
                >
                  {a.severity}
                </span>
                <span className="text-sm text-white">{a.title}</span>
                <span className="text-xs text-text-secondary ml-auto">
                  {new Date(a.occurredAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-white">Groups</h2>
          <Link
            href="/dashboard/os/cyber/asset-groups"
            className="text-xs text-text-secondary hover:text-white transition"
          >
            Manage groups →
          </Link>
        </div>
        {groups.length === 0 ? (
          <p className="text-sm text-text-secondary">No groups defined yet.</p>
        ) : (
          <p className="text-sm text-text-secondary">
            Add this asset to a group on the{' '}
            <Link
              href="/dashboard/os/cyber/asset-groups"
              className="text-accent hover:underline"
            >
              groups page
            </Link>
            .
          </p>
        )}
      </section>
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

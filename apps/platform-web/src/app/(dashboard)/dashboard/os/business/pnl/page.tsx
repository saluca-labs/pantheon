/**
 * Business OS Phase 5 — P&L page.
 *
 * @license MIT — Tiresias Business OS Phase 5 (internal).
 */

import { BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { listSnapshots } from '@/lib/agentic-os/business/pnl-snapshots-repo';
import { PERIOD_KINDS } from '@/lib/agentic-os/business/pnl-snapshots';
import PnlSummaryPanel from '@/components/agentic-os/business/pnl-summary-panel';
import PnlSnapshotList from '@/components/agentic-os/business/pnl-snapshot-list';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{
    period_kind?: string;
    locked?: string;
  }>;
}

export default async function PnlPage({ searchParams }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const activePeriodKind = (PERIOD_KINDS as readonly string[]).includes(sp.period_kind ?? '')
    ? sp.period_kind
    : 'all';
  const lockedOnly = sp.locked === '1';

  const [snapshots] = await Promise.all([
    listSnapshots(user.userId, {
      periodKind: activePeriodKind !== 'all' ? (activePeriodKind as any) : undefined,
      locked: lockedOnly || undefined,
      limit: 500,
    }),
  ]);

  const PERIOD_FILTERS = ['all', ...PERIOD_KINDS] as const;

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/business"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Business OS
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-teal-300" />
          <h1 className="text-2xl font-semibold text-white">P&L</h1>
        </div>
      </div>

      {/* Live P&L summary */}
      <div className="mb-8">
        <PnlSummaryPanel userId={user.userId} />
      </div>

      {/* Snapshots section */}
      <div className="mb-6">
        <h2 className="text-lg font-medium text-white mb-4">Snapshots</h2>

        {/* Filter chips */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
          {PERIOD_FILTERS.map((k) => (
            <Link
              key={k}
              href={k === 'all' ? '?' : `?period_kind=${k}`}
              className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                activePeriodKind === k
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border-subtle bg-surface-2 text-text-secondary hover:text-white hover:border-accent/50'
              }`}
            >
              {k === 'all' ? 'All' : k}
            </Link>
          ))}
          <Link
            href={lockedOnly ? '?' : '?locked=1'}
            className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              lockedOnly
                ? 'border-amber-600 bg-amber-600/10 text-amber-400'
                : 'border-border-subtle bg-surface-2 text-text-secondary hover:text-white hover:border-amber-600/50'
            }`}
          >
            Locked only
          </Link>
        </div>

        <PnlSnapshotList
          snapshots={snapshots}
          emptyMessage={
            snapshots.length === 0
              ? activePeriodKind !== 'all' || lockedOnly
                ? 'No snapshots match the selected filter.'
                : 'No P&L snapshots yet. Use the summary panel above to compute a snapshot.'
              : 'No snapshots match the selected filter.'
          }
        />
      </div>
    </div>
  );
}

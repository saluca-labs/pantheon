/**
 * Business OS Phase 5 — P&L snapshots list table.
 *
 * @license MIT — Tiresias Business OS Phase 5 (internal).
 */

'use client';

import { BarChart3 } from 'lucide-react';
import PnlSnapshotRow from './pnl-snapshot-row';
import type { PnlSnapshot } from '@/lib/agentic-os/business/pnl-snapshots';

interface Props {
  snapshots: PnlSnapshot[];
  emptyMessage?: string;
}

export default function PnlSnapshotList({
  snapshots,
  emptyMessage = 'No P&L snapshots yet.',
}: Props) {
  if (snapshots.length === 0) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface-2 p-12 text-center">
        <BarChart3 className="w-8 h-8 text-text-tertiary mx-auto mb-3" />
        <p className="text-text-secondary text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border-subtle bg-surface-0/50">
            <th className="py-3 px-4 text-left text-[10px] font-medium text-text-tertiary uppercase tracking-wider">
              Kind
            </th>
            <th className="py-3 px-4 text-left text-[10px] font-medium text-text-tertiary uppercase tracking-wider">
              Period
            </th>
            <th className="py-3 px-4 text-right text-[10px] font-medium text-text-tertiary uppercase tracking-wider">
              Revenue
            </th>
            <th className="py-3 px-4 text-right text-[10px] font-medium text-text-tertiary uppercase tracking-wider">
              Expenses
            </th>
            <th className="py-3 px-4 text-right text-[10px] font-medium text-text-tertiary uppercase tracking-wider">
              Margin
            </th>
            <th className="py-3 px-4 text-left text-[10px] font-medium text-text-tertiary uppercase tracking-wider">
              CCY
            </th>
            <th className="py-3 px-4 text-left text-[10px] font-medium text-text-tertiary uppercase tracking-wider">
              Created
            </th>
            <th className="py-3 px-4 text-left text-[10px] font-medium text-text-tertiary uppercase tracking-wider">
              Status
            </th>
            <th className="py-3 px-4 text-left text-[10px] font-medium text-text-tertiary uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((s) => (
            <PnlSnapshotRow key={s.id} snapshot={s} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Business OS Phase 5 — single P&L snapshot row.
 *
 * @license MIT — Tiresias Business OS Phase 5 (internal).
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Unlock, Trash2, FileText } from 'lucide-react';
import type { PnlSnapshot } from '@/lib/agentic-os/business/pnl-snapshots';

function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

interface Props {
  snapshot: PnlSnapshot;
}

export default function PnlSnapshotRow({ snapshot }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleToggleLock = useCallback(async () => {
    setLoading(true);
    try {
      await fetch(`/api/tiresias/agentic-os/business/pnl/snapshots/${snapshot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_locked: !snapshot.isLocked }),
      });
      router.refresh();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [snapshot.id, snapshot.isLocked, router]);

  const handleDelete = useCallback(async () => {
    if (!confirm('Delete this snapshot?')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tiresias/agentic-os/business/pnl/snapshots/${snapshot.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Delete failed');
        return;
      }
      router.refresh();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [snapshot.id, router]);

  const isPositive = snapshot.marginCents >= 0;

  return (
    <tr className="border-b border-[#2a2d3e] hover:bg-[#1a1d27]/50 transition-colors">
      <td className="py-3 px-4">
        <span className="inline-flex items-center rounded-md border border-teal-800 bg-teal-900/30 px-2 py-0.5 text-[10px] font-medium text-teal-300">
          {snapshot.periodKind}
        </span>
      </td>
      <td className="py-3 px-4 text-sm text-[#94a3b8]">
        {snapshot.periodStart} — {snapshot.periodEnd}
      </td>
      <td className="py-3 px-4 text-sm font-mono text-white text-right">
        {fmtCents(snapshot.revenueCents)}
      </td>
      <td className="py-3 px-4 text-sm font-mono text-white text-right">
        {fmtCents(snapshot.expenseCents)}
      </td>
      <td className={`py-3 px-4 text-sm font-mono font-bold text-right ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
        {fmtCents(snapshot.marginCents)}
      </td>
      <td className="py-3 px-4 text-xs text-[#64748b]">
        {snapshot.currency}
      </td>
      <td className="py-3 px-4 text-xs text-[#64748b]">
        {new Date(snapshot.createdAt).toLocaleDateString('en-US')}
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-1">
          {snapshot.isLocked ? (
            <span title="Locked"><Lock className="w-3.5 h-3.5 text-amber-400" /></span>
          ) : (
            <span title="Unlocked"><Unlock className="w-3.5 h-3.5 text-[#64748b]" /></span>
          )}
          {snapshot.notes && (
            <span title={snapshot.notes}><FileText className="w-3.5 h-3.5 text-[#64748b]" /></span>
          )}
        </div>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-1">
          <button
            onClick={handleToggleLock}
            disabled={loading}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-[#2a2d3e] text-[#64748b] hover:text-white transition-colors"
            title={snapshot.isLocked ? 'Unlock' : 'Lock'}
          >
            {snapshot.isLocked ? (
              <Unlock className="w-3.5 h-3.5" />
            ) : (
              <Lock className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={handleDelete}
            disabled={loading || snapshot.isLocked}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-red-900/30 text-[#64748b] hover:text-red-400 disabled:opacity-30 transition-colors"
            title="Delete snapshot"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

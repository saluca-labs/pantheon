/**
 * CyberSec OS — Top vulnerable assets table.
 *
 * Wave C-2a: ad-hoc empty `<p>` replaced with the `EmptyState` primitive.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { Server } from 'lucide-react';
import type { TrendsPayload } from '@/lib/agentic-os/cyber/repo';
import { EmptyState } from '@/components/agentic-os/_shared/views';

export function TopVulnerableAssetsTable({ rows }: { rows: TrendsPayload['topVulnerableAssets'] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Server className="h-6 w-6" />}
        title="No assets have open exposures yet"
        description="Once vulnerabilities are linked to assets, the most-exposed assets rank here."
        primaryCta={{
          label: 'Go to exposures',
          href: '/dashboard/os/cyber/exposures',
        }}
      />
    );
  }
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-0 text-[10px] uppercase tracking-wide text-text-secondary">
          <tr>
            <th className="text-left px-4 py-2">Asset</th>
            <th className="text-right px-4 py-2">Open exposures</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.assetId} className="border-t border-border-subtle">
              <td className="px-4 py-2 text-white">
                <Link
                  href={`/dashboard/os/cyber/assets/${r.assetId}`}
                  className="hover:text-accent"
                >
                  {r.assetName}
                </Link>
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-white">
                {r.openExposures}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

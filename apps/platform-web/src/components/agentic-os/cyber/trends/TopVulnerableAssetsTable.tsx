/**
 * CyberSec OS — Top vulnerable assets table.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import type { TrendsPayload } from '@/lib/agentic-os/cyber/repo';

export function TopVulnerableAssetsTable({ rows }: { rows: TrendsPayload['topVulnerableAssets'] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[#94a3b8] p-6 rounded-xl border border-dashed border-[#2a2d3e]">
        No assets have open exposures yet.
      </p>
    );
  }
  return (
    <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-[#0f1117] text-[10px] uppercase tracking-wide text-[#94a3b8]">
          <tr>
            <th className="text-left px-4 py-2">Asset</th>
            <th className="text-right px-4 py-2">Open exposures</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.assetId} className="border-t border-[#2a2d3e]">
              <td className="px-4 py-2 text-white">
                <Link
                  href={`/dashboard/os/cyber/assets/${r.assetId}`}
                  className="hover:text-[#4361EE]"
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

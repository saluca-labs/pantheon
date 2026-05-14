/**
 * CyberSec OS — Recent detection runs for a single rule.
 *
 * Server component. Shows triggered_at + alert link + payload preview as
 * a collapsed JSON block.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { Activity } from 'lucide-react';
import type { DetectionRun } from '@/lib/agentic-os/cyber/detections';

export function DetectionRunHistory({ runs }: { runs: DetectionRun[] }) {
  if (runs.length === 0) {
    return (
      <p className="text-sm text-text-secondary p-6 rounded-xl border border-dashed border-border-subtle">
        No detection runs recorded yet.
      </p>
    );
  }
  return (
    <ol className="space-y-2">
      {runs.map((run) => {
        const payloadPretty = JSON.stringify(run.payload, null, 2);
        const truncated =
          payloadPretty.length > 600
            ? payloadPretty.slice(0, 600).trimEnd() + '…'
            : payloadPretty;
        return (
          <li
            key={run.id}
            className="rounded-xl border border-border-subtle bg-surface-2 p-3"
          >
            <div className="flex items-center gap-2 text-xs text-text-secondary mb-1.5">
              <Activity className="w-3.5 h-3.5 text-accent" />
              <time dateTime={run.triggeredAt}>
                {new Date(run.triggeredAt).toLocaleString()}
              </time>
              {run.alertId && (
                <span className="ml-auto text-[10px] text-text-secondary/80">
                  alert: {run.alertId.slice(0, 8)}…
                </span>
              )}
            </div>
            {payloadPretty.length > 2 && (
              <pre className="text-[11px] text-text-primary bg-surface-0 border border-border-subtle rounded p-2 overflow-x-auto leading-snug font-mono">
                {truncated}
              </pre>
            )}
          </li>
        );
      })}
    </ol>
  );
}

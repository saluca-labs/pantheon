/**
 * CyberSec OS — Recent detection runs for a single rule.
 *
 * Server component. Shows triggered_at + alert link + payload preview as
 * a collapsed JSON block.
 *
 * Wave C-2a: the ad-hoc `<ol>` is replaced with the shared `ActivityFeed`
 * primitive — the per-run JSON payload preview is preserved via the
 * `renderItem` escape hatch (ActivityFeed has no declarative way to express
 * a code block), and the empty state uses the `EmptyState` primitive.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { Activity } from 'lucide-react';
import type { DetectionRun } from '@/lib/agentic-os/cyber/detections';
import {
  ActivityFeed,
  type ActivityEvent,
} from '@/components/agentic-os/_shared/views';

/** A detection run + its pre-rendered payload preview, for the feed. */
type RunEvent = ActivityEvent & { payloadPreview: string | null };

export function DetectionRunHistory({ runs }: { runs: DetectionRun[] }) {
  const events: RunEvent[] = runs.map((run) => {
    const payloadPretty = JSON.stringify(run.payload, null, 2);
    const truncated =
      payloadPretty.length > 600
        ? payloadPretty.slice(0, 600).trimEnd() + '…'
        : payloadPretty;
    return {
      id: run.id,
      occurredAt: run.triggeredAt,
      tone: 'accent',
      icon: <Activity className="h-4 w-4 text-accent" aria-hidden="true" />,
      actor: run.alertId ? `alert ${run.alertId.slice(0, 8)}…` : 'Run triggered',
      payloadPreview: payloadPretty.length > 2 ? truncated : null,
    };
  });

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 p-2">
      <ActivityFeed<RunEvent>
        events={events}
        grouping="day"
        emptyState={{
          icon: <Activity className="h-6 w-6" />,
          title: 'No detection runs recorded yet',
          description:
            'Runs appear here each time this rule fires against the alert pipeline.',
        }}
        renderItem={(run) => (
          <div className="min-w-0 flex-1">
            <p className="text-sm text-text-secondary">
              <span className="font-medium text-text-primary">{run.actor}</span>{' '}
              · {new Date(run.occurredAt).toLocaleString()}
            </p>
            {run.payloadPreview && (
              <pre className="mt-1.5 overflow-x-auto rounded border border-border-subtle bg-surface-0 p-2 text-[11px] font-mono leading-snug text-text-primary">
                {run.payloadPreview}
              </pre>
            )}
          </div>
        )}
      />
    </div>
  );
}

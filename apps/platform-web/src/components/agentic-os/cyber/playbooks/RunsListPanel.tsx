/**
 * CyberSec OS — Runs list panel.
 *
 * Server component. Active runs first, then recent terminal runs. Each row
 * links to /dashboard/os/cyber/playbooks/[playbookId]/run/[runId].
 *
 * Wave C-2a: ad-hoc empty `<p>` states replaced with the `EmptyState`
 * primitive.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { Play, CheckCircle2, XCircle, ListChecks } from 'lucide-react';
import type { PlaybookRun, PlaybookRunStatus } from '@/lib/agentic-os/cyber/playbooks';
import { EmptyState } from '@/components/agentic-os/_shared/views';

type RunWithPlaybook = PlaybookRun & { playbookName: string };

const STATUS_STYLE: Record<PlaybookRunStatus, { cls: string; Icon: typeof Play }> = {
  in_progress: { cls: 'text-amber-300 bg-amber-500/10 border-amber-500/30', Icon: Play },
  completed:   { cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30', Icon: CheckCircle2 },
  abandoned:   { cls: 'text-slate-400 bg-slate-500/10 border-slate-500/30', Icon: XCircle },
};

export function RunsListPanel({ runs }: { runs: RunWithPlaybook[] }) {
  const active = runs.filter((r) => r.status === 'in_progress');
  const terminal = runs.filter((r) => r.status !== 'in_progress');

  return (
    <div className="space-y-6">
      <Section
        title="Active runs"
        runs={active}
        emptyTitle="No active runs"
        emptyDescription="Start a playbook from the playbooks page to track its execution here."
      />
      <Section
        title="Recent runs"
        runs={terminal}
        emptyTitle="No completed runs yet"
        emptyDescription="Completed and abandoned playbook runs will be listed here."
      />
    </div>
  );
}

function Section({
  title,
  runs,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  runs: RunWithPlaybook[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <section>
      <h2 className="text-sm uppercase tracking-wide text-text-secondary mb-2">{title}</h2>
      {runs.length === 0 ? (
        <EmptyState
          variant="card"
          icon={<ListChecks className="h-6 w-6" />}
          title={emptyTitle}
          description={emptyDescription}
          primaryCta={{
            label: 'Browse playbooks',
            href: '/dashboard/os/cyber/playbooks',
          }}
        />
      ) : (
        <ul className="space-y-2">
          {runs.map((run) => {
            const { cls, Icon } = STATUS_STYLE[run.status];
            return (
              <li key={run.id}>
                <Link
                  href={`/dashboard/os/cyber/playbooks/${run.playbookId}/run/${run.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-2 p-3 transition hover:border-accent/60 hover:bg-surface-3"
                >
                  <Icon className="w-4 h-4 text-accent shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{run.playbookName}</p>
                    <p className="text-[11px] text-text-secondary">
                      started {new Date(run.startedAt).toLocaleString()}
                      {run.completedAt && ` · completed ${new Date(run.completedAt).toLocaleString()}`}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${cls}`}
                  >
                    {run.status.replace('_', ' ')}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

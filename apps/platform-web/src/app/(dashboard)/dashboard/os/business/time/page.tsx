import { Clock, Play, Square, DollarSign, Calendar } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { listTimeEntries, getRunningTimer } from '@/lib/agentic-os/business/time-entries-repo';
import { getTask } from '@/lib/agentic-os/business/tasks-repo';
import { getProject } from '@/lib/agentic-os/business/projects-repo';
import {
  computeDuration,
  computeBillableAmount,
} from '@/lib/agentic-os/business/time-entries';
import StopTimerButton from '@/components/agentic-os/business/stop-timer-button';

export const dynamic = 'force-dynamic';

function formatMinutes(minutes: number | null): string {
  if (minutes == null) return '--';
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

function formatCents(cents: number | null): string {
  if (cents == null) return '$0';
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function elapsedMinutes(startedAt: string): number {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  return Math.round((now - start) / 60000);
}

export default async function TimePage() {
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const [running, recentEntries, unbilledEntries] = await Promise.all([
    getRunningTimer(user.userId),
    listTimeEntries(user.userId, { limit: 20 }),
    listTimeEntries(user.userId, { unbilled: true, limit: 500 }),
  ]);

  // Resolve task and project names for running timer
  let runningTaskName: string | null = null;
  let runningProjectName: string | null = null;
  if (running) {
    const [task, project] = await Promise.all([
      getTask(running.taskId, user.userId),
      getProject(running.projectId, user.userId),
    ]);
    runningTaskName = task?.title ?? null;
    runningProjectName = project?.title ?? null;
  }

  // Resolve task/project names for recent entries (up to 20)
  const enrichedRecent = await Promise.all(
    recentEntries.map(async (entry) => {
      const [task, project] = await Promise.all([
        getTask(entry.taskId, user.userId),
        getProject(entry.projectId, user.userId),
      ]);
      return {
        ...entry,
        taskTitle: task?.title ?? 'Unknown task',
        projectTitle: project?.title ?? 'Unknown project',
      };
    })
  );

  // Unbilled summary grouped by project
  const unbilledByProject = new Map<
    string,
    { projectName: string; totalMinutes: number; totalCents: number }
  >();

  for (const entry of unbilledEntries) {
    const project = await getProject(entry.projectId, user.userId);
    const projectName = project?.title ?? 'Unknown';
    const duration = computeDuration(entry.startedAt, entry.endedAt, entry.durationMinutes) ?? 0;
    const amount = computeBillableAmount(duration, entry.billingRateCents) ?? 0;

    const existing = unbilledByProject.get(entry.projectId);
    if (existing) {
      existing.totalMinutes += duration;
      existing.totalCents += amount;
    } else {
      unbilledByProject.set(entry.projectId, {
        projectName,
        totalMinutes: duration,
        totalCents: amount,
      });
    }
  }

  const totalUnbilledMinutes = Array.from(unbilledByProject.values()).reduce(
    (sum, p) => sum + p.totalMinutes,
    0
  );
  const totalUnbilledCents = Array.from(unbilledByProject.values()).reduce(
    (sum, p) => sum + p.totalCents,
    0
  );

  return (
    <div className="max-w-5xl">
      {/* Back link */}
      <Link
        href="/dashboard/os/business"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Business OS
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Clock className="w-6 h-6 text-teal-300" />
        <h1 className="text-2xl font-semibold text-white">Time Tracking</h1>
      </div>

      {/* Running timer section */}
      <div className="mb-6 rounded-xl border border-border-subtle bg-surface-2 p-6">
        <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
          <Play className="w-4 h-4 text-teal-300" />
          Running Timer
        </h2>

        {running ? (
          <div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white text-sm font-medium mb-1">
                  {running.description || runningTaskName || 'No description'}
                </p>
                <p className="text-xs text-text-secondary">
                  {runningTaskName && (
                    <span className="mr-3">Task: {runningTaskName}</span>
                  )}
                  {runningProjectName && <span>Project: {runningProjectName}</span>}
                </p>
                {running.isBillable && running.billingRateCents != null && (
                  <p className="text-xs text-[#64748b] mt-1">
                    Rate: {formatCents(running.billingRateCents)}/hr
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-2xl font-mono text-teal-300 tabular-nums">
                  {formatMinutes(elapsedMinutes(running.startedAt))}
                </p>
                <p className="text-[10px] text-[#64748b] mt-1">elapsed</p>
                <StopTimerButton entryId={running.id} />
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-text-secondary text-sm mb-3">No timer running</p>
            <Link
              href="/dashboard/os/business/projects"
              className="inline-flex items-center gap-2 rounded-lg bg-accent hover:bg-[#3a56d4] text-white text-sm font-medium px-4 py-2 transition-colors"
            >
              <Play className="w-4 h-4" />
              Go to projects to start a timer
            </Link>
          </div>
        )}
      </div>

      {/* Unbilled summary */}
      <div className="mb-6 rounded-xl border border-border-subtle bg-surface-2 p-6">
        <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-teal-300" />
          Unbilled Summary
        </h2>

        {unbilledByProject.size > 0 ? (
          <div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="rounded-lg bg-surface-0 border border-border-subtle p-4">
                <p className="text-xs text-text-secondary mb-1">Total Unbilled Hours</p>
                <p className="text-xl font-mono text-white">{formatMinutes(totalUnbilledMinutes)}</p>
              </div>
              <div className="rounded-lg bg-surface-0 border border-border-subtle p-4">
                <p className="text-xs text-text-secondary mb-1">Total Unbilled Amount</p>
                <p className="text-xl font-mono text-teal-300">{formatCents(totalUnbilledCents)}</p>
              </div>
            </div>

            <div className="space-y-2">
              {Array.from(unbilledByProject.entries()).map(([projectId, data]) => (
                <Link
                  key={projectId}
                  href={`/dashboard/os/business/projects/${projectId}`}
                  className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-0 hover:border-accent/50 px-4 py-3 transition-colors"
                >
                  <span className="text-sm text-white">{data.projectName}</span>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-text-secondary">{formatMinutes(data.totalMinutes)}</span>
                    <span className="text-teal-300 font-mono">{formatCents(data.totalCents)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-text-secondary text-sm text-center py-4">
            No unbilled time entries.
          </p>
        )}
      </div>

      {/* Recent entries */}
      <div className="rounded-xl border border-border-subtle bg-surface-2 p-6">
        <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-teal-300" />
          Recent Entries
        </h2>

        {enrichedRecent.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border-subtle text-[#64748b]">
                  <th className="text-left py-2 font-medium">Description</th>
                  <th className="text-left py-2 font-medium">Task</th>
                  <th className="text-left py-2 font-medium">Project</th>
                  <th className="text-left py-2 font-medium">Date</th>
                  <th className="text-right py-2 font-medium">Duration</th>
                  <th className="text-right py-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {enrichedRecent.map((entry) => {
                  const duration = computeDuration(
                    entry.startedAt,
                    entry.endedAt,
                    entry.durationMinutes
                  );
                  const amount = computeBillableAmount(duration, entry.billingRateCents);
                  return (
                    <tr
                      key={entry.id}
                      className="border-b border-border-subtle/50 hover:bg-surface-0/50 transition-colors"
                    >
                      <td className="py-2.5 text-white">
                        {entry.description || '--'}
                      </td>
                      <td className="py-2.5 text-text-secondary">{entry.taskTitle}</td>
                      <td className="py-2.5 text-text-secondary">{entry.projectTitle}</td>
                      <td className="py-2.5 text-[#64748b]">
                        {new Date(entry.startedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="py-2.5 text-right text-white font-mono">
                        {formatMinutes(duration)}
                      </td>
                      <td className="py-2.5 text-right font-mono">
                        {entry.isBillable && amount != null ? (
                          <span className="text-teal-300">{formatCents(amount)}</span>
                        ) : (
                          <span className="text-[#64748b]">--</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-text-secondary text-sm text-center py-4">
            No time entries yet.
          </p>
        )}
      </div>
    </div>
  );
}

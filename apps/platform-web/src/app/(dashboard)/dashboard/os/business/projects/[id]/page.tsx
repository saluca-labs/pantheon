import { Briefcase, ListTodo, Clock, Settings, Plus, Play, FileText, Receipt } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { getProject, archiveProject } from '@/lib/agentic-os/business/projects-repo';
import { listTasks, getTask } from '@/lib/agentic-os/business/tasks-repo';
import { listTimeEntries, getRunningTimer } from '@/lib/agentic-os/business/time-entries-repo';
import { listDeals } from '@/lib/agentic-os/business/deals-repo';
import { listPeople } from '@/lib/agentic-os/business/people-repo';
import { listQuotes } from '@/lib/agentic-os/business/quotes-repo';
import { listInvoices } from '@/lib/agentic-os/business/invoices-repo';
import {
  computeDuration,
  computeBillableAmount,
} from '@/lib/agentic-os/business/time-entries';
import ProjectForm from '@/components/agentic-os/business/project-form';
import TaskForm from '@/components/agentic-os/business/task-form';
import TimeEntryForm from '@/components/agentic-os/business/time-entry-form';
import StopTimerButton from '@/components/agentic-os/business/stop-timer-button';
import ArchiveProjectButton from '@/components/agentic-os/business/archive-project-button';
import type { Task, TaskStatus } from '@/lib/agentic-os/business/tasks';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; new_task?: string; log_time?: string; edit?: string }>;
}

const TABS = ['overview', 'tasks', 'time', 'quotes', 'invoices', 'settings'] as const;
type Tab = (typeof TABS)[number];

const quoteStatusColors: Record<string, string> = {
  draft: 'bg-slate-900/40 text-slate-300 border-slate-800',
  sent: 'bg-blue-900/40 text-blue-300 border-blue-800',
  accepted: 'bg-emerald-900/40 text-emerald-300 border-emerald-800',
  rejected: 'bg-red-900/40 text-red-300 border-red-800',
  expired: 'bg-amber-900/40 text-amber-300 border-amber-800',
  converted: 'bg-violet-900/40 text-violet-300 border-violet-800',
};

const invoiceStatusColors: Record<string, string> = {
  draft: 'bg-slate-900/40 text-slate-300 border-slate-800',
  sent: 'bg-blue-900/40 text-blue-300 border-blue-800',
  partial: 'bg-amber-900/40 text-amber-300 border-amber-800',
  paid: 'bg-emerald-900/40 text-emerald-300 border-emerald-800',
  overdue: 'bg-red-900/40 text-red-300 border-red-800',
  voided: 'bg-slate-900/40 text-slate-500 border-slate-800',
};

function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const statusOrder: TaskStatus[] = ['in_progress', 'blocked', 'todo', 'done', 'cancelled'];

const statusColors: Record<string, string> = {
  todo: 'bg-slate-900/40 text-slate-300 border-slate-800',
  in_progress: 'bg-blue-900/40 text-blue-300 border-blue-800',
  blocked: 'bg-red-900/40 text-red-300 border-red-800',
  done: 'bg-emerald-900/40 text-emerald-300 border-emerald-800',
  cancelled: 'bg-slate-900/40 text-slate-500 border-slate-800 line-through',
};

const priorityColors: Record<string, string> = {
  low: 'text-[#64748b]',
  medium: 'text-[#94a3b8]',
  high: 'text-amber-400',
  urgent: 'text-red-400',
};

function formatCents(cents: number | null): string {
  if (cents == null) return 'N/A';
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMinutes(minutes: number | null): string {
  if (minutes == null) return '--';
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

export default async function ProjectDetailPage({ params, searchParams }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const sp = await searchParams;
  const activeTab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : 'overview';
  const showNewTask = sp.new_task === '1';
  const showLogTime = sp.log_time === '1';
  const showEdit = sp.edit === '1';

  const project = await getProject(id, user.userId);
  if (!project) {
    return (
      <div className="max-w-5xl">
        <Link
          href="/dashboard/os/business/projects"
          className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Projects
        </Link>
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-12 text-center">
          <p className="text-[#94a3b8] text-sm">Project not found.</p>
        </div>
      </div>
    );
  }

  // Fetch related data
  const [tasks, timeEntries, running, deals, people, quotes, invoices] = await Promise.all([
    listTasks(user.userId, { projectId: id, limit: 500 }),
    listTimeEntries(user.userId, { projectId: id, limit: 500 }),
    getRunningTimer(user.userId),
    listDeals(user.userId, { limit: 500 }),
    listPeople(user.userId, { archived: false, limit: 500 }),
    listQuotes(user.userId, { projectId: id, limit: 500 }),
    listInvoices(user.userId, { projectId: id, limit: 500 }),
  ]);

  const contacts = people.map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName }));
  const dealsList = deals.map((d) => ({ id: d.id, title: d.title }));

  // Tasks grouped by status
  const tasksByStatus = new Map<TaskStatus, Task[]>();
  for (const s of statusOrder) {
    tasksByStatus.set(s, []);
  }
  for (const t of tasks) {
    const list = tasksByStatus.get(t.status);
    if (list) list.push(t);
  }

  // Time entry enrichments (task names for the time tab)
  const taskNames = new Map<string, string>();
  for (const t of tasks) {
    taskNames.set(t.id, t.title);
  }
  // For entries with task IDs not in our tasks list, fetch individually (up to a limit)
  const missingTaskIds = new Set<string>();
  for (const e of timeEntries) {
    if (!taskNames.has(e.taskId)) missingTaskIds.add(e.taskId);
  }
  for (const taskId of missingTaskIds) {
    const t = await getTask(taskId, user.userId);
    if (t) taskNames.set(taskId, t.title);
  }

  // Deal and contact names for overview
  const deal = project.dealId ? deals.find((d) => d.id === project.dealId) : null;
  const contact = project.contactId ? people.find((p) => p.id === project.contactId) : null;

  // Running timer for this project
  const isTimerRunning = running && running.projectId === id;

  const billingModelLabel =
    project.billingModel.charAt(0).toUpperCase() + project.billingModel.slice(1);

  return (
    <div className="max-w-5xl">
      {/* Back link */}
      <Link
        href="/dashboard/os/business/projects"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Projects
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <Briefcase className="w-6 h-6 text-teal-300" />
            <h1 className="text-2xl font-semibold text-white">{project.title}</h1>
          </div>
          <p className="text-xs text-[#64748b] font-mono mt-1">{project.slug}</p>
        </div>
        <span
          className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium ${
            statusColors[project.status] ?? statusColors.active
          }`}
        >
          {project.status.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </span>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 mb-6 border-b border-[#2a2d3e]">
        {TABS.map((tab) => {
          const icons: Record<Tab, React.ReactNode> = {
            overview: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
            tasks: <ListTodo className="w-3.5 h-3.5" />,
            time: <Clock className="w-3.5 h-3.5" />,
            quotes: <FileText className="w-3.5 h-3.5" />,
            invoices: <Receipt className="w-3.5 h-3.5" />,
            settings: <Settings className="w-3.5 h-3.5" />,
          };
          return (
            <Link
              key={tab}
              href={`?tab=${tab}`}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-[#4361EE] text-white'
                  : 'border-transparent text-[#94a3b8] hover:text-white hover:border-[#2a2d3e]'
              }`}
            >
              {icons[tab]}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Link>
          );
        })}
      </div>

      {/* ─── OVERVIEW TAB ──────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Meta cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
              <p className="text-xs text-[#64748b] mb-1">Billing Model</p>
              <p className="text-sm text-white font-medium">{billingModelLabel}</p>
              {project.defaultRateCents != null && (
                <p className="text-xs text-teal-300 mt-1">
                  {formatCents(project.defaultRateCents)}/hr default rate
                </p>
              )}
            </div>
            <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
              <p className="text-xs text-[#64748b] mb-1">Budget</p>
              <p className="text-sm text-white font-medium">
                {project.budgetCents != null ? formatCents(project.budgetCents) : 'No budget set'}
              </p>
            </div>
            <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
              <p className="text-xs text-[#64748b] mb-1">Dates</p>
              <div className="space-y-1">
                {project.startDate && (
                  <p className="text-xs text-[#94a3b8]">Start: {project.startDate}</p>
                )}
                {project.targetCompletionDate && (
                  <p className="text-xs text-[#94a3b8]">
                    Target: {project.targetCompletionDate}
                  </p>
                )}
                {!project.startDate && !project.targetCompletionDate && (
                  <p className="text-xs text-[#94a3b8]">No dates set</p>
                )}
              </div>
            </div>
          </div>

          {/* Linked contact and deal */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
              <p className="text-xs text-[#64748b] mb-1">Contact</p>
              {contact ? (
                <div>
                  <p className="text-sm text-white font-medium">
                    {contact.firstName} {contact.lastName}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-[#94a3b8]">No contact linked</p>
              )}
            </div>
            <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
              <p className="text-xs text-[#64748b] mb-1">Deal</p>
              {deal ? (
                <Link
                  href={`/dashboard/os/business/deals/${deal.id}`}
                  className="text-sm text-teal-300 hover:underline font-medium"
                >
                  {deal.title}
                </Link>
              ) : (
                <p className="text-sm text-[#94a3b8]">No deal linked</p>
              )}
            </div>
          </div>

          {/* Description */}
          {project.descriptionMd && (
            <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
              <p className="text-xs text-[#64748b] mb-2">Description</p>
              <div className="text-sm text-[#94a3b8] whitespace-pre-wrap leading-relaxed">
                {project.descriptionMd}
              </div>
            </div>
          )}

          {/* Tags */}
          {project.tags.length > 0 && (
            <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
              <p className="text-xs text-[#64748b] mb-2">Tags</p>
              <div className="flex flex-wrap gap-2">
                {project.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-md bg-[#0f1117] border border-[#2a2d3e] px-2.5 py-1 text-[10px] text-[#94a3b8]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Edit button */}
          <div>
            <Link
              href="?edit=1&tab=settings"
              className="inline-flex items-center gap-2 rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] text-white text-sm font-medium px-4 py-2 transition-colors"
            >
              <Settings className="w-4 h-4" />
              Edit project
            </Link>
          </div>
        </div>
      )}

      {/* ─── TASKS TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'tasks' && (
        <div className="space-y-6">
          {/* Header actions */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#94a3b8]">
              {tasks.length} task{tasks.length !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-2">
              <Link
                href="?tab=tasks&new_task=1"
                className="inline-flex items-center gap-2 rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] text-white text-sm font-medium px-4 py-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add task
              </Link>
            </div>
          </div>

          {/* New task form */}
          {showNewTask && (
            <TaskForm
              projectId={id}
              onCreated={() => {}}
            />
          )}

          {/* Task groups by status */}
          {tasks.length > 0 ? (
            statusOrder.map((status) => {
              const statusTasks = tasksByStatus.get(status) ?? [];
              if (statusTasks.length === 0) return null;
              return (
                <div key={status} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748b]">
                      {status.replace('_', ' ')}
                    </h3>
                    <span className="text-[10px] text-[#64748b]">
                      ({statusTasks.length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {statusTasks.map((task) => (
                      <div
                        key={task.id}
                        className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] hover:border-[#4361EE]/30 px-4 py-3 transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className={`text-sm font-medium text-white ${
                              task.status === 'cancelled' ? 'line-through' : ''
                            }`}>
                              {task.title}
                            </p>
                            {task.descriptionMd && (
                              <p className="text-xs text-[#64748b] mt-1 line-clamp-2">
                                {task.descriptionMd}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-2">
                              <span
                                className={`text-[10px] font-medium ${
                                  priorityColors[task.priority]
                                }`}
                              >
                                {task.priority.charAt(0).toUpperCase() +
                                  task.priority.slice(1)}
                              </span>
                              {task.assigneeText && (
                                <span className="text-[10px] text-[#64748b]">
                                  {task.assigneeText}
                                </span>
                              )}
                              {task.dueOn && (
                                <span className="text-[10px] text-[#64748b]">
                                  Due: {task.dueOn}
                                </span>
                              )}
                              {task.isBillable && (
                                <span className="text-[10px] text-teal-600">Billable</span>
                              )}
                            </div>
                          </div>
                          {/* Quick status toggle — client component would go here */}
                          <span
                            className={`shrink-0 inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${
                              statusColors[task.status]
                            }`}
                          >
                            {task.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-12 text-center">
              <ListTodo className="w-8 h-8 text-[#64748b] mx-auto mb-3" />
              <p className="text-[#94a3b8] text-sm">
                No tasks yet. Add your first task to start tracking work.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ─── TIME TAB ──────────────────────────────────────────────────── */}
      {activeTab === 'time' && (
        <div className="space-y-6">
          {/* Header actions */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#94a3b8]">
              {timeEntries.length} time entr{timeEntries.length !== 1 ? 'ies' : 'y'}
            </p>
            <div className="flex items-center gap-2">
              <Link
                href="?tab=time&log_time=1"
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium px-4 py-2 transition-colors"
              >
                <Clock className="w-4 h-4" />
                Log time
              </Link>
            </div>
          </div>

          {/* Running timer alert */}
          {isTimerRunning && running && (
            <div className="rounded-xl border border-teal-800 bg-teal-900/20 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Play className="w-4 h-4 text-teal-300" />
                <div>
                  <p className="text-sm text-white font-medium">
                    Timer running: {running.description || taskNames.get(running.taskId) || 'No description'}
                  </p>
                  <p className="text-xs text-[#94a3b8] mt-0.5">
                    Task: {taskNames.get(running.taskId) ?? 'Unknown'}
                  </p>
                </div>
              </div>
              <StopTimerButton entryId={running.id} />
            </div>
          )}

          {/* Log time form */}
          {showLogTime && (
            <TimeEntryForm
              projectId={id}
              tasks={tasks.filter((t) => t.status !== 'cancelled')}
            />
          )}

          {/* Time entries list */}
          {timeEntries.length > 0 ? (
            <div className="space-y-2">
              {timeEntries.map((entry) => {
                const duration = computeDuration(
                  entry.startedAt,
                  entry.endedAt,
                  entry.durationMinutes
                );
                const amount = computeBillableAmount(duration, entry.billingRateCents);

                return (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] px-4 py-3 flex items-center justify-between hover:border-[#4361EE]/30 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-white">
                        {entry.description || 'No description'}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-[#64748b]">
                          {taskNames.get(entry.taskId) ?? 'Unknown task'}
                        </span>
                        <span className="text-[10px] text-[#64748b]">
                          {new Date(entry.startedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {entry.endedAt && (
                          <span className="text-[10px] text-[#64748b]">
                            to{' '}
                            {new Date(entry.endedAt).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 ml-4 shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-mono text-white">
                          {formatMinutes(duration)}
                        </p>
                        {entry.isBillable && amount != null && (
                          <p className="text-[10px] font-mono text-teal-300">
                            {formatCents(amount)}
                          </p>
                        )}
                      </div>
                      {/* Billed/pending indicator */}
                      {entry.isBillable && (
                        <span
                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-medium ${
                            entry.billedAt
                              ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-800'
                              : 'bg-amber-900/40 text-amber-400 border border-amber-800'
                          }`}
                        >
                          {entry.billedAt ? 'Billed' : 'Pending'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-12 text-center">
              <Clock className="w-8 h-8 text-[#64748b] mx-auto mb-3" />
              <p className="text-[#94a3b8] text-sm">
                No time entries yet. Start tracking time for this project.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ─── QUOTES TAB ────────────────────────────────────────────────── */}
      {activeTab === 'quotes' && (
        <div className="space-y-3">
          <p className="text-sm text-[#94a3b8]">
            {quotes.length} quote{quotes.length !== 1 ? 's' : ''} linked to this project
          </p>
          {quotes.length > 0 ? (
            quotes.map((q) => (
              <Link
                key={q.id}
                href={`/dashboard/os/business/quotes/${q.id}`}
                className="block rounded-lg border border-[#2a2d3e] bg-[#0f1117] hover:border-[#4361EE]/30 px-4 py-3 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">{q.title}</p>
                    <p className="text-[10px] text-[#64748b] font-mono">{q.quoteNumber}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${quoteStatusColors[q.status] ?? quoteStatusColors.draft}`}>
                      {q.status}
                    </span>
                    <span className="text-sm font-mono text-white">{fmtCents(q.totalCents)}</span>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <p className="text-sm text-[#64748b] py-4">No quotes linked to this project yet.</p>
          )}
        </div>
      )}

      {/* ─── INVOICES TAB ──────────────────────────────────────────────── */}
      {activeTab === 'invoices' && (
        <div className="space-y-3">
          <p className="text-sm text-[#94a3b8]">
            {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} linked to this project
          </p>
          {invoices.length > 0 ? (
            invoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/dashboard/os/business/invoices/${inv.id}`}
                className="block rounded-lg border border-[#2a2d3e] bg-[#0f1117] hover:border-[#4361EE]/30 px-4 py-3 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">{inv.title}</p>
                    <p className="text-[10px] text-[#64748b] font-mono">{inv.invoiceNumber}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${invoiceStatusColors[inv.status] ?? invoiceStatusColors.draft}`}>
                      {inv.status}
                    </span>
                    <span className="text-sm font-mono text-white">{fmtCents(inv.totalCents)}</span>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <p className="text-sm text-[#64748b] py-4">No invoices linked to this project yet.</p>
          )}
        </div>
      )}

      {/* ─── SETTINGS TAB ──────────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          {showEdit ? (
            <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6">
              <h2 className="text-lg font-medium text-white mb-4">Edit Project</h2>
              <ProjectForm
                contacts={contacts}
                deals={dealsList}
                initial={project}
                onCreated={() => {}}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <Link
                href="?tab=settings&edit=1"
                className="inline-flex items-center gap-2 rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] text-white text-sm font-medium px-4 py-2 transition-colors"
              >
                <Settings className="w-4 h-4" />
                Edit project
              </Link>
            </div>
          )}

          {/* Archive section */}
          <div className="rounded-xl border border-red-900/50 bg-[#1a1d27] p-5 mt-6 pt-6 border-t border-red-900/30">
            <h3 className="text-sm font-semibold text-red-400 mb-2">Danger Zone</h3>
            <p className="text-xs text-[#94a3b8] mb-4">
              Archiving this project will hide it from default views. You can restore it later.
            </p>
            <ArchiveProjectButton projectId={id} />
          </div>
        </div>
      )}
    </div>
  );
}

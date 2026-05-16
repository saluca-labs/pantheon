import { Briefcase, Plus } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { listProjects } from '@/lib/agentic-os/business/projects-repo';
import { listDeals } from '@/lib/agentic-os/business/deals-repo';
import { listPeople } from '@/lib/agentic-os/business/people-repo';
import ProjectForm from '@/components/agentic-os/business/project-form';
import ProjectCard from '@/components/agentic-os/business/project-card';
import type { ProjectStatus, BillingModel } from '@/lib/agentic-os/business/projects';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ new?: string; status?: string; billing_model?: string; q?: string }>;
}

const ALL_STATUSES: ProjectStatus[] = ['proposed', 'active', 'on_hold', 'completed', 'cancelled'];
const BILLING_MODELS: BillingModel[] = ['hourly', 'fixed', 'retainer', 'milestone', 'free'];

export default async function ProjectsPage({ searchParams }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const showNew = sp.new === '1';
  const filterStatus = sp.status
    ? sp.status.split(',').filter((s) =>
        ALL_STATUSES.includes(s as ProjectStatus)
      ) as ProjectStatus[]
    : undefined;
  const filterBillingModel = BILLING_MODELS.includes(sp.billing_model as BillingModel)
    ? (sp.billing_model as BillingModel)
    : undefined;

  const [projects, deals, people] = await Promise.all([
    listProjects(user.userId, {
      archived: false,
      status: filterStatus,
      billingModel: filterBillingModel,
      q: sp.q,
      limit: 500,
    }),
    listDeals(user.userId, { limit: 500 }),
    listPeople(user.userId, { archived: false, limit: 500 }),
  ]);

  const contacts = people.map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName }));
  const dealsList = deals.map((d) => ({ id: d.id, title: d.title }));

  // Build a deal lookup map for project cards
  const dealMap = new Map(deals.map((d) => [d.id, d]));

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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Briefcase className="w-6 h-6 text-os-business" />
          <h1 className="text-2xl font-semibold text-white">Projects</h1>
        </div>
        <Link
          href="?new=1"
          className="inline-flex items-center gap-2 rounded-lg bg-accent hover:bg-accent/90 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New project
        </Link>
      </div>

      {/* New project form */}
      {showNew && (
        <div className="mb-6 rounded-xl border border-border-subtle bg-surface-2 p-6">
          <h2 className="text-lg font-medium text-white mb-4">New Project</h2>
          <ProjectForm contacts={contacts} deals={dealsList} />
        </div>
      )}

      {/* Filter bar */}
      <div className="mb-6 space-y-3">
        {/* Status chips */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="?"
            className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              !sp.status
                ? 'bg-accent border-accent text-white'
                : 'border-border-subtle text-text-secondary hover:text-white hover:border-accent/50'
            }`}
          >
            All
          </Link>
          {ALL_STATUSES.map((s) => {
            const isActive = sp.status === s;
            const href = isActive ? '?' : `?status=${s}`;
            return (
              <Link
                key={s}
                href={href}
                className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  isActive
                    ? 'bg-accent border-accent text-white'
                    : 'border-border-subtle text-text-secondary hover:text-white hover:border-accent/50'
                }`}
              >
                {s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </Link>
            );
          })}
        </div>

        {/* Billing model dropdown + search */}
        <div className="flex items-center gap-3">
          <form className="flex items-center gap-2" method="GET">
            {sp.status && <input type="hidden" name="status" value={sp.status} />}
            <select
              name="billing_model"
              className="rounded-md border border-border-subtle bg-surface-0 px-3 py-1.5 text-xs text-white focus:border-accent focus:outline-none"
              defaultValue={sp.billing_model ?? ''}
              onChange={(e) => {
                const form = e.target.form;
                if (form) form.submit();
              }}
            >
              <option value="" className="bg-surface-2 text-white">All billing models</option>
              {BILLING_MODELS.map((m) => (
                <option key={m} value={m} className="bg-surface-2 text-white">
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </option>
              ))}
            </select>
          </form>

          <form className="flex-1 flex items-center gap-2" method="GET">
            {sp.status && <input type="hidden" name="status" value={sp.status} />}
            {sp.billing_model && <input type="hidden" name="billing_model" value={sp.billing_model} />}
            <input
              name="q"
              type="text"
              defaultValue={sp.q ?? ''}
              placeholder="Search projects..."
              className="flex-1 rounded-md border border-border-subtle bg-surface-0 px-3 py-1.5 text-xs text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-md bg-accent hover:bg-accent/90 text-white text-xs font-medium px-3 py-1.5 transition"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      {/* Project grid */}
      {projects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              deal={project.dealId ? dealMap.get(project.dealId) ?? null : null}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border-subtle bg-surface-2 p-12 text-center">
          <Briefcase className="w-8 h-8 text-text-tertiary mx-auto mb-3" />
          <p className="text-text-secondary text-sm">
            No projects yet. Create your first project to start tracking work.
          </p>
        </div>
      )}
    </div>
  );
}

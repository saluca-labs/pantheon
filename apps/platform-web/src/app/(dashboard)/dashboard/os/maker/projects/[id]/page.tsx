/**
 * Maker OS — Project Hub (per-project detail page).
 *
 * The per-project landing page every later Maker phase (BOM, build log,
 * tools, spec sheets, AI Coach) attaches to. Header carries cover image,
 * title, status pill, target date, and team size. Body has a 7-phase
 * progress tracker plus a tab strip:
 *
 *   - Overview   — phase tracker, description, stats
 *   - Parts      — the existing parts UI lifted to this page (Phase 1)
 *   - Build log  — placeholder (Phase 3)
 *   - Tools      — placeholder (Phase 4)
 *   - Spec sheets— placeholder (Phase 5)
 *   - AI Coach   — placeholder (Phase 7)
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import {
  ArrowLeft,
  Wrench,
  Calendar,
  Users,
  TrendingUp,
  Layers,
  ClipboardList,
  Hammer,
  FileText,
  Sparkles,
} from 'lucide-react';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { getProject, listParts } from '@/lib/agentic-os/maker/repo';
import {
  PROJECT_STATUS_LABELS,
  projectPhaseAvg,
} from '@/lib/agentic-os/maker/projects';
import { PhaseProgressEditor } from '@/components/agentic-os/maker/phase-progress-editor';
import { ProjectHubActions } from '@/components/agentic-os/maker/project-hub-actions';
import { ProjectPartsManager } from '@/components/agentic-os/maker/project-parts-manager';
import { STATUS_COLOR } from '@/components/agentic-os/maker/project-card';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

type TabKey = 'overview' | 'parts' | 'log' | 'tools' | 'specs' | 'coach';

const TABS: { key: TabKey; label: string; icon: typeof Layers; phase?: string }[] = [
  { key: 'overview', label: 'Overview', icon: Layers },
  { key: 'parts', label: 'Parts', icon: ClipboardList },
  { key: 'log', label: 'Build log', icon: Hammer, phase: 'Phase 3' },
  { key: 'tools', label: 'Tools', icon: Wrench, phase: 'Phase 4' },
  { key: 'specs', label: 'Spec sheets', icon: FileText, phase: 'Phase 5' },
  { key: 'coach', label: 'AI Coach', icon: Sparkles, phase: 'Phase 7' },
];

function daysUntil(target: string | null): number | null {
  if (!target) return null;
  const t = new Date(target + 'T00:00:00Z').getTime();
  const now = Date.now();
  return Math.round((t - now) / 86_400_000);
}

function isTabKey(value: string | undefined): value is TabKey {
  return (
    value === 'overview' ||
    value === 'parts' ||
    value === 'log' ||
    value === 'tools' ||
    value === 'specs' ||
    value === 'coach'
  );
}

export default async function MakerProjectHubPage({ params, searchParams }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const project = await getProject(id, user.userId);
  if (!project) notFound();

  const sp = await searchParams;
  const activeTab: TabKey = isTabKey(sp.tab) ? sp.tab : 'overview';

  const countdown = daysUntil(project.targetCompletionDate);
  const avg = projectPhaseAvg(project.phaseProgress);

  // Parts are loaded for the Parts tab so the SSR pass returns hydrated data;
  // the client component refreshes via the route on mount.
  const initialParts = activeTab === 'parts' ? await listParts(project.id) : [];

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/maker/projects"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to projects
      </Link>

      {/* Header */}
      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] overflow-hidden mb-6">
        {project.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.coverImageUrl}
            alt={project.name}
            className="w-full h-48 object-cover border-b border-[#2a2d3e]"
          />
        ) : (
          <div className="w-full h-32 bg-gradient-to-br from-[#4361EE]/20 to-[#1a1d27] border-b border-[#2a2d3e] flex items-center justify-center">
            <Wrench className="w-10 h-10 text-[#4361EE]/50" />
          </div>
        )}

        <div className="p-6 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1 className="text-2xl font-semibold text-white">{project.name}</h1>
              <span
                className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_COLOR[project.status]}`}
              >
                {PROJECT_STATUS_LABELS[project.status]}
              </span>
            </div>
            {project.description && (
              <p className="text-sm text-[#94a3b8]">{project.description}</p>
            )}
            {project.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {project.tags.map((t) => (
                  <span
                    key={t}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-[#0f1117] border border-[#2a2d3e] text-[#94a3b8]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          <ProjectHubActions project={project} />
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex flex-wrap items-center gap-1 mb-6 border-b border-[#2a2d3e]">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <Link
              key={tab.key}
              href={`/dashboard/os/maker/projects/${project.id}${tab.key === 'overview' ? '' : `?tab=${tab.key}`}`}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm transition border-b-2 -mb-px ${
                isActive
                  ? 'border-[#4361EE] text-white'
                  : 'border-transparent text-[#94a3b8] hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.phase && (
                <span className="text-[9px] uppercase tracking-wide text-[#94a3b8] ml-1">
                  ({tab.phase})
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Phase tracker */}
          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
              Phase progress
            </h2>
            <PhaseProgressEditor projectId={project.id} initial={project.phaseProgress} />
          </div>

          {/* Stats */}
          <div className="space-y-4">
            <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 space-y-3">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
                Stats
              </h2>
              <StatRow
                icon={<TrendingUp className="w-4 h-4" />}
                label="Overall progress"
                value={`${avg}%`}
              />
              <StatRow
                icon={<Users className="w-4 h-4" />}
                label="Team size"
                value={project.teamSize == null ? '—' : String(project.teamSize)}
              />
              <StatRow
                icon={<Calendar className="w-4 h-4" />}
                label="Target completion"
                value={
                  project.targetCompletionDate
                    ? `${project.targetCompletionDate}${
                        countdown == null
                          ? ''
                          : countdown >= 0
                            ? ` (in ${countdown}d)`
                            : ` (${Math.abs(countdown)}d ago)`
                      }`
                    : '—'
                }
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'parts' && (
        <div>
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">
            Parts inventory
          </h2>
          <p className="text-xs text-[#94a3b8] mb-4">
            Phase 2 will replace this with a proper BOM editor (suppliers, prices, deficits).
            For now, parts are a flat list per project.
          </p>
          <ProjectPartsManager projectId={project.id} initialParts={initialParts} />
        </div>
      )}

      {activeTab === 'log' && <ComingSoon phase="Phase 3" feature="Build log + photos" />}
      {activeTab === 'tools' && <ComingSoon phase="Phase 4" feature="Tools + jigs + maintenance" />}
      {activeTab === 'specs' && <ComingSoon phase="Phase 5" feature="Spec sheets + reports" />}
      {activeTab === 'coach' && <ComingSoon phase="Phase 7" feature="AI coach" />}
    </div>
  );
}

function StatRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="inline-flex items-center gap-2 text-[#94a3b8]">
        {icon}
        {label}
      </span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}

function ComingSoon({ phase, feature }: { phase: string; feature: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#2a2d3e] bg-[#1a1d27]/50 p-8 text-center">
      <p className="text-sm font-medium text-white mb-1">{feature}</p>
      <p className="text-xs text-[#94a3b8]">
        Not yet configured. Lands in <span className="text-[#cbd5e1]">{phase}</span> of the
        Maker OS roadmap.
      </p>
    </div>
  );
}

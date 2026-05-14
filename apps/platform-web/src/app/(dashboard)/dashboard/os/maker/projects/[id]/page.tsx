/**
 * Maker OS — Project Hub (per-project detail page).
 *
 * The per-project landing page every later Maker phase attaches to. Header
 * carries cover image, title, status pill, target date, team size, and
 * (Phase 5+) an Export PDF button. Body has a 7-phase progress tracker
 * plus a tab strip:
 *
 *   - Overview   — phase tracker, description, stats
 *   - BOM        — Phase 2 BOM editor (lines, deficits, est-cost)
 *   - Steps      — Phase 3 ordered build-step checklist
 *   - Log        — Phase 3 timestamped build log with photo / link attachments
 *   - Milestones — Phase 3 Gantt-style milestone strip
 *   - Tools      — Phase 4 project↔tool picker
 *   - Specs      — Phase 5 spec sheet list (union of project / parts / tools)
 *   - References — Phase 5 project↔reference picker
 *   - AI Coach   — Phase 7: links to the workshop-wide coach hub, scoped
 *                  to this project, mode pre-selected as build_planner.
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
  ListChecks,
  Hammer,
  FileText,
  BookOpen,
  Sparkles,
  CheckSquare,
  Flag,
  Network,
} from 'lucide-react';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  getProject,
  getBomSummary,
  listCatalog,
  listBuildSteps,
  listLogEntries,
  listMilestones,
  listToolsForProject,
  listTools,
  listSpecSheetsForProject,
  listReferencesForProject,
  listReferences,
  listProjectDependencies,
  listProjects,
} from '@/lib/agentic-os/maker/repo';
import {
  PROJECT_STATUS_LABELS,
  projectPhaseAvg,
} from '@/lib/agentic-os/maker/projects';
import { PhaseProgressEditor } from '@/components/agentic-os/maker/phase-progress-editor';
import { ProjectHubActions } from '@/components/agentic-os/maker/project-hub-actions';
import { BomEditor } from '@/components/agentic-os/maker/bom-editor';
import { StepListEditor } from '@/components/agentic-os/maker/step-list-editor';
import { BuildLogFeed } from '@/components/agentic-os/maker/build-log-feed';
import { MilestoneStrip } from '@/components/agentic-os/maker/milestone-strip';
import { ProjectToolsPicker } from '@/components/agentic-os/maker/project-tools-picker';
import { SpecSheetList } from '@/components/agentic-os/maker/spec-sheet-list';
import { ProjectReferencesPicker } from '@/components/agentic-os/maker/project-references-picker';
import { PdfExportButton } from '@/components/agentic-os/maker/pdf-export-button';
import { DependenciesTab } from '@/components/agentic-os/maker/dependencies-tab';
import { STATUS_COLOR } from '@/components/agentic-os/maker/project-card';
import { ProjectPhaseStrip } from '@/components/agentic-os/maker/project-phase-strip';
import { ProjectOverviewLinks } from '@/components/agentic-os/maker/project-overview-links';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

type TabKey =
  | 'overview'
  | 'bom'
  | 'steps'
  | 'log'
  | 'milestones'
  | 'tools'
  | 'specs'
  | 'references'
  | 'dependencies'
  | 'coach';

const TABS: { key: TabKey; label: string; icon: typeof Layers; phase?: string }[] = [
  { key: 'overview', label: 'Overview', icon: Layers },
  { key: 'bom', label: 'BOM', icon: ListChecks },
  { key: 'steps', label: 'Steps', icon: CheckSquare },
  { key: 'log', label: 'Log', icon: Hammer },
  { key: 'milestones', label: 'Milestones', icon: Flag },
  { key: 'tools', label: 'Tools', icon: Wrench },
  { key: 'specs', label: 'Specs', icon: FileText },
  { key: 'references', label: 'References', icon: BookOpen },
  { key: 'dependencies', label: 'Dependencies', icon: Network },
  { key: 'coach', label: 'AI Coach', icon: Sparkles },
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
    value === 'bom' ||
    value === 'steps' ||
    value === 'log' ||
    value === 'milestones' ||
    value === 'tools' ||
    value === 'specs' ||
    value === 'references' ||
    value === 'dependencies' ||
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

  // BOM summary + catalog rows preloaded for the BOM tab so SSR hydrates
  // immediately; the client component refreshes on mount.
  const [bomSummary, catalogRows] =
    activeTab === 'bom'
      ? await Promise.all([
          getBomSummary(project.id, user.userId),
          listCatalog({ userId: user.userId }),
        ])
      : [null, []];

  // Phase 3 tabs preload server-side for instant SSR; clients refresh on mount.
  const initialSteps =
    activeTab === 'steps' ? await listBuildSteps(project.id, user.userId) : [];
  const initialLogEntries =
    activeTab === 'log'
      ? await listLogEntries({ projectId: project.id, userId: user.userId, limit: 50 })
      : [];
  const initialMilestones =
    activeTab === 'milestones' ? await listMilestones(project.id, user.userId) : [];

  // Phase 4 tools tab — preload joined tool links + the full workshop catalog
  // so the picker has both lists hydrated on first paint.
  const [initialProjectTools, initialWorkshopTools] =
    activeTab === 'tools'
      ? await Promise.all([
          listToolsForProject(project.id, user.userId),
          listTools({ userId: user.userId }),
        ])
      : [[], []];

  // Phase 5 specs tab — union of project / parts-in-BOM / project-tool sheets.
  // Wave D.4 also loads this for the Overview tab's inline linked-specs digest.
  const initialSpecSheets =
    activeTab === 'specs' || activeTab === 'overview'
      ? await listSpecSheetsForProject(project.id, user.userId)
      : [];

  // Phase 5 references tab — joined links + full library for the picker.
  const [initialProjectRefs, initialRefLibrary] =
    activeTab === 'references'
      ? await Promise.all([
          listReferencesForProject(project.id, user.userId),
          listReferences({ userId: user.userId }),
        ])
      : [[], []];

  // Phase 6 dependencies tab — bidirectional edge view + all candidate
  // projects for the add-dependency picker.
  const [initialDependencies, candidateProjects] =
    activeTab === 'dependencies'
      ? await Promise.all([
          listProjectDependencies(project.id, user.userId),
          listProjects(user.userId),
        ])
      : [{ upstream: [], downstream: [] }, []];

  // Phase 5 export-PDF button — disabled when the project has nothing to
  // export. Cheap aggregate counts via the BOM summary + step/milestone/
  // tool/reference list-for-project queries; we don't load the full rows
  // for the count, just enough to know "is non-empty".
  const exportSummary = await getBomSummary(project.id, user.userId);
  const [
    exportStepsCount,
    exportMilestonesCount,
    exportToolsCount,
    exportRefsCount,
  ] = await Promise.all([
    listBuildSteps(project.id, user.userId).then((rs) => rs.length),
    listMilestones(project.id, user.userId).then((rs) => rs.length),
    listToolsForProject(project.id, user.userId).then((rs) => rs.length),
    listReferencesForProject(project.id, user.userId).then((rs) => rs.length),
  ]);
  const hasExportData =
    (exportSummary?.linesCount ?? 0) > 0 ||
    exportStepsCount > 0 ||
    exportMilestonesCount > 0 ||
    exportToolsCount > 0 ||
    exportRefsCount > 0;

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/maker/projects"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to projects
      </Link>

      {/* Header */}
      <div className="rounded-xl border border-border-subtle bg-surface-2 overflow-hidden mb-6">
        {project.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.coverImageUrl}
            alt={project.name}
            className="w-full h-48 object-cover border-b border-border-subtle"
          />
        ) : (
          <div className="w-full h-32 bg-gradient-to-br from-accent/20 to-surface-2 border-b border-border-subtle flex items-center justify-center">
            <Wrench className="w-10 h-10 text-accent/50" />
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
              <p className="text-sm text-text-secondary">{project.description}</p>
            )}
            {project.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {project.tags.map((t) => (
                  <span
                    key={t}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-surface-0 border border-border-subtle text-text-secondary"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-start gap-2 flex-wrap">
            <PdfExportButton projectId={project.id} hasData={hasExportData} />
            <ProjectHubActions project={project} />
          </div>
        </div>
      </div>

      {/* Phase strip — Wave D.4: at-a-glance lifecycle progress above the tabs */}
      <ProjectPhaseStrip
        phaseProgress={project.phaseProgress}
        status={project.status}
      />

      {/* Tab strip */}
      <div className="flex flex-wrap items-center gap-1 mb-6 border-b border-border-subtle">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <Link
              key={tab.key}
              href={`/dashboard/os/maker/projects/${project.id}${tab.key === 'overview' ? '' : `?tab=${tab.key}`}`}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm transition border-b-2 -mb-px ${
                isActive
                  ? 'border-accent text-white'
                  : 'border-transparent text-text-secondary hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.phase && (
                <span className="text-[9px] uppercase tracking-wide text-text-secondary ml-1">
                  ({tab.phase})
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Phase tracker + inline linked specs / parts */}
          <div className="lg:col-span-2 space-y-6">
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
                Phase progress
              </h2>
              <PhaseProgressEditor projectId={project.id} initial={project.phaseProgress} />
            </div>

            {/* Wave D.4 — linked specs + parts surfaced inline on Overview */}
            <ProjectOverviewLinks
              projectId={project.id}
              bomSummary={exportSummary}
              specSheets={initialSpecSheets}
            />
          </div>

          {/* Stats */}
          <div className="space-y-4">
            <div className="rounded-xl border border-border-subtle bg-surface-2 p-4 space-y-3">
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

      {activeTab === 'bom' && bomSummary && (
        <div>
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">
            Bill of materials
          </h2>
          <p className="text-xs text-text-secondary mb-4">
            Each line picks a workshop catalog row. Need a part that isn&apos;t in the catalog?{' '}
            <Link
              href="/dashboard/os/maker/catalog"
              className="text-accent hover:underline"
            >
              Add it to the catalog
            </Link>
            , then come back here.
          </p>
          <BomEditor
            projectId={project.id}
            initialSummary={bomSummary}
            catalogRows={catalogRows}
          />
        </div>
      )}

      {activeTab === 'steps' && (
        <div>
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">
            Build steps
          </h2>
          <p className="text-xs text-text-secondary mb-4">
            Ordered checklist of what needs to happen. Tick each step as you go, jot
            blocker notes, and use the up/down arrows to re-sequence.
          </p>
          <StepListEditor projectId={project.id} initialSteps={initialSteps} />
        </div>
      )}

      {activeTab === 'log' && (
        <div>
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">
            Build log
          </h2>
          <p className="text-xs text-text-secondary mb-4">
            Timestamped feed of build notes, photos, and reference links. Photos and
            files are URL-only — paste links from your phone, cloud drive, or any
            external host.
          </p>
          <BuildLogFeed projectId={project.id} initialEntries={initialLogEntries} />
        </div>
      )}

      {activeTab === 'milestones' && (
        <div>
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">
            Milestones
          </h2>
          <p className="text-xs text-text-secondary mb-4">
            Named beats in the project timeline. Set a due date to surface overdue and
            due-soon warnings; tick the box when each beat lands.
          </p>
          <MilestoneStrip
            projectId={project.id}
            initialMilestones={initialMilestones}
          />
        </div>
      )}

      {activeTab === 'tools' && (
        <div>
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">
            Tools &amp; jigs
          </h2>
          <p className="text-xs text-text-secondary mb-4">
            Workshop tools this build depends on. Mark which ones are required vs
            nice-to-have. Need a tool that isn&apos;t in your workshop yet?{' '}
            <Link
              href="/dashboard/os/maker/tools"
              className="text-accent hover:underline"
            >
              Add it to the workshop
            </Link>
            , then come back here.
          </p>
          <ProjectToolsPicker
            projectId={project.id}
            initialLinks={initialProjectTools}
            initialWorkshopTools={initialWorkshopTools}
          />
        </div>
      )}
      {activeTab === 'specs' && (
        <div>
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">
            Spec sheets
          </h2>
          <p className="text-xs text-text-secondary mb-4">
            Datasheets, drawings, manuals, and compliance certificates for this build
            — directly attached to the project, or pulled in from parts on the BOM
            and tools linked to the project. URL-only — link to your cloud drive,
            vendor site, or any external host.
          </p>
          <SpecSheetList
            scope={{ kind: 'project', projectId: project.id }}
            initialSheets={initialSpecSheets}
          />
        </div>
      )}
      {activeTab === 'references' && (
        <div>
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">
            References
          </h2>
          <p className="text-xs text-text-secondary mb-4">
            Papers, tutorials, standards, articles, videos, books, and bare links
            attached to this build. Pull existing entries from your workshop-global{' '}
            <Link
              href="/dashboard/os/maker/references"
              className="text-accent hover:underline"
            >
              references library
            </Link>{' '}
            or create a new one inline.
          </p>
          <ProjectReferencesPicker
            projectId={project.id}
            initialLinks={initialProjectRefs}
            initialLibrary={initialRefLibrary}
          />
        </div>
      )}
      {activeTab === 'dependencies' && (
        <div>
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">
            Cross-project dependencies
          </h2>
          <p className="text-xs text-text-secondary mb-4">
            Wire up which other Maker projects this build depends on (upstream) and
            which builds depend on this one (downstream). Open{' '}
            <code className="text-text-primary">blocks</code> edges feed the workshop-wide{' '}
            <Link href="/dashboard/os/maker/blockers" className="text-accent hover:underline">
              Top Blockers
            </Link>{' '}
            list.
          </p>
          <DependenciesTab
            projectId={project.id}
            initial={initialDependencies}
            candidateProjects={candidateProjects}
          />
        </div>
      )}
      {activeTab === 'coach' && (
        <div>
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">
            AI coach
          </h2>
          <p className="text-xs text-text-secondary mb-4">
            Project-scoped AI advisor across procurement, build planning,
            and shop safety. Pick a mode and start a session — the coach
            reads this project&apos;s BOM, build steps, milestones, tools,
            and dependencies as relevant to the chosen mode.
          </p>
          <Link
            href={`/dashboard/os/maker/coach?project_id=${project.id}&mode=build_planner`}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-black text-sm font-medium px-4 py-2 transition"
          >
            <Sparkles className="w-4 h-4" />
            Open project coach
          </Link>
        </div>
      )}
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
      <span className="inline-flex items-center gap-2 text-text-secondary">
        {icon}
        {label}
      </span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}


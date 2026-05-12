/**
 * Research OS — Experiment detail page.
 *
 * Per-experiment landing page. Header carries cover image, name, status,
 * target date, tags, Phase 6 reproducibility score pill, and the Export
 * PDF button. Tab strip:
 *
 *   - Overview        — phase tracker + description + stats + milestones strip
 *   - Notebook        — lab notebook timeline (Phase 2)
 *   - Hypotheses      — workshop-wide hypothesis ledger join (Phase 3)
 *   - Literature      — paper references (Phase 4)
 *   - Datasets        — per-experiment dataset pointers (Phase 5)
 *   - Protocols       — pinned protocol revisions (Phase 5)
 *   - Milestones      — Phase 6 deadline list (full)
 *   - Dependencies    — Phase 6 cross-experiment dependency graph
 *   - Reproducibility — Phase 6 reproducibility checklist
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import {
  ArrowLeft,
  FlaskConical,
  Calendar,
  Users,
  TrendingUp,
  Layers,
  BookOpen,
  Lightbulb,
  Database,
  FileText,
  BookOpenText,
  Target,
  Network,
  ShieldCheck,
} from 'lucide-react';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import {
  getExperiment,
  listHypotheses,
  listExperimentsForUser,
} from '@/lib/agentic-os/research/repo';
import { listNotebookEntriesForExperiment } from '@/lib/agentic-os/research/notebook-entries-repo';
import { listLinkedHypothesesForExperiment } from '@/lib/agentic-os/research/experiment-hypotheses-repo';
import { listReferencesForExperiment } from '@/lib/agentic-os/research/experiment-references-repo';
import { listDatasetsForExperiment } from '@/lib/agentic-os/research/datasets-repo';
import { listProtocolsForExperiment } from '@/lib/agentic-os/research/experiment-protocols-repo';
import { listMilestonesForExperiment } from '@/lib/agentic-os/research/milestones-repo';
import { listDependenciesForExperiment } from '@/lib/agentic-os/research/dependencies-repo';
import {
  listReproChecksForExperiment,
  seedCanonicalReproItems,
} from '@/lib/agentic-os/research/reproducibility-repo';
import {
  EXPERIMENT_STATUS_LABELS,
  experimentPhaseAvg,
} from '@/lib/agentic-os/research/experiments';
import {
  computeReproRollup,
} from '@/lib/agentic-os/research/reproducibility';
import { sortMilestonesByDeadline } from '@/lib/agentic-os/research/milestones';
import { ExperimentPhaseProgress } from '@/components/agentic-os/research/experiment-phase-progress';
import { STATUS_COLOR } from '@/components/agentic-os/research/experiment-card';
import { NotebookTimeline } from '@/components/agentic-os/research/notebook-timeline';
import { ExperimentHypothesesTab } from '@/components/agentic-os/research/experiment-hypotheses-tab';
import { PaperReferenceLinker } from '@/components/agentic-os/research/paper-reference-linker';
import { DatasetList } from '@/components/agentic-os/research/dataset-list';
import { ExperimentProtocolLinker } from '@/components/agentic-os/research/experiment-protocol-linker';
import { ExperimentProtocolPinnedRow } from '@/components/agentic-os/research/experiment-protocol-pinned-row';
import { ExperimentExportPdfButton } from '@/components/agentic-os/research/experiment-export-pdf-button';
import { MilestoneList } from '@/components/agentic-os/research/milestone-list';
import { MilestoneCard } from '@/components/agentic-os/research/milestone-card';
import { DependencyList } from '@/components/agentic-os/research/dependency-list';
import { ReproducibilityChecklist } from '@/components/agentic-os/research/reproducibility-checklist';
import { ReproducibilityScoreBadge } from '@/components/agentic-os/research/reproducibility-score-badge';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

type TabKey =
  | 'overview'
  | 'notebook'
  | 'hypotheses'
  | 'literature'
  | 'datasets'
  | 'protocols'
  | 'milestones'
  | 'dependencies'
  | 'reproducibility';

const TABS: { key: TabKey; label: string; icon: typeof Layers }[] = [
  { key: 'overview', label: 'Overview', icon: Layers },
  { key: 'notebook', label: 'Notebook', icon: BookOpen },
  { key: 'hypotheses', label: 'Hypotheses', icon: Lightbulb },
  { key: 'literature', label: 'Literature', icon: BookOpenText },
  { key: 'datasets', label: 'Datasets', icon: Database },
  { key: 'protocols', label: 'Protocols', icon: FileText },
  { key: 'milestones', label: 'Milestones', icon: Target },
  { key: 'dependencies', label: 'Dependencies', icon: Network },
  { key: 'reproducibility', label: 'Reproducibility', icon: ShieldCheck },
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
    value === 'notebook' ||
    value === 'hypotheses' ||
    value === 'literature' ||
    value === 'datasets' ||
    value === 'protocols' ||
    value === 'milestones' ||
    value === 'dependencies' ||
    value === 'reproducibility'
  );
}

export default async function ResearchExperimentDetailPage({ params, searchParams }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const experiment = await getExperiment(id, user.userId);
  if (!experiment) notFound();

  const sp = await searchParams;
  const activeTab: TabKey = isTabKey(sp.tab) ? sp.tab : 'overview';

  const countdown = daysUntil(experiment.targetCompletionDate);
  const avg = experimentPhaseAvg(experiment.phaseProgress);

  // Always load the milestone strip + reproducibility score for the
  // Overview-tab header pill — small queries.
  const [overviewMilestones, reproItemsForBadge] = await Promise.all([
    listMilestonesForExperiment(experiment.id, user.userId, {}),
    (async () => {
      // Seed lazily so the header badge reflects the canonical 7 items
      // even on first visit.
      await seedCanonicalReproItems(experiment.id, user.userId);
      return listReproChecksForExperiment(experiment.id, user.userId);
    })(),
  ]);
  const reproRollup = computeReproRollup(reproItemsForBadge);
  const milestoneStrip = sortMilestonesByDeadline(overviewMilestones).slice(0, 5);

  const notebookEntries =
    activeTab === 'notebook'
      ? await listNotebookEntriesForExperiment(experiment.id, user.userId, {})
      : [];

  const [linkedHypotheses, hypothesisCandidates] = activeTab === 'hypotheses'
    ? await Promise.all([
        listLinkedHypothesesForExperiment(experiment.id, user.userId),
        listHypotheses(user.userId, { archived: false }),
      ])
    : [[], []];

  const literatureReferences =
    activeTab === 'literature'
      ? await listReferencesForExperiment(experiment.id, user.userId)
      : [];

  const datasets =
    activeTab === 'datasets'
      ? await listDatasetsForExperiment(experiment.id, user.userId, { limit: 200 })
      : [];

  const protocolPins =
    activeTab === 'protocols'
      ? await listProtocolsForExperiment(experiment.id, user.userId)
      : [];

  const dependenciesView =
    activeTab === 'dependencies'
      ? await listDependenciesForExperiment(experiment.id, user.userId)
      : { upstream: [], downstream: [] };

  // For the dependency picker, list other experiments owned by the user.
  const peerOptions =
    activeTab === 'dependencies'
      ? (await listExperimentsForUser(user.userId, { archived: false, limit: 200 }))
          .filter((e) => e.id !== experiment.id)
          .map((e) => ({ id: e.id, name: e.name }))
      : [];

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/research"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Research OS
      </Link>

      {/* Header */}
      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] overflow-hidden mb-6">
        {experiment.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={experiment.coverImageUrl}
            alt={experiment.name}
            className="w-full h-48 object-cover border-b border-[#2a2d3e]"
          />
        ) : (
          <div className="w-full h-32 bg-gradient-to-br from-[#4361EE]/20 to-[#1a1d27] border-b border-[#2a2d3e] flex items-center justify-center">
            <FlaskConical className="w-10 h-10 text-[#4361EE]/50" />
          </div>
        )}

        <div className="p-6 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1 className="text-2xl font-semibold text-white">{experiment.name}</h1>
              <span
                className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_COLOR[experiment.status]}`}
              >
                {EXPERIMENT_STATUS_LABELS[experiment.status]}
              </span>
              {experiment.archivedAt && (
                <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border border-[#2a2d3e] bg-[#0f1117] text-[#94a3b8]">
                  Archived
                </span>
              )}
              <ReproducibilityScoreBadge score={reproRollup.score} />
            </div>
            {experiment.description && (
              <p className="text-sm text-[#94a3b8]">{experiment.description}</p>
            )}
            {experiment.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {experiment.tags.map((t) => (
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
          <ExperimentExportPdfButton experimentId={experiment.id} />
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
              href={`/dashboard/os/research/experiments/${experiment.id}${tab.key === 'overview' ? '' : `?tab=${tab.key}`}`}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm transition border-b-2 -mb-px ${
                isActive
                  ? 'border-[#4361EE] text-white'
                  : 'border-transparent text-[#94a3b8] hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.key === 'reproducibility' && reproRollup.score != null && (
                <span className="ml-1 text-[10px] text-[#94a3b8]">
                  ({Math.round(reproRollup.score * 100)}%)
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-3">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
                Phase progress
              </h2>
              <ExperimentPhaseProgress phaseProgress={experiment.phaseProgress} />
            </div>
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
                  value={experiment.teamSize == null ? '—' : String(experiment.teamSize)}
                />
                <StatRow
                  icon={<Calendar className="w-4 h-4" />}
                  label="Target completion"
                  value={
                    experiment.targetCompletionDate
                      ? `${experiment.targetCompletionDate}${
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

          {/* Milestones strip (Overview) */}
          <section aria-labelledby="overview-milestones-heading" data-testid="overview-milestones-strip">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <h2
                id="overview-milestones-heading"
                className="text-sm font-semibold text-white uppercase tracking-wide inline-flex items-center gap-2"
              >
                <Target className="w-4 h-4 text-[#4361EE]" />
                Milestones
              </h2>
              <Link
                href={`/dashboard/os/research/experiments/${experiment.id}?tab=milestones`}
                className="text-[10px] uppercase tracking-wide text-[#4361EE] hover:underline"
              >
                Open milestones tab
              </Link>
            </div>
            {milestoneStrip.length === 0 ? (
              <p className="text-sm text-[#94a3b8] italic">No milestones yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {milestoneStrip.map((m) => (
                  <MilestoneCard key={m.id} milestone={m} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'notebook' && (
        <section aria-labelledby="notebook-heading">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div>
              <h2
                id="notebook-heading"
                className="text-sm font-semibold text-white uppercase tracking-wide"
              >
                Lab notebook
              </h2>
              <p className="text-xs text-[#94a3b8]">
                Timestamped observations, results, decisions, questions, and to-dos.
              </p>
            </div>
          </div>
          <NotebookTimeline
            experimentId={experiment.id}
            initialEntries={notebookEntries}
          />
        </section>
      )}

      {activeTab === 'hypotheses' && (
        <section aria-labelledby="hypotheses-heading">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div>
              <h2
                id="hypotheses-heading"
                className="text-sm font-semibold text-white uppercase tracking-wide inline-flex items-center gap-2"
              >
                <Lightbulb className="w-4 h-4 text-[#4361EE]" />
                Linked hypotheses
              </h2>
              <p className="text-xs text-[#94a3b8]">
                Link workshop-wide hypotheses this experiment tests, motivates, or relates to.
              </p>
            </div>
            <Link
              href="/dashboard/os/research/hypotheses"
              className="inline-flex items-center gap-1.5 text-xs text-[#4361EE] hover:underline"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Open hypothesis ledger
            </Link>
          </div>
          <ExperimentHypothesesTab
            experimentId={experiment.id}
            initialLinked={linkedHypotheses}
            candidates={hypothesisCandidates}
          />
        </section>
      )}

      {activeTab === 'literature' && (
        <section aria-labelledby="literature-heading">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div>
              <h2
                id="literature-heading"
                className="text-sm font-semibold text-white uppercase tracking-wide inline-flex items-center gap-2"
              >
                <BookOpenText className="w-4 h-4 text-[#4361EE]" />
                Literature references
              </h2>
              <p className="text-xs text-[#94a3b8]">
                Link papers from the workshop-global library to this experiment.
                Different relevance values for the same paper are allowed.
              </p>
            </div>
            <Link
              href="/dashboard/os/research/library"
              className="inline-flex items-center gap-1.5 text-xs text-[#4361EE] hover:underline"
            >
              <BookOpenText className="w-3.5 h-3.5" />
              Open library
            </Link>
          </div>
          <PaperReferenceLinker
            experimentId={experiment.id}
            initialReferences={literatureReferences}
          />
        </section>
      )}

      {activeTab === 'datasets' && (
        <section aria-labelledby="datasets-heading">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div>
              <h2
                id="datasets-heading"
                className="text-sm font-semibold text-white uppercase tracking-wide inline-flex items-center gap-2"
              >
                <Database className="w-4 h-4 text-[#4361EE]" />
                Datasets
              </h2>
              <p className="text-xs text-[#94a3b8]">
                Per-experiment dataset pointers. URL-only — the binary content
                is governed by the MCP storage-transfer contract.
              </p>
            </div>
          </div>
          <DatasetList experimentId={experiment.id} initialDatasets={datasets} />
        </section>
      )}

      {activeTab === 'protocols' && (
        <section aria-labelledby="protocols-heading">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div>
              <h2
                id="protocols-heading"
                className="text-sm font-semibold text-white uppercase tracking-wide inline-flex items-center gap-2"
              >
                <FileText className="w-4 h-4 text-[#4361EE]" />
                Pinned protocols
              </h2>
              <p className="text-xs text-[#94a3b8]">
                Pin a workshop-global protocol at a frozen version string —
                reproducibility anchor for this experiment.
              </p>
            </div>
            <Link
              href="/dashboard/os/research/protocols"
              className="inline-flex items-center gap-1.5 text-xs text-[#4361EE] hover:underline"
            >
              <FileText className="w-3.5 h-3.5" />
              Open protocols library
            </Link>
          </div>
          <div className="space-y-3">
            <ExperimentProtocolLinker experimentId={experiment.id} />
            {protocolPins.length === 0 ? (
              <p
                className="text-sm text-[#94a3b8] italic py-6 text-center"
                data-testid="protocols-tab-empty"
              >
                No protocols pinned yet.
              </p>
            ) : (
              protocolPins.map((pin) => (
                <ExperimentProtocolPinnedRow
                  key={pin.link.id}
                  experimentId={experiment.id}
                  pin={pin}
                />
              ))
            )}
          </div>
        </section>
      )}

      {activeTab === 'milestones' && (
        <section aria-labelledby="milestones-heading" data-testid="milestones-tab">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div>
              <h2
                id="milestones-heading"
                className="text-sm font-semibold text-white uppercase tracking-wide inline-flex items-center gap-2"
              >
                <Target className="w-4 h-4 text-[#4361EE]" />
                Milestones
              </h2>
              <p className="text-xs text-[#94a3b8]">
                Deadlines, statuses, and blocker flags for this experiment.
                The Top Blockers feed surfaces at-risk milestones workshop-wide.
              </p>
            </div>
          </div>
          <MilestoneList
            experimentId={experiment.id}
            initialMilestones={overviewMilestones}
          />
        </section>
      )}

      {activeTab === 'dependencies' && (
        <section aria-labelledby="dependencies-heading" data-testid="dependencies-tab">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div>
              <h2
                id="dependencies-heading"
                className="text-sm font-semibold text-white uppercase tracking-wide inline-flex items-center gap-2"
              >
                <Network className="w-4 h-4 text-[#4361EE]" />
                Dependencies
              </h2>
              <p className="text-xs text-[#94a3b8]">
                Directed edges to other experiments. Open <code className="text-[#cbd5e1]">blocks</code>{' '}
                edges surface on the Top Blockers feed.
              </p>
            </div>
          </div>
          <DependencyList
            experimentId={experiment.id}
            initialView={dependenciesView}
            peerOptions={peerOptions}
          />
        </section>
      )}

      {activeTab === 'reproducibility' && (
        <section aria-labelledby="repro-heading" data-testid="reproducibility-tab">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div>
              <h2
                id="repro-heading"
                className="text-sm font-semibold text-white uppercase tracking-wide inline-flex items-center gap-2"
              >
                <ShieldCheck className="w-4 h-4 text-[#4361EE]" />
                Reproducibility
              </h2>
              <p className="text-xs text-[#94a3b8]">
                Checklist with score = done / (pending + in_progress + done).
                Not applicable + waived are excluded from the denominator.
              </p>
            </div>
          </div>
          <ReproducibilityChecklist
            experimentId={experiment.id}
            initialItems={reproItemsForBadge}
          />
        </section>
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
      <span className="inline-flex items-center gap-2 text-[#94a3b8]">
        {icon}
        {label}
      </span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}

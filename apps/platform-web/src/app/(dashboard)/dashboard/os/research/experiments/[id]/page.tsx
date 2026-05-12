/**
 * Research OS — Experiment detail page.
 *
 * Per-experiment landing page. Header carries cover image, name, status,
 * target date, tags. Tab strip mirrors what the plan locks in for later
 * phases:
 *
 *   - Overview   — phase tracker + description + stats (Phase 1)
 *   - Notebook   — placeholder, ships Phase 2
 *   - Hypotheses — placeholder, ships Phase 3
 *
 * Tabs render placeholders pointing at the relevant plan phase until
 * the underlying work lands.
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
} from 'lucide-react';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { getExperiment, listHypotheses } from '@/lib/agentic-os/research/repo';
import { listNotebookEntriesForExperiment } from '@/lib/agentic-os/research/notebook-entries-repo';
import { listLinkedHypothesesForExperiment } from '@/lib/agentic-os/research/experiment-hypotheses-repo';
import {
  EXPERIMENT_STATUS_LABELS,
  experimentPhaseAvg,
} from '@/lib/agentic-os/research/experiments';
import { ExperimentPhaseProgress } from '@/components/agentic-os/research/experiment-phase-progress';
import { STATUS_COLOR } from '@/components/agentic-os/research/experiment-card';
import { NotebookTimeline } from '@/components/agentic-os/research/notebook-timeline';
import { ExperimentHypothesesTab } from '@/components/agentic-os/research/experiment-hypotheses-tab';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

type TabKey = 'overview' | 'notebook' | 'hypotheses';

const TABS: { key: TabKey; label: string; icon: typeof Layers; phase?: string }[] = [
  { key: 'overview', label: 'Overview', icon: Layers },
  { key: 'notebook', label: 'Notebook', icon: BookOpen },
  { key: 'hypotheses', label: 'Hypotheses', icon: Lightbulb },
];

function daysUntil(target: string | null): number | null {
  if (!target) return null;
  const t = new Date(target + 'T00:00:00Z').getTime();
  const now = Date.now();
  return Math.round((t - now) / 86_400_000);
}

function isTabKey(value: string | undefined): value is TabKey {
  return value === 'overview' || value === 'notebook' || value === 'hypotheses';
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

  const notebookEntries =
    activeTab === 'notebook'
      ? await listNotebookEntriesForExperiment(experiment.id, user.userId, {})
      : [];

  // Phase 3 — hydrate the linked hypotheses + the workshop-global
  // candidate ledger for the picker when the Hypotheses tab is active.
  const [linkedHypotheses, hypothesisCandidates] = activeTab === 'hypotheses'
    ? await Promise.all([
        listLinkedHypothesesForExperiment(experiment.id, user.userId),
        listHypotheses(user.userId, { archived: false }),
      ])
    : [[], []];

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
            <ExperimentPhaseProgress phaseProgress={experiment.phaseProgress} />
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

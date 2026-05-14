/**
 * Research OS — Hub page.
 *
 * Phase 1 added the experiments grid. Phase 6 adds the Top Blockers
 * widget at the top of the hub, surfacing workshop-wide blockers across
 * all of the user's experiments.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import Link from 'next/link';
import { FlaskConical, BookOpen } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { listExperimentsForUser, listHypotheses } from '@/lib/agentic-os/research/repo';
import { listPapers } from '@/lib/agentic-os/research/papers-repo';
import { listTopBlockers } from '@/lib/agentic-os/research/blockers-repo';
import { ExperimentList } from '@/components/agentic-os/research/experiment-list';
import { TopBlockersWidget } from '@/components/agentic-os/research/top-blockers-widget';
import { ResearchHubWidgets } from '@/components/agentic-os/research/research-hub-widgets';

export const dynamic = 'force-dynamic';

export default async function ResearchHubPage() {
  const user = await getCurrentResearchUser();
  if (!user) redirect('/login');

  // Load both active and archived in one shot so the client-side toggle
  // can switch without a round-trip. 200-row cap mirrors the API ceiling.
  // Hypotheses + papers are loaded for the hub aggregate widgets only.
  const [active, archived, initialBlockers, hypotheses, papers] = await Promise.all([
    listExperimentsForUser(user.userId, { archived: false, limit: 200 }),
    listExperimentsForUser(user.userId, { archived: true, limit: 200 }),
    listTopBlockers(user.userId, { limit: 5 }),
    listHypotheses(user.userId, { archived: false }),
    listPapers(user.userId, { limit: 200 }),
  ]);
  const experiments = [...active, ...archived];

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-2">
        <FlaskConical className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">Research OS</h1>
      </div>

      <p className="text-sm text-text-secondary mb-6">
        Electronic lab notebook, literature mapping, hypothesis ledger, and experiment design
        for solo PhDs and small labs. Each experiment is a top-level project with its own
        lifecycle (planning → running → analysis → write-up → published).
      </p>

      <div className="mb-6">
        <ResearchHubWidgets
          experiments={experiments}
          blockers={initialBlockers}
          hypothesisCount={hypotheses.length}
          literatureCount={papers.length}
        />
      </div>

      <div className="mb-6">
        <TopBlockersWidget initial={initialBlockers} />
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
            Experiments
          </h2>
          <Link
            href="/dashboard/os/research/hypotheses"
            className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white transition"
          >
            <BookOpen className="w-4 h-4" />
            Hypothesis ledger
          </Link>
        </div>
        <ExperimentList initialExperiments={experiments} />
      </div>
    </div>
  );
}

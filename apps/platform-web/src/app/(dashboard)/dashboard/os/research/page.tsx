/**
 * Research OS — Hub page.
 *
 * Server component. Wave E-3 (UI Depth Wave coherence pass): the bespoke
 * hub — a hand-rolled `FlaskConical` header, the `ResearchHubWidgets` stat
 * strip, the `TopBlockersWidget`, and the experiments section, all inlined
 * directly in this page body — is retired in favour of the shared
 * `DashboardHub` shell used by the rest of the suite:
 *   - `module`          — drives the icon / name / status badge / tagline /
 *                         description header and the registry feature grid
 *                         (Experiments hub, Lab notebook, Hypothesis ledger,
 *                         Literature library, Protocols, Reproducibility
 *                         export, Top blockers, AI coach).
 *   - `dashboard`       — the Experiments / Hypotheses / Literature / Open
 *                         blockers stat trio-plus-one, built by the pure
 *                         `buildResearchDashboardSpec` adapter.
 *   - `roadmapMarkdown` — the Research execution plan in the collapsed
 *                         accordion.
 *
 * The `TopBlockersWidget` (an interactive client component that refreshes
 * on focus) and the experiments section (`ExperimentList` + the hypothesis
 * ledger link) are not aggregate "at a glance" state and have no matching
 * declarative slot, so they stay as sibling sections rendered after
 * `DashboardHub` — the same pattern the Cyber OS hub uses for its
 * recent-assets panel. Same data, same routes, same counts — presentation
 * layer only.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { redirect } from 'next/navigation';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';
import { loadAgenticOsPlan } from '@/lib/agentic-os/plan-loader';
import { DashboardHub } from '@/components/agentic-os/_shared/dashboard-hub';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { listExperimentsForUser, listHypotheses } from '@/lib/agentic-os/research/repo';
import { listPapers } from '@/lib/agentic-os/research/papers-repo';
import { listTopBlockers } from '@/lib/agentic-os/research/blockers-repo';
import { buildResearchDashboardSpec } from '@/lib/agentic-os/research/dashboard-spec';
import { ExperimentList } from '@/components/agentic-os/research/experiment-list';
import { TopBlockersWidget } from '@/components/agentic-os/research/top-blockers-widget';

export const dynamic = 'force-dynamic';

const RESEARCH_SLUG = 'research';

export default async function ResearchHubPage() {
  const user = await getCurrentResearchUser();
  if (!user) redirect('/login');

  const mod = findAgenticOsModule(RESEARCH_SLUG);
  if (!mod) {
    // Defensive — registry must contain Research while this page is shipped.
    throw new Error('Research OS module missing from registry');
  }

  // Load both active and archived in one shot so the client-side toggle
  // can switch without a round-trip. 200-row cap mirrors the API ceiling.
  // Hypotheses + papers are loaded for the hub aggregate widgets only.
  const [plan, active, archived, initialBlockers, hypotheses, papers] =
    await Promise.all([
      loadAgenticOsPlan(RESEARCH_SLUG),
      listExperimentsForUser(user.userId, { archived: false, limit: 200 }),
      listExperimentsForUser(user.userId, { archived: true, limit: 200 }),
      listTopBlockers(user.userId, { limit: 5 }),
      listHypotheses(user.userId, { archived: false }),
      listPapers(user.userId, { limit: 200 }),
    ]);
  const experiments = [...active, ...archived];

  const dashboard = buildResearchDashboardSpec({
    experiments,
    blockers: initialBlockers,
    hypothesisCount: hypotheses.length,
    literatureCount: papers.length,
  });

  return (
    <div className="space-y-6">
      <DashboardHub
        module={mod}
        roadmapMarkdown={plan ?? null}
        dashboard={dashboard}
      />

      {/* Top blockers — interactive client widget (refreshes on focus), no
          declarative slot. Sibling section, Cyber-OS recent-assets pattern. */}
      <section className="max-w-5xl">
        <TopBlockersWidget initial={initialBlockers} />
      </section>

      {/* Experiments — the hub's primary interactive content. Sibling
          section: `ExperimentList` is a client list, not "at a glance" state. */}
      <section className="max-w-5xl">
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
      </section>
    </div>
  );
}

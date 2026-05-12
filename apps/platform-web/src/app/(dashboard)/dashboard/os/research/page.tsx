/**
 * Research OS — Hub page.
 *
 * Phase 1 added the experiments grid. Phase 6 added the Top Blockers
 * widget at the top of the hub, surfacing workshop-wide blockers across
 * all of the user's experiments. Phase 7-followup adds the "More surfaces"
 * section that renders the registry-driven feature cards Phases 2-7
 * each registered (notebook, library, protocols, exports, coach, etc.) —
 * mirrors the Autobiographer hub's pattern.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import Link from 'next/link';
import { FlaskConical, BookOpen, ArrowRight } from 'lucide-react';
import { redirect } from 'next/navigation';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { listExperimentsForUser } from '@/lib/agentic-os/research/repo';
import { listTopBlockers } from '@/lib/agentic-os/research/blockers-repo';
import { ExperimentList } from '@/components/agentic-os/research/experiment-list';
import { TopBlockersWidget } from '@/components/agentic-os/research/top-blockers-widget';

export const dynamic = 'force-dynamic';

export default async function ResearchHubPage() {
  const user = await getCurrentResearchUser();
  if (!user) redirect('/login');

  const mod = findAgenticOsModule('research');
  if (!mod) {
    throw new Error('Research OS module missing from registry');
  }

  // Load both active and archived in one shot so the client-side toggle
  // can switch without a round-trip. 200-row cap mirrors the API ceiling.
  const [active, archived, initialBlockers] = await Promise.all([
    listExperimentsForUser(user.userId, { archived: false, limit: 200 }),
    listExperimentsForUser(user.userId, { archived: true, limit: 200 }),
    listTopBlockers(user.userId, { limit: 5 }),
  ]);
  const experiments = [...active, ...archived];

  // Surfaces already shown inline above (experiments grid + top blockers widget
  // + hypothesis ledger inline link). Filter these out of the "More surfaces"
  // grid so the section only shows other registered surfaces (notebook, library,
  // protocols, exports, coach).
  const inlineHrefs = new Set([
    '/dashboard/os/research/experiments',
    '/dashboard/os/research/hypotheses',
    '/dashboard/os/research/blockers',
  ]);
  const moreFeatures = mod.features.filter((f) => !inlineHrefs.has(f.href));

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-2">
        <FlaskConical className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">Research OS</h1>
      </div>

      <p className="text-sm text-[#94a3b8] mb-6">
        Electronic lab notebook, literature mapping, hypothesis ledger, and experiment design
        for solo PhDs and small labs. Each experiment is a top-level project with its own
        lifecycle (planning → running → analysis → write-up → published).
      </p>

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
            className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white transition"
          >
            <BookOpen className="w-4 h-4" />
            Hypothesis ledger
          </Link>
        </div>
        <ExperimentList initialExperiments={experiments} />
      </div>

      {moreFeatures.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">
            More surfaces
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {moreFeatures.map((feature) => (
              <Link
                key={feature.href}
                href={feature.href}
                className="group rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 hover:border-[#4361EE]/60 hover:bg-[#1f2230] transition flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white mb-1">
                    {feature.label}
                  </div>
                  <p className="text-xs text-[#94a3b8] leading-relaxed">
                    {feature.description}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-[#94a3b8] group-hover:text-[#4361EE] mt-1 shrink-0 transition" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

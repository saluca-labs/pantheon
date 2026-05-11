/**
 * Research OS — Hub page.
 *
 * Replaces the legacy default OS shell for /dashboard/os/research with a
 * proper hub: experiments grid (cards w/ cover image, name, status,
 * progress, target date) + a quick-link to the legacy hypothesis ledger.
 *
 * Phase 3 will redesign the hypothesis ledger surface; Phase 1 keeps the
 * existing ledger functional and adds the experiment hub above it.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import Link from 'next/link';
import { FlaskConical, BookOpen } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { listExperimentsForUser } from '@/lib/agentic-os/research/repo';
import { ExperimentList } from '@/components/agentic-os/research/experiment-list';

export const dynamic = 'force-dynamic';

export default async function ResearchHubPage() {
  const user = await getCurrentResearchUser();
  if (!user) redirect('/login');

  // Load both active and archived in one shot so the client-side toggle
  // can switch without a round-trip. 200-row cap mirrors the API ceiling.
  const [active, archived] = await Promise.all([
    listExperimentsForUser(user.userId, { archived: false, limit: 200 }),
    listExperimentsForUser(user.userId, { archived: true, limit: 200 }),
  ]);
  const experiments = [...active, ...archived];

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
    </div>
  );
}

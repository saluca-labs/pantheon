/**
 * Research OS — Hypothesis Ledger page.
 *
 * Server component: loads the authenticated user's hypotheses and hands
 * them to the HypothesisLedger client component.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import Link from 'next/link';
import { ArrowLeft, FlaskConical } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { listHypotheses } from '@/lib/agentic-os/research/repo';
import { HypothesisLedger } from '@/components/agentic-os/research/HypothesisLedger';

export const dynamic = 'force-dynamic';

export default async function ResearchHypothesesPage() {
  const user = await getCurrentResearchUser();
  if (!user) redirect('/login');

  const hypotheses = await listHypotheses(user.userId);

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/research"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Research OS
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <FlaskConical className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">Hypothesis Ledger</h1>
      </div>

      <p className="text-sm text-[#94a3b8] mb-4">
        Track your scientific hypotheses in the standard{' '}
        <span className="italic">If…then…because</span> format. Update status as experiments
        progress from draft through testing to a conclusion.
      </p>

      <div className="rounded-lg border border-[#2a2d3e] bg-[#1a1d27]/60 p-3 mb-6 text-xs text-[#94a3b8]">
        Hypothesis ledger gets a real surface in{' '}
        <span className="text-white font-medium">Phase 3</span> — per-hypothesis detail
        pages, predictions and falsifiers, evidence links, and the experiment ↔ hypothesis
        many-to-many surface land then. Phase 1 keeps this list functional.
      </div>

      <HypothesisLedger initialHypotheses={hypotheses} />
    </div>
  );
}

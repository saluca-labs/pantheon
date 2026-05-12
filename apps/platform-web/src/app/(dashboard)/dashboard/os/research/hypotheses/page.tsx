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

      <p className="text-sm text-[#94a3b8] mb-6">
        Track your scientific hypotheses in the standard{' '}
        <span className="italic">If…then…because</span> format. Click a row to open the
        per-hypothesis detail page — predictions, falsifiers, evidence links, and
        cross-references to the experiments that test it.
      </p>

      <HypothesisLedger initialHypotheses={hypotheses} />
    </div>
  );
}

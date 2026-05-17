/**
 * Research OS Phase 3 — Hypothesis detail page.
 *
 * Server component. Loads the hypothesis + its predictions + falsifiers
 * + evidence + linked experiments in parallel and hands each to a
 * dedicated client section.
 *
 * Layout:
 *   - HypothesisDetailHeader  — If/Then/Because banner, status pill,
 *                               confidence pill, archive button.
 *   - description_md          — react-markdown WITHOUT rehype-raw
 *                               (XSS guard, matches Phase 2 notebook).
 *   - PredictionList          — predictions section.
 *   - FalsifierList           — falsifiers section.
 *   - EvidencePanel           — evidence grouped by polarity.
 *   - HypothesisLinkedExperiments — read-only linked experiments.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { getHypothesis } from '@/lib/agentic-os/research/repo';
import { listPredictionsForHypothesis } from '@/lib/agentic-os/research/predictions-repo';
import { listFalsifiersForHypothesis } from '@/lib/agentic-os/research/falsifiers-repo';
import { listEvidenceForHypothesis } from '@/lib/agentic-os/research/evidence-repo';
import { getResearchPool } from '@/lib/agentic-os/research/session';
import { HypothesisDetailHeader } from '@/components/agentic-os/research/hypothesis-detail-header';
import { PredictionList } from '@/components/agentic-os/research/prediction-list';
import { FalsifierList } from '@/components/agentic-os/research/falsifier-list';
import { EvidencePanel } from '@/components/agentic-os/research/evidence-panel';
import { HypothesisLinkedExperiments } from '@/components/agentic-os/research/hypothesis-linked-experiments';
import { asLinkRole } from '@/lib/agentic-os/research/experiment-hypotheses';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Server-side query for the "linked experiments" section. The
 * experiment-hypotheses repo's existing helpers are experiment-centric;
 * here we want the inverse — every experiment linked to THIS hypothesis,
 * with the experiment name pulled across so the row can render a
 * useful cross-link without the client needing to issue extra
 * requests.
 *
 * Cross-ownership: the JOIN to `agos_research_experiments` filtered by
 * `user_id` is the gate. Rows pointing at another user's experiment
 * are invisible (the EXISTS pattern shipped by Phase 1+2).
 */
async function listExperimentsForHypothesis(hypothesisId: string, userId: string) {
  const pool = getResearchPool();
  interface RawExperimentLinkRow {
    link_id: string;
    experiment_id: string;
    hypothesis_id: string;
    role: string | null;
    notes: string | null;
    created_at: Date | string;
    experiment_name: string;
  }
  const r = await pool.query<RawExperimentLinkRow>(
    `SELECT lk.id          AS link_id,
            lk.experiment_id,
            lk.hypothesis_id,
            lk.role,
            lk.notes,
            lk.created_at,
            e.title         AS experiment_name
       FROM agos_research_experiment_hypotheses lk
       JOIN agos_research_experiments e ON e.id = lk.experiment_id
      WHERE lk.hypothesis_id = $1
        AND e.user_id = $2
      ORDER BY lk.created_at ASC`,
    [hypothesisId, userId],
  );
  return r.rows.map((row) => ({
    experimentId: row.experiment_id as string,
    experimentName: row.experiment_name as string,
    link: {
      id: row.link_id as string,
      experimentId: row.experiment_id as string,
      hypothesisId: row.hypothesis_id as string,
      role: (asLinkRole(row.role) ?? 'tests') as 'tests' | 'motivates' | 'related',
      notes: (row.notes as string | null) ?? null,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
    },
  }));
}

export default async function ResearchHypothesisDetailPage({ params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) redirect('/login');

  const { id } = await params;

  const hypothesis = await getHypothesis(id, user.userId);
  if (!hypothesis) notFound();

  const [predictions, falsifiers, evidence, linkedExperimentsRaw] = await Promise.all([
    listPredictionsForHypothesis(id, user.userId),
    listFalsifiersForHypothesis(id, user.userId),
    listEvidenceForHypothesis(id, user.userId),
    listExperimentsForHypothesis(id, user.userId),
  ]);

  // Hydrate the linked-experiments rows with the hypothesis (already in
  // hand) for the LinkedHypothesisRow component shape.
  const linkedRows = linkedExperimentsRaw.map((r) => ({
    ...r,
    hypothesis,
  }));

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/research/hypotheses"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to hypothesis ledger
      </Link>

      <HypothesisDetailHeader hypothesis={hypothesis} />

      {hypothesis.descriptionMd && hypothesis.descriptionMd.trim() && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide mb-2">
            Description
          </h2>
          <div className="prose prose-invert prose-sm max-w-none rounded-xl border border-border-subtle bg-surface-2 p-5 text-text-primary">
            <ReactMarkdown>{hypothesis.descriptionMd}</ReactMarkdown>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <PredictionList hypothesisId={id} initialPredictions={predictions} />
        <FalsifierList hypothesisId={id} initialFalsifiers={falsifiers} />
      </div>

      <div className="mb-6">
        <EvidencePanel hypothesisId={id} initialEvidence={evidence} />
      </div>

      <HypothesisLinkedExperiments rows={linkedRows} />
    </div>
  );
}

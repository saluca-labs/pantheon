/**
 * Research OS — Experiments list page.
 *
 * Standalone full-bleed surface that mirrors the experiments grid on the
 * Research OS hub. Lives at /dashboard/os/research/experiments so the
 * registry feature card can link directly into the experiment list
 * without bouncing through the hub.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import Link from 'next/link';
import { ArrowLeft, FlaskConical } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { listExperimentsForUser } from '@/lib/agentic-os/research/repo';
import { ExperimentList } from '@/components/agentic-os/research/experiment-list';

export const dynamic = 'force-dynamic';

export default async function ResearchExperimentsListPage() {
  const user = await getCurrentResearchUser();
  if (!user) redirect('/login');

  const [active, archived] = await Promise.all([
    listExperimentsForUser(user.userId, { archived: false, limit: 200 }),
    listExperimentsForUser(user.userId, { archived: true, limit: 200 }),
  ]);
  const experiments = [...active, ...archived];

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/research"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Research OS
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <FlaskConical className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">Experiments</h1>
      </div>

      <p className="text-sm text-[#94a3b8] mb-6">
        Every research project tracks a 5-phase lifecycle (planning → running → analysis →
        write-up → published) plus a soft archive tier. Each experiment is a top-level
        project with its own cover image, tags, target completion date, and team size.
      </p>

      <ExperimentList initialExperiments={experiments} />
    </div>
  );
}

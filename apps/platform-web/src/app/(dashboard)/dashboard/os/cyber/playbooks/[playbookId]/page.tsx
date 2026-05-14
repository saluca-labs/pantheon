/**
 * CyberSec OS — Playbook detail / edit page.
 *
 * Server component. Renders metadata editor + steps editor + start-run button.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, BookText } from 'lucide-react';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { getPlaybook, listPlaybookRuns } from '@/lib/agentic-os/cyber/repo';
import { PlaybookForm } from '@/components/agentic-os/cyber/playbooks/PlaybookForm';
import { PlaybookStepsEditor } from '@/components/agentic-os/cyber/playbooks/PlaybookStepsEditor';
import { StartRunButton } from '@/components/agentic-os/cyber/playbooks/StartRunButton';
import { RunsListPanel } from '@/components/agentic-os/cyber/playbooks/RunsListPanel';

export const dynamic = 'force-dynamic';

export default async function PlaybookDetailPage({
  params,
}: {
  params: Promise<{ playbookId: string }>;
}) {
  const { playbookId } = await params;
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');

  const playbook = await getPlaybook(playbookId, user.userId);
  if (!playbook) notFound();
  const runs = await listPlaybookRuns({ ownerId: user.userId, playbookId, limit: 25 });

  const canStart = playbook.steps.length > 0;

  return (
    <div className="max-w-5xl space-y-6">
      <Link
        href="/dashboard/os/cyber/playbooks"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to playbooks
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BookText className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-semibold text-white">{playbook.name}</h1>
        </div>
        <StartRunButton playbookId={playbook.id} disabled={!canStart} />
      </div>
      {!canStart && (
        <p className="text-xs text-amber-300">
          Add at least one step below before starting a run.
        </p>
      )}

      <PlaybookForm playbook={playbook} />

      <PlaybookStepsEditor playbook={playbook} />

      <section>
        <h2 className="text-sm uppercase tracking-wide text-text-secondary mb-2">
          Runs for this playbook ({runs.length})
        </h2>
        <RunsListPanel runs={runs} />
      </section>
    </div>
  );
}

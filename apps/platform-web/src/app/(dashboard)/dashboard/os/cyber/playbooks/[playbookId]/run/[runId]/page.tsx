/**
 * CyberSec OS — Playbook run wizard page.
 *
 * Server component. Loads the run + step_runs and hands off to the
 * client-side PlaybookRunWizard.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { getPlaybookRun } from '@/lib/agentic-os/cyber/repo';
import { PlaybookRunWizard } from '@/components/agentic-os/cyber/playbooks/PlaybookRunWizard';

export const dynamic = 'force-dynamic';

export default async function PlaybookRunPage({
  params,
}: {
  params: Promise<{ playbookId: string; runId: string }>;
}) {
  const { playbookId, runId } = await params;
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');

  const run = await getPlaybookRun(runId, user.userId);
  if (!run || run.playbookId !== playbookId) notFound();

  return (
    <div className="max-w-5xl space-y-4">
      <Link
        href={`/dashboard/os/cyber/playbooks/${playbookId}`}
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to playbook
      </Link>

      <PlaybookRunWizard run={run} />
    </div>
  );
}

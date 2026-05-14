/**
 * CyberSec OS — Playbook runs index.
 *
 * Server component. Lists user's active + recent runs grouped by status.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, ListChecks } from 'lucide-react';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { listPlaybookRuns } from '@/lib/agentic-os/cyber/repo';
import { RunsListPanel } from '@/components/agentic-os/cyber/playbooks/RunsListPanel';

export const dynamic = 'force-dynamic';

export default async function PlaybookRunsPage() {
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');

  const runs = await listPlaybookRuns({ ownerId: user.userId, limit: 100 });

  return (
    <div className="max-w-6xl">
      <Link
        href="/dashboard/os/cyber"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to CyberSec OS
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <ListChecks className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">Active runs</h1>
      </div>

      <p className="text-sm text-text-secondary mb-6">
        Track in-progress and recent playbook executions across cases.
      </p>

      <RunsListPanel runs={runs} />
    </div>
  );
}

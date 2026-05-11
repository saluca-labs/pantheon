/**
 * CyberSec OS — Playbooks list page.
 *
 * Server component.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, BookText } from 'lucide-react';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { listPlaybooks } from '@/lib/agentic-os/cyber/repo';
import { PlaybooksManager } from '@/components/agentic-os/cyber/playbooks/PlaybooksManager';

export const dynamic = 'force-dynamic';

export default async function CyberPlaybooksPage() {
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');

  const playbooks = await listPlaybooks({ ownerId: user.userId });

  return (
    <div className="max-w-6xl">
      <Link
        href="/dashboard/os/cyber"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to CyberSec OS
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <BookText className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">Playbooks</h1>
      </div>

      <p className="text-sm text-[#94a3b8] mb-6">
        Response playbooks. Each playbook is an orderable list of steps
        (checklist / input / decision / runbook step) that can be executed as a
        run with full per-step audit.
      </p>

      <PlaybooksManager initialPlaybooks={playbooks} />
    </div>
  );
}

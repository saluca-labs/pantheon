/**
 * CyberSec OS — Cases list page.
 *
 * Server component. Lists owner-scoped cases with attached counts; the
 * client-side CasesManager owns filters + the "New case" toggle.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Briefcase } from 'lucide-react';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { listCases } from '@/lib/agentic-os/cyber/repo';
import { CasesManager } from '@/components/agentic-os/cyber/cases/CasesManager';

export const dynamic = 'force-dynamic';

export default async function CyberCasesPage() {
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');

  const cases = await listCases({
    ownerId: user.userId,
    limit: 500,
  });

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
        <Briefcase className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">Cases</h1>
      </div>

      <p className="text-sm text-[#94a3b8] mb-6">
        Investigation cases linking alerts, evidence, tasks, and a chronological
        timeline. Use cases to coordinate response across multiple alerts and to
        preserve a full audit trail of decisions and findings.
      </p>

      <CasesManager initialCases={cases} />
    </div>
  );
}

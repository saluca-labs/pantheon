/**
 * CyberSec OS — Vulnerabilities list page.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Bug } from 'lucide-react';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { listVulnerabilities } from '@/lib/agentic-os/cyber/repo';
import { VulnerabilitiesManager } from '@/components/agentic-os/cyber/vulnerabilities/VulnerabilitiesManager';

export const dynamic = 'force-dynamic';

export default async function CyberVulnerabilitiesPage() {
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');
  const vulnerabilities = await listVulnerabilities({ ownerId: user.userId, limit: 500 });

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
        <Bug className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">Vulnerabilities</h1>
      </div>
      <p className="text-sm text-[#94a3b8] mb-6">
        Vulnerability registry — CVE + CVSS + CWE catalogue. Each entry can
        link to many assets via exposures.
      </p>
      <VulnerabilitiesManager initialVulns={vulnerabilities} />
    </div>
  );
}

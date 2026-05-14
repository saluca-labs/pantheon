/**
 * CyberSec OS — Vulnerability importer page (Trivy / OpenVAS JSON).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Upload } from 'lucide-react';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { VulnerabilityImporter } from '@/components/agentic-os/cyber/vulnerabilities/VulnerabilityImporter';

export const dynamic = 'force-dynamic';

export default async function CyberVulnImportPage() {
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');
  return (
    <div className="max-w-6xl">
      <Link
        href="/dashboard/os/cyber/vulnerabilities"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to vulnerabilities
      </Link>
      <div className="flex items-center gap-3 mb-6">
        <Upload className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">Import vulnerabilities</h1>
      </div>
      <p className="text-sm text-text-secondary mb-6 max-w-2xl">
        Paste a Trivy or OpenVAS JSON report below. Each CVE-keyed
        vulnerability is upserted by (owner, cve_id); non-CVE findings are
        inserted as new rows. Parse errors are reported per-row without
        blocking the rest of the import.
      </p>
      <VulnerabilityImporter />
    </div>
  );
}

/**
 * CyberSec OS — Vulnerability detail page.
 *
 * Shows metadata + linked exposures + "Add exposure" form.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Bug } from 'lucide-react';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  getVulnerability,
  listAssets,
  listExposuresByVuln,
} from '@/lib/agentic-os/cyber/repo';
import { ExposureForm } from '@/components/agentic-os/cyber/exposures/ExposureForm';
import { ExposureCard } from '@/components/agentic-os/cyber/exposures/ExposureCard';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ vulnId: string }>;
}

export default async function VulnerabilityDetailPage({ params }: Props) {
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');
  const { vulnId } = await params;
  const vuln = await getVulnerability(vulnId, user.userId);
  if (!vuln) notFound();
  const [assets, exposures] = await Promise.all([
    listAssets({ ownerId: user.userId, limit: 500 }),
    listExposuresByVuln(vulnId, user.userId),
  ]);

  return (
    <div className="max-w-6xl">
      <Link
        href="/dashboard/os/cyber/vulnerabilities"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to vulnerabilities
      </Link>
      <div className="flex items-center gap-3 mb-6">
        <Bug className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">
          {vuln.cveId ?? '—'} · {vuln.title}
        </h1>
      </div>
      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 mb-6 space-y-2">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <Field label="Severity" value={vuln.severity} />
          <Field label="CVSS" value={vuln.cvssScore != null ? String(vuln.cvssScore) : '—'} />
          <Field label="CWE" value={vuln.cweId ?? '—'} />
          <Field label="Vendor" value={vuln.vendor ?? '—'} />
          <Field label="Product" value={vuln.product ?? '—'} />
          <Field label="Published" value={vuln.publishedAt ? vuln.publishedAt.slice(0, 10) : '—'} />
          <Field label="Affected versions" value={(vuln.affectedVersions ?? []).join(', ') || '—'} />
          <Field label="Fixed versions" value={(vuln.fixedVersions ?? []).join(', ') || '—'} />
        </div>
        {vuln.description && (
          <p className="text-sm text-[#cbd5e1] pt-2 border-t border-[#2a2d3e]">{vuln.description}</p>
        )}
        {vuln.references.length > 0 && (
          <div className="pt-2 border-t border-[#2a2d3e]">
            <p className="text-[10px] uppercase tracking-wide text-[#94a3b8] mb-1">References</p>
            <ul className="text-xs text-[#4361EE] space-y-1">
              {vuln.references.map((r) => (
                <li key={r}><a href={r} target="_blank" rel="noreferrer">{r}</a></li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <h2 className="text-lg font-semibold text-white mb-3">Add exposure</h2>
      <div className="mb-6">
        <ExposureForm vulnerability={vuln} assets={assets} />
      </div>

      <h2 className="text-lg font-semibold text-white mb-3">Exposures ({exposures.length})</h2>
      {exposures.length === 0 ? (
        <p className="text-sm text-[#94a3b8] p-6 rounded-xl border border-dashed border-[#2a2d3e]">
          No exposures linked yet. Use the form above to link an asset.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {exposures.map((e) => (
            <ExposureCard key={e.id} exposure={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-[#94a3b8]">{label}</p>
      <p className="text-white">{value}</p>
    </div>
  );
}

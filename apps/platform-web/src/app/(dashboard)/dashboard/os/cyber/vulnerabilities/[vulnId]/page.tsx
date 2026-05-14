/**
 * CyberSec OS — Vulnerability detail page.
 *
 * Shows metadata + linked exposures + "Add exposure" form.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Bug, Crosshair } from 'lucide-react';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  getVulnerability,
  listAssets,
  listExposuresByVuln,
} from '@/lib/agentic-os/cyber/repo';
import { ExposureForm } from '@/components/agentic-os/cyber/exposures/ExposureForm';
import { ExposureCard } from '@/components/agentic-os/cyber/exposures/ExposureCard';
import { EmptyState } from '@/components/agentic-os/_shared/views';

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
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to vulnerabilities
      </Link>
      <div className="flex items-center gap-3 mb-6">
        <Bug className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">
          {vuln.cveId ?? '—'} · {vuln.title}
        </h1>
      </div>
      <div className="rounded-xl border border-border-subtle bg-surface-2 p-4 mb-6 space-y-2">
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
          <p className="text-sm text-text-primary pt-2 border-t border-border-subtle">{vuln.description}</p>
        )}
        {vuln.references.length > 0 && (
          <div className="pt-2 border-t border-border-subtle">
            <p className="text-[10px] uppercase tracking-wide text-text-secondary mb-1">References</p>
            <ul className="text-xs text-accent space-y-1">
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
        <EmptyState
          icon={<Crosshair className="h-6 w-6" />}
          title="No exposures linked yet"
          description="Use the form above to link this vulnerability to an affected asset and start tracking remediation."
        />
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
      <p className="text-[10px] uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="text-white">{value}</p>
    </div>
  );
}

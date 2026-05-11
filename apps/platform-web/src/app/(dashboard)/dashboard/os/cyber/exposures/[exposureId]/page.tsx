/**
 * CyberSec OS — Exposure detail page.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { getExposure } from '@/lib/agentic-os/cyber/repo';
import { ExposureForm } from '@/components/agentic-os/cyber/exposures/ExposureForm';
import { CloseExposureDialog } from '@/components/agentic-os/cyber/exposures/CloseExposureDialog';
import { ExposureStatusBadge } from '@/components/agentic-os/cyber/exposures/ExposureStatusBadge';
import { isExposureClosed } from '@/lib/agentic-os/cyber/exposures';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ exposureId: string }>;
}

export default async function ExposureDetailPage({ params }: Props) {
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');
  const { exposureId } = await params;
  const exposure = await getExposure(exposureId, user.userId);
  if (!exposure) notFound();

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/cyber/exposures"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to exposures
      </Link>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <AlertTriangle className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">
          {exposure.vulnerabilityCveId ?? '—'} · {exposure.vulnerabilityTitle}
        </h1>
        <ExposureStatusBadge status={exposure.status} />
      </div>
      <p className="text-sm text-[#94a3b8] mb-6">
        Asset: <Link href={`/dashboard/os/cyber/assets/${exposure.assetId}`} className="text-white hover:underline">{exposure.assetName}</Link>
        {' · '}
        <Link href={`/dashboard/os/cyber/vulnerabilities/${exposure.vulnerabilityId}`} className="text-white hover:underline">View vulnerability</Link>
      </p>
      <div className="space-y-6">
        <ExposureForm exposure={exposure} />
        {!isExposureClosed(exposure) && (
          <CloseExposureDialog exposureId={exposure.id} />
        )}
      </div>
    </div>
  );
}

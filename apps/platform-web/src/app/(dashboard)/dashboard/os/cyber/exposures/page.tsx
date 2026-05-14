/**
 * CyberSec OS — Exposures board (all vuln × asset pairings).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { listExposures } from '@/lib/agentic-os/cyber/repo';
import { ExposuresManager } from '@/components/agentic-os/cyber/exposures/ExposuresManager';

export const dynamic = 'force-dynamic';

export default async function CyberExposuresPage() {
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');
  const exposures = await listExposures({ ownerId: user.userId, limit: 500 });
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
        <AlertTriangle className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">Exposures</h1>
      </div>
      <p className="text-sm text-text-secondary mb-6">
        Each row is one vulnerability landing on one asset. Track remediation
        state through six statuses (open → in_progress → mitigated/resolved).
      </p>
      <ExposuresManager initialExposures={exposures} />
    </div>
  );
}

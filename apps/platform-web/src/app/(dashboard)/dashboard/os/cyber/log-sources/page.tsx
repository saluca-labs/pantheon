/**
 * CyberSec OS — Log sources list.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Database } from 'lucide-react';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { listLogSources } from '@/lib/agentic-os/cyber/repo';
import { LogSourcesManager } from '@/components/agentic-os/cyber/LogSourcesManager';

export const dynamic = 'force-dynamic';

export default async function CyberLogSourcesPage() {
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');

  const sources = await listLogSources({ ownerId: user.userId });

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/cyber"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to CyberSec OS
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <Database className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">Log sources</h1>
      </div>

      <p className="text-sm text-text-secondary mb-6">
        Upstream systems that emit alerts: SIEM, EDR, IDS, cloud audit logs, firewall,
        application logs, identity providers, webhooks. Phase 1 is informational —
        actual ingestion ships in Phase 6.
      </p>

      <LogSourcesManager initialSources={sources} />
    </div>
  );
}

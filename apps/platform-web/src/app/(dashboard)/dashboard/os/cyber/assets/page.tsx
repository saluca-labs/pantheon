/**
 * CyberSec OS — Assets list.
 *
 * Server component: lists owner-scoped assets. Filtering is performed
 * client-side from a serialized list passed in via the AssetsManager
 * component (kept simple for Phase 1 — no server pagination beyond limit).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Server } from 'lucide-react';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { listAssets } from '@/lib/agentic-os/cyber/repo';
import { AssetsManager } from '@/components/agentic-os/cyber/AssetsManager';

export const dynamic = 'force-dynamic';

export default async function CyberAssetsPage() {
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');

  const assets = await listAssets({
    ownerId: user.userId,
    limit: 500,
    includeDecommissioned: true,
  });

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
        <Server className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">Assets</h1>
      </div>

      <p className="text-sm text-text-secondary mb-6">
        Hosts, containers, cloud resources, accounts, repos, and other entities under
        protection. Assets are linked from alerts to give every detection a target context.
      </p>

      <AssetsManager initialAssets={assets} />
    </div>
  );
}

/**
 * CyberSec OS — Asset groups list.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Boxes } from 'lucide-react';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { listAssetGroups, listAssets } from '@/lib/agentic-os/cyber/repo';
import { AssetGroupsManager } from '@/components/agentic-os/cyber/AssetGroupsManager';

export const dynamic = 'force-dynamic';

export default async function CyberAssetGroupsPage() {
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');

  const [groups, assets] = await Promise.all([
    listAssetGroups({ ownerId: user.userId }),
    listAssets({ ownerId: user.userId, limit: 500 }),
  ]);

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/cyber"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to CyberSec OS
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <Boxes className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">Asset groups</h1>
      </div>

      <p className="text-sm text-text-secondary mb-6">
        Lightweight named groupings — bundle related assets so future phases (case
        management, response playbooks) can scope actions to multiple assets at once.
      </p>

      <AssetGroupsManager initialGroups={groups} assets={assets} ownerId={user.userId} />
    </div>
  );
}

/**
 * CyberSec OS — IOC catalog page.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Globe } from 'lucide-react';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { searchIocs } from '@/lib/agentic-os/cyber/repo';
import { IocsManager } from '@/components/agentic-os/cyber/iocs/IocsManager';

export const dynamic = 'force-dynamic';

export default async function CyberIocsPage() {
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');
  const iocs = await searchIocs({ ownerId: user.userId, limit: 500 });
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
        <Globe className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">IOCs</h1>
      </div>
      <p className="text-sm text-[#94a3b8] mb-6">
        Indicator-of-compromise catalogue — IPs, domains, file hashes, URLs,
        and more. Each IOC carries a per-kind regex validation, confidence,
        and optional expiry; trends matches them against incoming alerts.
      </p>
      <IocsManager initialIocs={iocs} />
    </div>
  );
}

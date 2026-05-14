/**
 * CyberSec OS — Detections list page.
 *
 * Server component. Fetches owner-scoped detection rules; the client-side
 * DetectionsManager owns filters + the "New rule" toggle.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Shield } from 'lucide-react';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { listDetectionRules } from '@/lib/agentic-os/cyber/repo';
import { DetectionsManager } from '@/components/agentic-os/cyber/detections/DetectionsManager';

export const dynamic = 'force-dynamic';

export default async function CyberDetectionsPage() {
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');

  const rules = await listDetectionRules({ ownerId: user.userId, limit: 500 });

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
        <Shield className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">Detection rules</h1>
      </div>

      <p className="text-sm text-text-secondary mb-6">
        Sigma-style detection registry. Author rules with MITRE tactic / technique
        tags and shepherd them through a draft → testing → active lifecycle.
      </p>

      <DetectionsManager initialRules={rules} />
    </div>
  );
}

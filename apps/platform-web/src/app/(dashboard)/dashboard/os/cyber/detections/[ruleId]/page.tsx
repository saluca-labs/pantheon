/**
 * CyberSec OS — Detection rule detail page.
 *
 * Server component. Rule metadata editor (DetectionRuleForm) + recent runs.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Shield } from 'lucide-react';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { getDetectionRule, listDetectionRuns } from '@/lib/agentic-os/cyber/repo';
import { DetectionRuleForm } from '@/components/agentic-os/cyber/detections/DetectionRuleForm';
import { DetectionRunHistory } from '@/components/agentic-os/cyber/detections/DetectionRunHistory';

export const dynamic = 'force-dynamic';

export default async function DetectionRuleDetailPage({
  params,
}: {
  params: Promise<{ ruleId: string }>;
}) {
  const { ruleId } = await params;
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');

  const rule = await getDetectionRule(ruleId, user.userId);
  if (!rule) notFound();
  const runs = await listDetectionRuns({ ruleId, ownerId: user.userId, limit: 50 });

  return (
    <div className="max-w-5xl space-y-6">
      <Link
        href="/dashboard/os/cyber/detections"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to detections
      </Link>

      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">{rule.name}</h1>
      </div>

      <DetectionRuleForm rule={rule} />

      <section>
        <h2 className="text-sm uppercase tracking-wide text-[#94a3b8] mb-2">
          Recent runs ({runs.length})
        </h2>
        <DetectionRunHistory runs={runs} />
      </section>
    </div>
  );
}

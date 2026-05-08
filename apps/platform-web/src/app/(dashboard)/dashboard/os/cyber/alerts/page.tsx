/**
 * CyberSec OS — Alert Triage Queue page.
 *
 * Server component: loads alerts for the authenticated user (seeding sample
 * alerts on first visit) and renders the AlertTriageQueue client component.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { listAlerts, hasAlerts, createAlert } from '@/lib/agentic-os/cyber/repo';
import { sampleAlerts } from '@/lib/agentic-os/cyber/triage';
import { AlertTriageQueue } from '@/components/agentic-os/cyber/AlertTriageQueue';

export const dynamic = 'force-dynamic';

export default async function CyberAlertsPage() {
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');

  // Seed sample alerts on first visit so the queue isn't empty.
  const seeded = await hasAlerts(user.userId);
  if (!seeded) {
    const seeds = sampleAlerts();
    await Promise.all(seeds.map((s) => createAlert(user.userId, s)));
  }

  const alerts = await listAlerts(user.userId);

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/cyber"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to CyberSec OS
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <ShieldAlert className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">Alert Triage Queue</h1>
      </div>

      <p className="text-sm text-[#94a3b8] mb-6">
        Review and triage security alerts sorted by severity. Assign alerts to analysts, add
        investigation notes, and close or mark them as false positives.
      </p>

      <AlertTriageQueue initialAlerts={alerts} />
    </div>
  );
}

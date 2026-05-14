/**
 * Agentic OS — Audit log page.
 *
 * Server component: ensures the user is authenticated and renders the
 * AuditViewer client component which handles all data fetching from
 * /api/tiresias/agentic-os/audit.
 *
 * @license MIT — Tiresias platform (internal).
 */

import Link from 'next/link';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentAuditUser } from '@/lib/agentic-os/audit/session';
import { AuditViewer } from '@/components/agentic-os/audit/audit-viewer';

export const dynamic = 'force-dynamic';

export default async function AuditLogPage() {
  const user = await getCurrentAuditUser();
  if (!user) redirect('/login');

  return (
    <div className="max-w-6xl">
      <Link
        href="/dashboard/os"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-secondary transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Agentic OS
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <ClipboardList className="h-6 w-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">Audit log</h1>
      </div>

      <p className="mb-6 text-sm text-text-secondary">
        Every action the per-OS BFF routes record — creates, updates, status changes — lands in the
        shared <code className="font-mono text-xs">agos_audit</code> table. This view is filterable
        by OS, action, and a date range, and only shows entries actor-tagged to your user.
      </p>

      <AuditViewer />
    </div>
  );
}

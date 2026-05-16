/**
 * Business OS Phase 1 — settings editor page.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import Link from 'next/link';
import { ArrowLeft, Settings as SettingsIcon } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { getOrCreateSettings } from '@/lib/agentic-os/business/settings-repo';
import { BusinessSettingsForm } from '@/components/agentic-os/business/business-settings-form';

export const dynamic = 'force-dynamic';

export default async function BusinessSettingsPage() {
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const { settings } = await getOrCreateSettings(user.userId);

  return (
    <div className="max-w-3xl">
      <Link
        href="/dashboard/os/business"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Business OS
      </Link>

      <div className="flex items-center gap-3 mb-1">
        <SettingsIcon className="w-6 h-6 text-os-business" />
        <h1 className="text-2xl font-semibold text-white">Business settings</h1>
      </div>
      <p className="text-sm text-text-secondary mb-6">
        Workshop-global settings used by future phases (invoice / quote
        rendering, PDF chrome, default currency, hourly rate).  Changes
        apply immediately to new documents.
      </p>

      <BusinessSettingsForm initial={settings} />
    </div>
  );
}

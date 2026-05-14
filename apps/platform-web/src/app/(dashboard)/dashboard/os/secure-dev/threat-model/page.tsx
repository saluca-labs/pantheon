/**
 * Secure-Dev OS — STRIDE Threat Model page.
 *
 * Server component: authenticates and renders the ThreatModelWalkthrough
 * client component.
 *
 * @license MIT — Tiresias Secure-Dev OS (internal).
 */

import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentSecureDevUser } from '@/lib/agentic-os/secure-dev/session';
import { ThreatModelWalkthrough } from '@/components/agentic-os/secure-dev/ThreatModelWalkthrough';

export const dynamic = 'force-dynamic';

export default async function SecureDevThreatModelPage() {
  const user = await getCurrentSecureDevUser();
  if (!user) redirect('/login');

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/secure-dev"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Secure Dev OS
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">STRIDE Threat Model</h1>
      </div>

      <p className="text-sm text-text-secondary mb-6">
        Describe your system and get an instant STRIDE checklist of threats to consider,
        each with mitigations and public references. Powered by a rules-based engine —
        no LLM, deterministic output.
      </p>

      <ThreatModelWalkthrough />
    </div>
  );
}

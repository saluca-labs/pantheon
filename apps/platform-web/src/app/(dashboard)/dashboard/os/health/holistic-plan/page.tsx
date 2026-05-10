import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import { isCoachConfigured } from '@/lib/agentic-os/health/coach/anthropic';
import { CaveatBlock } from '@/components/agentic-os/health/caveat-block';
import { HolisticPlanGenerator } from '@/components/agentic-os/health/coach/holistic-plan';
import { CoachConfigNotice } from '@/components/agentic-os/health/coach/coach-config-notice';

export const dynamic = 'force-dynamic';

export default async function HolisticPlanPage() {
  const user = await getCurrentHealthUser();
  if (!user) redirect('/login');

  const configured = isCoachConfigured();

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/health"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Health OS
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <Sparkles className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">Holistic plan</h1>
      </div>

      <CaveatBlock />

      <div className="mt-6 rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6">
        {configured ? <HolisticPlanGenerator /> : <CoachConfigNotice />}
      </div>
    </div>
  );
}

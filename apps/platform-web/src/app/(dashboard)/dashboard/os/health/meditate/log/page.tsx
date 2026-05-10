import Link from 'next/link';
import { ArrowLeft, Brain } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import { getActiveConsent } from '@/lib/agentic-os/health/repo';
import { MeditationLogForm } from '@/components/agentic-os/health/meditate/meditation-log-form';

export const dynamic = 'force-dynamic';

export default async function MeditationLogPage() {
  const user = await getCurrentHealthUser();
  if (!user) redirect('/login');

  const mentalConsent = await getActiveConsent(
    user.userId,
    user.tenantId,
    'mental',
  );
  if (!mentalConsent?.granted) {
    redirect('/dashboard/os/health/meditate');
  }

  return (
    <div className="max-w-2xl">
      <Link
        href="/dashboard/os/health/meditate"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to meditate
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <Brain className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">Log a session</h1>
      </div>

      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6">
        <MeditationLogForm />
      </div>
    </div>
  );
}

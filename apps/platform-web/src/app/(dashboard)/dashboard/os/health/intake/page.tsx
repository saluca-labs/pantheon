import Link from 'next/link';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import { getProfile } from '@/lib/agentic-os/health/repo';
import { CaveatBlock } from '@/components/agentic-os/health/caveat-block';
import { IntakeForm } from '@/components/agentic-os/health/intake-form';

export const dynamic = 'force-dynamic';

export default async function HealthIntakePage() {
  const user = await getCurrentHealthUser();
  if (!user) redirect('/login');

  const profile = await getProfile(user.userId);

  return (
    <div className="max-w-3xl">
      <Link
        href="/dashboard/os/health"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Health OS
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <ClipboardList className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">Intake & profile</h1>
      </div>

      <CaveatBlock />

      <div className="mt-6 rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6">
        <IntakeForm initial={profile} />
      </div>
    </div>
  );
}

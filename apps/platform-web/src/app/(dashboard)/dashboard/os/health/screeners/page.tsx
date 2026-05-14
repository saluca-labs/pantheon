import Link from 'next/link';
import { ArrowLeft, BrainCircuit } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import { listScreeners } from '@/lib/agentic-os/health/repo';
import { CaveatBlock } from '@/components/agentic-os/health/caveat-block';
import { ScreenerWizard } from '@/components/agentic-os/health/screener-wizard';
import { ScreenerHistory } from '@/components/agentic-os/health/screener-history';

export const dynamic = 'force-dynamic';

export default async function HealthScreenersPage() {
  const user = await getCurrentHealthUser();
  if (!user) redirect('/login');

  const history = await listScreeners(user.userId, 25);

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/health"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Health OS
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <BrainCircuit className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">Mental health screeners</h1>
      </div>

      <CaveatBlock />

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border-subtle bg-surface-2 p-6">
          <ScreenerWizard screener="phq9" />
        </div>
        <div className="rounded-xl border border-border-subtle bg-surface-2 p-6">
          <ScreenerWizard screener="gad7" />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border-subtle bg-surface-2 p-6">
        <h2 className="text-lg font-semibold text-white mb-3">History</h2>
        <ScreenerHistory items={history} />
      </div>
    </div>
  );
}

import Link from 'next/link';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  getMentalProfile,
  getProfile,
} from '@/lib/agentic-os/health/repo';
import { CaveatBlock } from '@/components/agentic-os/health/caveat-block';
import { IntakeForm } from '@/components/agentic-os/health/intake-form';
import { MentalIntakeForm } from '@/components/agentic-os/health/mental-intake-form';

export const dynamic = 'force-dynamic';

type Phase = 'physical' | 'mental';

interface SearchParams {
  phase?: string;
}

interface Props {
  searchParams: Promise<SearchParams>;
}

export default async function HealthIntakePage({ searchParams }: Props) {
  const user = await getCurrentHealthUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const phase: Phase = params.phase === 'mental' ? 'mental' : 'physical';

  const [profile, mentalProfile, mentalConsent] = await Promise.all([
    getProfile(user.userId),
    getMentalProfile(user.userId, user.tenantId),
    getActiveConsent(user.userId, user.tenantId, 'mental'),
  ]);

  const mentalConsentGranted = !!mentalConsent?.granted;

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

      {/* Wizard step indicator. State is carried via the `phase` query
          param so the back/forward buttons survive page refreshes. */}
      <nav className="mb-5 grid grid-cols-2 gap-2 text-xs">
        <PhaseLink
          label="Phase A — Physical"
          phase="physical"
          active={phase === 'physical'}
        />
        <PhaseLink
          label="Phase B — Mental health"
          phase="mental"
          active={phase === 'mental'}
        />
      </nav>

      <CaveatBlock />

      {phase === 'physical' ? (
        <>
          <div className="mt-6 rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6">
            <IntakeForm initial={profile} />
          </div>
          <div className="mt-4 flex justify-end">
            <Link
              href="/dashboard/os/health/intake?phase=mental"
              className="text-sm font-medium text-[#4361EE] hover:text-[#5d7aff] transition"
            >
              Continue to mental-health intake →
            </Link>
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6">
          {mentalConsentGranted ? (
            <MentalIntakeForm initial={mentalProfile} />
          ) : (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100/90">
              <p className="font-medium mb-1">Mental-health consent required</p>
              <p className="text-xs leading-relaxed">
                Mental-health features are gated behind explicit consent. Grant
                the “mental” scope on the{' '}
                <Link
                  href="/dashboard/os/health"
                  className="underline hover:text-amber-100"
                >
                  Health OS hub
                </Link>{' '}
                to continue.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PhaseLink({
  label,
  phase,
  active,
}: {
  label: string;
  phase: Phase;
  active: boolean;
}) {
  const cls = active
    ? 'rounded-md border border-[#4361EE]/60 bg-[#4361EE]/15 text-white'
    : 'rounded-md border border-[#2a2d3e] bg-[#0f1117] text-[#94a3b8] hover:text-white hover:border-[#4361EE]/40';
  return (
    <Link
      href={`/dashboard/os/health/intake?phase=${phase}`}
      className={`${cls} px-3 py-2 text-center font-medium transition`}
    >
      {label}
    </Link>
  );
}

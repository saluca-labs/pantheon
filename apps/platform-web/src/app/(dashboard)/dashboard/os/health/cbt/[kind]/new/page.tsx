import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  getCbtExercise,
  type CbtKindValue,
} from '@/lib/agentic-os/health/repo';
import { CBT_KIND_VALUES } from '@/lib/agentic-os/health/schemas';
import { ThoughtRecordWizard } from '@/components/agentic-os/health/cbt/wizards/thought-record-wizard';
import { BehavioralActivationForm } from '@/components/agentic-os/health/cbt/wizards/behavioral-activation-form';
import { WorryTimeTimer } from '@/components/agentic-os/health/cbt/wizards/worry-time-timer';
import { Grounding54321 } from '@/components/agentic-os/health/cbt/wizards/grounding-54321';
import { GratitudeForm } from '@/components/agentic-os/health/cbt/wizards/gratitude-form';
import { ValuesClarifier } from '@/components/agentic-os/health/cbt/wizards/values-clarifier';
import { SleepHygieneChecklist } from '@/components/agentic-os/health/cbt/wizards/sleep-hygiene-checklist';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ step?: string }>;
}

function isCbtKind(value: string): value is CbtKindValue {
  return (CBT_KIND_VALUES as readonly string[]).includes(value);
}

export default async function NewCbtLogPage({ params, searchParams }: PageProps) {
  const { kind: rawKind } = await params;
  const { step } = await searchParams;
  if (!isCbtKind(rawKind)) notFound();
  const kind = rawKind;

  const user = await getCurrentHealthUser();
  if (!user) redirect('/login');

  const mentalConsent = await getActiveConsent(
    user.userId,
    user.tenantId,
    'mental',
  );
  if (!mentalConsent?.granted) {
    redirect('/dashboard/os/health/cbt');
  }

  const exercise = await getCbtExercise(kind);

  return (
    <div className="max-w-3xl">
      <Link
        href="/dashboard/os/health/cbt"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to CBT
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <Sparkles className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">
          {exercise?.name ?? kind}
        </h1>
      </div>
      {exercise?.description && (
        <p className="text-sm text-text-secondary mb-5 leading-relaxed">
          {exercise.description}
        </p>
      )}

      <div className="rounded-xl border border-border-subtle bg-surface-2 p-6">
        {kind === 'thought-record' && (
          <ThoughtRecordWizard
            exerciseId={exercise?.id}
            step={step}
          />
        )}
        {kind === 'behavioral-activation' && (
          <BehavioralActivationForm exerciseId={exercise?.id} />
        )}
        {kind === 'worry-time' && (
          <WorryTimeTimer exerciseId={exercise?.id} />
        )}
        {kind === 'grounding-54321' && (
          <Grounding54321
            exerciseId={exercise?.id}
            step={step}
          />
        )}
        {kind === 'gratitude' && <GratitudeForm exerciseId={exercise?.id} />}
        {kind === 'values-clarification' && (
          <ValuesClarifier exerciseId={exercise?.id} />
        )}
        {kind === 'sleep-hygiene' && (
          <SleepHygieneChecklist exerciseId={exercise?.id} />
        )}
      </div>

      {exercise?.citation && (
        <p className="text-[10px] text-text-secondary/70 mt-3 leading-relaxed">
          Source: {exercise.citation}
        </p>
      )}
    </div>
  );
}

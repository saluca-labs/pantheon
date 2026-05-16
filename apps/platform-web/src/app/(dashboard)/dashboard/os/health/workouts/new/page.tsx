import Link from 'next/link';
import { ArrowLeft, Dumbbell } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import { getActiveConsent } from '@/lib/agentic-os/health/repo';
import { WorkoutEditor } from '@/components/agentic-os/health/activity/workout-editor';

export const dynamic = 'force-dynamic';

export default async function NewWorkoutPage() {
  const user = await getCurrentHealthUser();
  if (!user) redirect('/login');

  const mentalConsent = await getActiveConsent(
    user.userId,
    user.tenantId,
    'mental',
  );
  if (!mentalConsent?.granted) {
    return (
      <div className="max-w-3xl">
        <Link
          href="/dashboard/os/health/workouts"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Workouts
        </Link>
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-6 text-sm text-warning/90">
          Mental-health consent required.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/health/workouts"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Workouts
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <Dumbbell className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">New workout</h1>
      </div>
      <p className="text-sm text-text-secondary mb-5">
        Save the workout header first, then add blocks (exercises, rests,
        notes).
      </p>

      <WorkoutEditor initialTemplate={null} />
    </div>
  );
}

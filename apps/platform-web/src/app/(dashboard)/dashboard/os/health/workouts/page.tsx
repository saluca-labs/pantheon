import Link from 'next/link';
import { ArrowLeft, Dumbbell } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  listWorkoutTemplates,
} from '@/lib/agentic-os/health/repo';
import { CaveatBlock } from '@/components/agentic-os/health/caveat-block';
import {
  WorkoutLibrary,
  type WorkoutLibraryItem,
} from '@/components/agentic-os/health/activity/workout-library';

export const dynamic = 'force-dynamic';

export default async function HealthWorkoutsPage() {
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
          href="/dashboard/os/health"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Health OS
        </Link>
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-6 text-sm text-warning/90">
          <h1 className="text-lg font-semibold text-warning mb-2">
            Mental-health consent required
          </h1>
          <p className="leading-relaxed">
            Workouts are gated behind your mental-health consent. Grant the
            &ldquo;mental&rdquo; scope on the Health OS hub to continue.
          </p>
        </div>
      </div>
    );
  }

  const templates = await listWorkoutTemplates({
    tenantId: user.tenantId,
    userId: user.userId,
    limit: 200,
  });

  const items: WorkoutLibraryItem[] = templates.map((t) => ({
    id: t.id,
    source: t.source,
    name: t.name,
    category: t.category,
    description: t.description,
    targetIntensity: t.targetIntensity,
    estDurationMin: t.estDurationMin,
    tags: t.tags,
    blockCount: t.blockCount ?? null,
  }));

  return (
    <div className="max-w-6xl">
      <Link
        href="/dashboard/os/health"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Health OS
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <Dumbbell className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">Workouts</h1>
      </div>
      <p className="text-sm text-text-secondary mb-5 leading-relaxed">
        Built-in workouts you can use as-is, plus your custom templates.
        &ldquo;Use as starting point&rdquo; clones a built-in into your own
        editable copy.
      </p>

      <CaveatBlock />

      <div className="mt-6">
        <WorkoutLibrary initialTemplates={items} />
      </div>
    </div>
  );
}

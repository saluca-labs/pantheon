import Link from 'next/link';
import { ArrowLeft, CalendarRange } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  getActivityPlanForWeek,
  listWorkoutTemplates,
  mondayOf,
} from '@/lib/agentic-os/health/repo';
import { CaveatBlock } from '@/components/agentic-os/health/caveat-block';
import { ActivityPlanCalendar } from '@/components/agentic-os/health/activity/activity-plan-calendar';
import { ActivitySuggestionCard } from '@/components/agentic-os/health/activity/activity-suggestion-card';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ week?: string }>;
}

export default async function ActivityPlanPage({ searchParams }: PageProps) {
  const { week } = await searchParams;
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
        </div>
      </div>
    );
  }

  const weekStart = mondayOf(week ?? new Date().toISOString().slice(0, 10));
  const [plan, templates] = await Promise.all([
    getActivityPlanForWeek(user.tenantId, user.userId, weekStart),
    listWorkoutTemplates({
      tenantId: user.tenantId,
      userId: user.userId,
      limit: 200,
    }),
  ]);

  const calendarPlan = plan
    ? {
        id: plan.id,
        weekStartDate: plan.weekStartDate,
        name: plan.name,
        notes: plan.notes,
        slots: (plan.slots ?? []).map((s) => ({
          id: s.id,
          dayOfWeek: s.dayOfWeek,
          templateId: s.templateId,
          template: s.template
            ? {
                id: s.template.id,
                name: s.template.name,
                category: s.template.category,
                targetIntensity: s.template.targetIntensity,
                estDurationMin: s.template.estDurationMin,
              }
            : null,
          freeformText: s.freeformText,
          targetDurationMin: s.targetDurationMin,
          targetIntensity: s.targetIntensity,
          notes: s.notes,
          position: s.position,
        })),
      }
    : null;

  return (
    <div className="max-w-7xl">
      <Link
        href="/dashboard/os/health"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Health OS
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <CalendarRange className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">Activity plan</h1>
      </div>
      <p className="text-sm text-text-secondary mb-5">
        Plan the week with workout templates or freeform sessions. &ldquo;I
        did this&rdquo; converts a planned slot into an activity-log entry on
        the matching day.
      </p>

      <CaveatBlock />

      <div className="mt-5 mb-5">
        <ActivitySuggestionCard />
      </div>

      <ActivityPlanCalendar
        initialWeekStart={weekStart}
        initialPlan={calendarPlan}
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          source: t.source,
          estDurationMin: t.estDurationMin,
          targetIntensity: t.targetIntensity,
        }))}
      />
    </div>
  );
}

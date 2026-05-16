import Link from 'next/link';
import { ArrowLeft, CalendarRange } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  getMealPlanForWeek,
  listRecipes,
  mondayOf,
} from '@/lib/agentic-os/health/repo';
import { CaveatBlock } from '@/components/agentic-os/health/caveat-block';
import { MealPlanCalendar } from '@/components/agentic-os/health/nutrition/meal-plan-calendar';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ week?: string }>;
}

export default async function MealPlanPage({ searchParams }: PageProps) {
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
  const [plan, recipes] = await Promise.all([
    getMealPlanForWeek(user.tenantId, user.userId, weekStart),
    listRecipes({
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
          mealSlot: s.mealSlot,
          recipeId: s.recipeId,
          recipe: s.recipe ? { id: s.recipe.id, name: s.recipe.name } : null,
          foodItemId: s.foodItemId,
          foodItem: s.foodItem
            ? {
                id: s.foodItem.id,
                name: s.foodItem.name,
                brand: s.foodItem.brand,
              }
            : null,
          freeformText: s.freeformText,
          servings: s.servings,
          notes: s.notes,
          position: s.position,
        })),
      }
    : null;

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
        <CalendarRange className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">Meal plan</h1>
      </div>
      <p className="text-sm text-text-secondary mb-5">
        Plan the week — recipes, single foods, or freeform notes. Use "I ate
        this" to log a planned slot into the meal log on the matching day.
      </p>

      <CaveatBlock />

      <div className="mt-6">
        <MealPlanCalendar
          initialWeekStart={weekStart}
          initialPlan={calendarPlan}
          recipes={recipes.map((r) => ({ id: r.id, name: r.name }))}
        />
      </div>
    </div>
  );
}

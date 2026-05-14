import Link from 'next/link';
import { ArrowLeft, BookOpen, Utensils } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  getDailyNutritionSummary,
  listMealEntries,
} from '@/lib/agentic-os/health/repo';
import { CaveatBlock } from '@/components/agentic-os/health/caveat-block';
import { MealLogger } from '@/components/agentic-os/health/nutrition/meal-logger';

export const dynamic = 'force-dynamic';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function HealthNutritionPage() {
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
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-amber-100/90">
          <h1 className="text-lg font-semibold text-amber-50 mb-2">
            Mental-health consent required
          </h1>
          <p className="leading-relaxed">
            Nutrition tracking is gated behind your mental-health consent.
            Grant the "mental" scope on the Health OS hub to continue.
          </p>
        </div>
      </div>
    );
  }

  const date = todayUtc();
  const [entries, summary] = await Promise.all([
    listMealEntries({
      tenantId: user.tenantId,
      userId: user.userId,
      fromDate: date,
      toDate: date,
      limit: 100,
    }),
    getDailyNutritionSummary(user.tenantId, user.userId, date),
  ]);

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/health"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Health OS
      </Link>

      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <Utensils className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-semibold text-white">Nutrition log</h1>
        </div>
        <Link
          href="/dashboard/os/health/nutrition/foods"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-0 hover:border-accent/50 text-white text-sm px-3 py-2 transition"
        >
          <BookOpen className="w-4 h-4" />
          Custom foods
        </Link>
      </div>
      <p className="text-sm text-text-secondary mb-5 leading-relaxed">
        Log meals manually or by searching the catalog. Phase 5b adds USDA
        FoodData Central + recipe builder.
      </p>

      <CaveatBlock />

      <div className="mt-6">
        <MealLogger
          initialDate={date}
          initialEntries={entries}
          initialSummary={summary}
        />
      </div>
    </div>
  );
}

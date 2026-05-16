import Link from 'next/link';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  listUserFoodItems,
} from '@/lib/agentic-os/health/repo';
import { CaveatBlock } from '@/components/agentic-os/health/caveat-block';
import { FoodLibrary } from '@/components/agentic-os/health/nutrition/food-library';

export const dynamic = 'force-dynamic';

export default async function HealthFoodsPage() {
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
            The custom-food library is gated behind your mental-health
            consent. Grant the "mental" scope on the Health OS hub.
          </p>
        </div>
      </div>
    );
  }

  const items = await listUserFoodItems(user.tenantId, user.userId, 200);

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/health/nutrition"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to nutrition
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <BookOpen className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">Custom foods</h1>
      </div>
      <p className="text-sm text-text-secondary mb-5 leading-relaxed">
        Build a private catalog of the foods you eat. Used by the meal logger
        and the upcoming recipe builder (5b).
      </p>

      <CaveatBlock />

      <div className="mt-6">
        <FoodLibrary initialItems={items} />
      </div>
    </div>
  );
}

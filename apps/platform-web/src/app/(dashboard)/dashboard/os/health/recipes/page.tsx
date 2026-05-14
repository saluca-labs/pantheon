import Link from 'next/link';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  listRecipes,
} from '@/lib/agentic-os/health/repo';
import { CaveatBlock } from '@/components/agentic-os/health/caveat-block';
import {
  RecipeLibrary,
  type RecipeLibraryItem,
} from '@/components/agentic-os/health/nutrition/recipe-library';

export const dynamic = 'force-dynamic';

export default async function HealthRecipesPage() {
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
            Recipes are gated behind your mental-health consent. Grant the
            "mental" scope on the Health OS hub to continue.
          </p>
        </div>
      </div>
    );
  }

  const recipes = await listRecipes({
    tenantId: user.tenantId,
    userId: user.userId,
    limit: 100,
  });

  const items: RecipeLibraryItem[] = recipes.map((r) => ({
    id: r.id,
    name: r.name,
    servings: r.servings,
    tags: r.tags,
    imageUrl: r.imageUrl,
    description: r.description,
    updatedAt: r.updatedAt,
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
        <BookOpen className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">Recipes</h1>
      </div>
      <p className="text-sm text-text-secondary mb-5 leading-relaxed">
        Save reusable recipes — ingredients roll up to per-serving nutrition.
        Drop recipes into the weekly meal plan or log directly.
      </p>

      <CaveatBlock />

      <div className="mt-6">
        <RecipeLibrary initialRecipes={items} />
      </div>
    </div>
  );
}

import Link from 'next/link';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import { getActiveConsent } from '@/lib/agentic-os/health/repo';
import { RecipeEditor } from '@/components/agentic-os/health/nutrition/recipe-editor';

export const dynamic = 'force-dynamic';

export default async function NewRecipePage() {
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
          href="/dashboard/os/health/recipes"
          className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Recipes
        </Link>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-amber-100/90">
          Mental-health consent required.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      <Link
        href="/dashboard/os/health/recipes"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Recipes
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <BookOpen className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">New recipe</h1>
      </div>
      <p className="text-sm text-[#94a3b8] mb-5">
        Save the recipe header first, then add ingredients and watch nutrition
        roll up on the right.
      </p>

      <RecipeEditor initialRecipe={null} initialNutrition={null} />
    </div>
  );
}

import Link from 'next/link';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  computeRecipeNutrition,
  getActiveConsent,
  getRecipe,
} from '@/lib/agentic-os/health/repo';
import {
  RecipeEditor,
  type RecipeEditorIngredient,
  type RecipeEditorRecipe,
  type RecipeNutritionData,
} from '@/components/agentic-os/health/nutrition/recipe-editor';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}

export default async function RecipeDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { edit } = await searchParams;
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
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-amber-100/90">
          Mental-health consent required.
        </div>
      </div>
    );
  }

  const recipe = await getRecipe(id, user.tenantId);
  if (!recipe || recipe.userId !== user.userId) notFound();

  const nutrition = await computeRecipeNutrition(id, user.tenantId);

  const editorRecipe: RecipeEditorRecipe = {
    id: recipe.id,
    name: recipe.name,
    description: recipe.description,
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    instructions: recipe.instructions,
    tags: recipe.tags,
    imageUrl: recipe.imageUrl,
    ingredients: (recipe.ingredients ?? []).map(
      (i): RecipeEditorIngredient => ({
        id: i.id,
        foodItemId: i.foodItemId,
        foodItem: i.foodItem
          ? {
              id: i.foodItem.id,
              name: i.foodItem.name,
              brand: i.foodItem.brand,
              kcal: i.foodItem.kcal,
              proteinG: i.foodItem.proteinG,
              carbsG: i.foodItem.carbsG,
              fatG: i.foodItem.fatG,
              servingSizeG: i.foodItem.servingSizeG,
            }
          : null,
        freeformName: i.freeformName,
        quantity: i.quantity,
        unit: i.unit,
        notes: i.notes,
      }),
    ),
  };

  const editorNutrition: RecipeNutritionData | null = nutrition
    ? {
        servings: nutrition.servings,
        total: {
          kcal: nutrition.total.kcal,
          protein_g: nutrition.total.protein_g,
          carbs_g: nutrition.total.carbs_g,
          fat_g: nutrition.total.fat_g,
        },
        perServing: {
          kcal: nutrition.perServing.kcal,
          protein_g: nutrition.perServing.protein_g,
          carbs_g: nutrition.perServing.carbs_g,
          fat_g: nutrition.perServing.fat_g,
        },
        partial: nutrition.partial,
      }
    : null;

  const editMode = edit === '1' || edit === 'true';

  return (
    <div className="max-w-6xl">
      <Link
        href="/dashboard/os/health/recipes"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Recipes
      </Link>

      <div className="flex flex-wrap items-center gap-3 mb-1">
        <BookOpen className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">{recipe.name}</h1>
      </div>

      {!editMode ? (
        <ReadMode
          recipe={recipe}
          nutrition={editorNutrition}
        />
      ) : (
        <RecipeEditor
          initialRecipe={editorRecipe}
          initialNutrition={editorNutrition}
        />
      )}
    </div>
  );
}

function ReadMode({
  recipe,
  nutrition,
}: {
  recipe: Awaited<ReturnType<typeof getRecipe>>;
  nutrition: RecipeNutritionData | null;
}) {
  if (!recipe) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-4">
      <div className="lg:col-span-2 space-y-5">
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="text-xs text-[#94a3b8]">
              {recipe.servings} serving{recipe.servings === 1 ? '' : 's'}
              {recipe.prepMinutes !== null
                ? ` · prep ${recipe.prepMinutes}m`
                : ''}
              {recipe.cookMinutes !== null
                ? ` · cook ${recipe.cookMinutes}m`
                : ''}
            </div>
            <Link
              href={`/dashboard/os/health/recipes/${recipe.id}?edit=1`}
              className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] px-3 py-1.5 text-xs text-[#cbd5e1] hover:border-[#4361EE]/50 hover:text-white"
            >
              Edit
            </Link>
          </div>
          {recipe.tags.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {recipe.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-[#2a2d3e] bg-[#0f1117] px-2 py-0.5 text-[11px] text-[#cbd5e1]"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          {recipe.description && (
            <p className="text-sm text-[#cbd5e1] leading-relaxed mb-3">
              {recipe.description}
            </p>
          )}
          {recipe.instructions && (
            <div className="prose prose-invert prose-sm max-w-none text-[#e2e8f0]">
              <ReactMarkdown>{recipe.instructions}</ReactMarkdown>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
          <h2 className="text-sm font-semibold text-white mb-3">Ingredients</h2>
          {(recipe.ingredients ?? []).length === 0 ? (
            <p className="text-xs text-[#94a3b8]">No ingredients yet.</p>
          ) : (
            <ul className="space-y-1.5 text-sm text-[#e2e8f0]">
              {(recipe.ingredients ?? []).map((i) => (
                <li
                  key={i.id}
                  className="flex items-start justify-between gap-3 border-b border-[#2a2d3e] py-1.5 last:border-b-0"
                >
                  <span>
                    <span className="text-white">
                      {i.quantity} {i.unit ?? ''}
                    </span>{' '}
                    {i.foodItem?.name ?? i.freeformName ?? '—'}
                    {i.notes ? (
                      <span className="ml-1 text-xs text-[#94a3b8]">
                        ({i.notes})
                      </span>
                    ) : null}
                  </span>
                  {i.foodItem?.brand && (
                    <span className="text-xs text-[#94a3b8] truncate">
                      {i.foodItem.brand}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <aside>
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5 sticky top-4">
          <h3 className="text-sm font-semibold text-white mb-3">Nutrition</h3>
          {!nutrition ? (
            <p className="text-xs text-[#94a3b8]">No nutrition rollup yet.</p>
          ) : (
            <div className="space-y-3 text-sm text-white">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[#94a3b8]">
                  Per serving
                </div>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <Macro label="kcal" value={nutrition.perServing.kcal} />
                  <Macro label="protein g" value={nutrition.perServing.protein_g} />
                  <Macro label="carbs g" value={nutrition.perServing.carbs_g} />
                  <Macro label="fat g" value={nutrition.perServing.fat_g} />
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[#94a3b8]">
                  Total
                </div>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <Macro label="kcal" value={nutrition.total.kcal} />
                  <Macro label="protein g" value={nutrition.total.protein_g} />
                  <Macro label="carbs g" value={nutrition.total.carbs_g} />
                  <Macro label="fat g" value={nutrition.total.fat_g} />
                </div>
              </div>
              {nutrition.partial > 0 && (
                <div className="text-[11px] text-amber-200/80">
                  {nutrition.partial} ingredient
                  {nutrition.partial === 1 ? '' : 's'} not auto-converted to
                  grams.
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Macro({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] px-3 py-2">
      <div className="text-[10px] text-[#94a3b8]">{label}</div>
      <div className="text-base tabular-nums">{value.toFixed(0)}</div>
    </div>
  );
}

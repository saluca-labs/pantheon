/**
 * Zod input schemas for Health OS BFF routes and repo writes.
 *
 * Kept in a parallel file (not inlined) so route handlers, server
 * actions, and tests share one validation source of truth.
 */

import { z } from 'zod';

// ─── Mental-health profile ────────────────────────────────────────────────

export const SLEEP_QUALITY_VALUES = ['poor', 'fair', 'good', 'excellent'] as const;
export const SUPPORT_SYSTEM_VALUES = ['none', 'limited', 'moderate', 'strong'] as const;

export const MentalProfileBody = z.object({
  stressBaseline: z.number().int().min(0).max(10).nullable().optional(),
  sleepQuality: z.enum(SLEEP_QUALITY_VALUES).nullable().optional(),
  supportSystem: z.enum(SUPPORT_SYSTEM_VALUES).nullable().optional(),
  currentTherapy: z.boolean().optional(),
  currentMeds: z.boolean().optional(),
  medNotes: z.string().max(2000).nullable().optional(),
  goals: z.array(z.string().min(1).max(160)).max(20).optional(),
});
export type MentalProfileInput = z.infer<typeof MentalProfileBody>;

// ─── Consent ──────────────────────────────────────────────────────────────

export const CONSENT_SCOPE_VALUES = ['physical', 'mental', 'integrations'] as const;
export type ConsentScope = (typeof CONSENT_SCOPE_VALUES)[number];

export const ConsentBody = z.object({
  scope: z.enum(CONSENT_SCOPE_VALUES),
  granted: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ConsentInput = z.infer<typeof ConsentBody>;

// ─── Risk flags ───────────────────────────────────────────────────────────

export const RISK_FLAG_SEVERITY_VALUES = ['low', 'medium', 'high', 'critical'] as const;
export type RiskFlagSeverityValue = (typeof RISK_FLAG_SEVERITY_VALUES)[number];

export const RiskFlagDismissQuery = z.object({
  id: z.string().uuid(),
});

// ─── Mood entries (Phase 2) ───────────────────────────────────────────────

const ScoreField = z.number().int().min(1).max(10).nullable().optional();

export const MoodEntryBody = z.object({
  moodScore: ScoreField,
  energyScore: ScoreField,
  anxietyScore: ScoreField,
  sleepQuality: z.enum(SLEEP_QUALITY_VALUES).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  entryAt: z.string().datetime().nullable().optional(),
  tagIds: z.array(z.string().uuid()).max(20).optional(),
});
export type MoodEntryInputBody = z.infer<typeof MoodEntryBody>;

export const MoodEntryUpdateBody = MoodEntryBody.partial();
export type MoodEntryUpdateInputBody = z.infer<typeof MoodEntryUpdateBody>;

export const MoodTagBody = z.object({
  name: z.string().min(1).max(64).trim(),
  color: z.string().max(32).nullable().optional(),
});
export type MoodTagInputBody = z.infer<typeof MoodTagBody>;

// ─── Journal entries (Phase 2) ────────────────────────────────────────────

export const JOURNAL_PROMPT_CATEGORIES = [
  'cbt-thought-record',
  'gratitude',
  'values-clarification',
  'behavioral-activation',
  'self-compassion',
] as const;
export type JournalPromptCategoryValue =
  (typeof JOURNAL_PROMPT_CATEGORIES)[number];

export const JournalEntryBody = z.object({
  promptId: z.string().uuid().nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  body: z.string().min(1).max(50_000),
  entryAt: z.string().datetime().nullable().optional(),
});
export type JournalEntryInputBody = z.infer<typeof JournalEntryBody>;

export const JournalEntryUpdateBody = z.object({
  promptId: z.string().uuid().nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  body: z.string().min(1).max(50_000).optional(),
  entryAt: z.string().datetime().nullable().optional(),
});
export type JournalEntryUpdateInputBody = z.infer<typeof JournalEntryUpdateBody>;

// ─── CBT exercise logs (Phase 3) ──────────────────────────────────────────

export const CBT_KIND_VALUES = [
  'thought-record',
  'behavioral-activation',
  'worry-time',
  'grounding-54321',
  'gratitude',
  'values-clarification',
  'sleep-hygiene',
] as const;
export const CbtKindEnum = z.enum(CBT_KIND_VALUES);
export type CbtKind = z.infer<typeof CbtKindEnum>;

const MoodScoreField = z.number().int().min(1).max(10).nullable().optional();

/**
 * Per-kind structured payload schemas. The DB stores ``data JSONB``;
 * each ``CbtLogBody.kind`` selects the matching payload schema via the
 * discriminated union below. Adding an eighth kind is a one-line change
 * to ``CBT_KIND_VALUES``, the migration's CHECK, and a new schema here.
 */
export const CbtThoughtRecordData = z.object({
  situation: z.string().min(1).max(2000),
  automatic_thought: z.string().min(1).max(2000),
  evidence_for: z.string().max(2000).optional().default(''),
  evidence_against: z.string().max(2000).optional().default(''),
  balanced_thought: z.string().min(1).max(2000),
  mood_before: z.number().int().min(1).max(10).optional(),
  mood_after: z.number().int().min(1).max(10).optional(),
});
export type CbtThoughtRecordPayload = z.infer<typeof CbtThoughtRecordData>;

export const CbtBehavioralActivationData = z.object({
  activity: z.string().min(1).max(500),
  scheduled_for: z.string().min(1).max(200),
  completed: z.boolean().default(false),
  mood_before: z.number().int().min(1).max(10).optional(),
  mood_after: z.number().int().min(1).max(10).optional(),
  reflection: z.string().max(2000).optional().default(''),
});
export type CbtBehavioralActivationPayload = z.infer<
  typeof CbtBehavioralActivationData
>;

export const CbtWorryTimeData = z.object({
  scheduled_at: z.string().min(1).max(200),
  duration_min: z.number().int().min(1).max(120),
  worries: z.array(z.string().min(1).max(500)).min(1).max(20),
  reflection: z.string().max(2000).optional().default(''),
});
export type CbtWorryTimePayload = z.infer<typeof CbtWorryTimeData>;

export const CbtGroundingData = z.object({
  five_see: z.array(z.string().min(1).max(120)).length(5),
  four_feel: z.array(z.string().min(1).max(120)).length(4),
  three_hear: z.array(z.string().min(1).max(120)).length(3),
  two_smell: z.array(z.string().min(1).max(120)).length(2),
  one_taste: z.array(z.string().min(1).max(120)).length(1),
});
export type CbtGroundingPayload = z.infer<typeof CbtGroundingData>;

export const CbtGratitudeData = z.object({
  entries: z.array(z.string().min(1).max(500)).length(3),
});
export type CbtGratitudePayload = z.infer<typeof CbtGratitudeData>;

export const CbtValuesData = z.object({
  values: z
    .array(
      z.object({
        domain: z.string().min(1).max(120),
        importance: z.number().int().min(1).max(10),
        current_alignment: z.number().int().min(1).max(10),
        action: z.string().min(1).max(500),
      }),
    )
    .min(1)
    .max(10),
});
export type CbtValuesPayload = z.infer<typeof CbtValuesData>;

export const CbtSleepHygieneData = z.object({
  checklist: z
    .array(
      z.object({
        item: z.string().min(1).max(200),
        met: z.boolean(),
      }),
    )
    .min(1)
    .max(30),
  notes: z.string().max(2000).optional().default(''),
});
export type CbtSleepHygienePayload = z.infer<typeof CbtSleepHygieneData>;

/**
 * Discriminated union — one entry per CBT kind. Routes parse the body
 * via this schema; the DB column ``kind`` is set from the discriminator
 * and ``data`` holds the validated per-kind payload.
 */
export const CbtLogBody = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('thought-record'),
    exerciseId: z.string().uuid().nullable().optional(),
    moodBefore: MoodScoreField,
    moodAfter: MoodScoreField,
    notes: z.string().max(2000).nullable().optional(),
    completed: z.boolean().optional(),
    data: CbtThoughtRecordData,
  }),
  z.object({
    kind: z.literal('behavioral-activation'),
    exerciseId: z.string().uuid().nullable().optional(),
    moodBefore: MoodScoreField,
    moodAfter: MoodScoreField,
    notes: z.string().max(2000).nullable().optional(),
    completed: z.boolean().optional(),
    data: CbtBehavioralActivationData,
  }),
  z.object({
    kind: z.literal('worry-time'),
    exerciseId: z.string().uuid().nullable().optional(),
    moodBefore: MoodScoreField,
    moodAfter: MoodScoreField,
    notes: z.string().max(2000).nullable().optional(),
    completed: z.boolean().optional(),
    data: CbtWorryTimeData,
  }),
  z.object({
    kind: z.literal('grounding-54321'),
    exerciseId: z.string().uuid().nullable().optional(),
    moodBefore: MoodScoreField,
    moodAfter: MoodScoreField,
    notes: z.string().max(2000).nullable().optional(),
    completed: z.boolean().optional(),
    data: CbtGroundingData,
  }),
  z.object({
    kind: z.literal('gratitude'),
    exerciseId: z.string().uuid().nullable().optional(),
    moodBefore: MoodScoreField,
    moodAfter: MoodScoreField,
    notes: z.string().max(2000).nullable().optional(),
    completed: z.boolean().optional(),
    data: CbtGratitudeData,
  }),
  z.object({
    kind: z.literal('values-clarification'),
    exerciseId: z.string().uuid().nullable().optional(),
    moodBefore: MoodScoreField,
    moodAfter: MoodScoreField,
    notes: z.string().max(2000).nullable().optional(),
    completed: z.boolean().optional(),
    data: CbtValuesData,
  }),
  z.object({
    kind: z.literal('sleep-hygiene'),
    exerciseId: z.string().uuid().nullable().optional(),
    moodBefore: MoodScoreField,
    moodAfter: MoodScoreField,
    notes: z.string().max(2000).nullable().optional(),
    completed: z.boolean().optional(),
    data: CbtSleepHygieneData,
  }),
]);
export type CbtLogInputBody = z.infer<typeof CbtLogBody>;

/**
 * Update body — all fields optional, but if `data` is supplied the caller
 * MUST also supply `kind` so we know which payload schema to validate
 * against. We don't use a discriminated union here because callers may
 * patch only mood / notes without touching the structured data.
 */
export const CbtLogUpdateBody = z.object({
  moodBefore: MoodScoreField,
  moodAfter: MoodScoreField,
  notes: z.string().max(2000).nullable().optional(),
  completed: z.boolean().optional(),
  // When updating `data`, callers also pass `kind` so the route can
  // re-validate via the matching per-kind schema.
  kind: CbtKindEnum.optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});
export type CbtLogUpdateInputBody = z.infer<typeof CbtLogUpdateBody>;

// ─── Meditation (Phase 3) ─────────────────────────────────────────────────

export const MEDITATION_SOURCE_VALUES = ['medito', 'manual', 'plan'] as const;
export const MeditationSourceEnum = z.enum(MEDITATION_SOURCE_VALUES);
export type MeditationSource = z.infer<typeof MeditationSourceEnum>;

export const MeditationSessionBody = z.object({
  source: MeditationSourceEnum,
  sourceRef: z.string().max(200).nullable().optional(),
  durationMin: z.number().int().min(1).max(240),
  completedAt: z.string().datetime().nullable().optional(),
  moodBefore: MoodScoreField,
  moodAfter: MoodScoreField,
  notes: z.string().max(2000).nullable().optional(),
});
export type MeditationSessionInputBody = z.infer<typeof MeditationSessionBody>;

export const MeditationSessionUpdateBody = MeditationSessionBody.partial();
export type MeditationSessionUpdateInputBody = z.infer<
  typeof MeditationSessionUpdateBody
>;

export const MEDITATION_PLAN_GOALS = [
  'stress',
  'sleep',
  'focus',
  'general',
] as const;
export const MeditationPlanGoalEnum = z.enum(MEDITATION_PLAN_GOALS);
export type MeditationPlanGoal = z.infer<typeof MeditationPlanGoalEnum>;

export const MeditationPlanBody = z.object({
  goal: MeditationPlanGoalEnum.optional(),
  weeklyMinutes: z.number().int().min(5).max(420).optional(),
});
export type MeditationPlanInputBody = z.infer<typeof MeditationPlanBody>;

// ─── Food items (Phase 5a) ────────────────────────────────────────────────

export const FOOD_SOURCE_VALUES = ['usda', 'custom'] as const;
export const FoodSourceEnum = z.enum(FOOD_SOURCE_VALUES);
export type FoodSource = z.infer<typeof FoodSourceEnum>;

const NonNegativeNumber = z.number().min(0).nullable().optional();

export const FoodItemBody = z.object({
  name: z.string().min(1).max(200).trim(),
  brand: z.string().max(200).nullable().optional(),
  servingSizeG: NonNegativeNumber,
  servingLabel: z.string().max(80).nullable().optional(),
  kcal: NonNegativeNumber,
  proteinG: NonNegativeNumber,
  carbsG: NonNegativeNumber,
  fatG: NonNegativeNumber,
  fiberG: NonNegativeNumber,
  sugarG: NonNegativeNumber,
  sodiumMg: NonNegativeNumber,
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type FoodItemInputBody = z.infer<typeof FoodItemBody>;

export const FoodItemUpdateBody = FoodItemBody.partial();
export type FoodItemUpdateInputBody = z.infer<typeof FoodItemUpdateBody>;

// ─── Meal entries (Phase 5a) ──────────────────────────────────────────────

export const MEAL_SLOT_VALUES = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
] as const;
export const MealSlotEnum = z.enum(MEAL_SLOT_VALUES);
export type MealSlot = z.infer<typeof MealSlotEnum>;

export const MealEntryBody = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD required'),
  mealSlot: MealSlotEnum,
  foodItemId: z.string().uuid().nullable().optional(),
  freeformDescription: z.string().max(500).nullable().optional(),
  servings: z.number().min(0).max(1000).optional(),
  kcalOverride: NonNegativeNumber,
  proteinGOverride: NonNegativeNumber,
  carbsGOverride: NonNegativeNumber,
  fatGOverride: NonNegativeNumber,
  notes: z.string().max(2000).nullable().optional(),
});
export type MealEntryInputBody = z.infer<typeof MealEntryBody>;

export const MealEntryUpdateBody = MealEntryBody.partial();
export type MealEntryUpdateInputBody = z.infer<typeof MealEntryUpdateBody>;

// ─── Activity entries (Phase 5a) ──────────────────────────────────────────

export const ACTIVITY_INTENSITY_VALUES = [
  'light',
  'moderate',
  'vigorous',
] as const;
export const ActivityIntensityEnum = z.enum(ACTIVITY_INTENSITY_VALUES);
export type ActivityIntensity = z.infer<typeof ActivityIntensityEnum>;

export const ActivityEntryBody = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD required'),
  activityType: z.string().min(1).max(80).trim(),
  durationMin: z.number().int().min(1).max(1440),
  intensity: ActivityIntensityEnum.optional(),
  kcalBurned: NonNegativeNumber,
  notes: z.string().max(2000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ActivityEntryInputBody = z.infer<typeof ActivityEntryBody>;

export const ActivityEntryUpdateBody = ActivityEntryBody.partial();
export type ActivityEntryUpdateInputBody = z.infer<
  typeof ActivityEntryUpdateBody
>;

// ─── Recipes (Phase 5b) ───────────────────────────────────────────────────

export const RecipeBody = z.object({
  name: z.string().min(1).max(200).trim(),
  description: z.string().max(4000).nullable().optional(),
  servings: z.number().min(0.1).max(1000).optional(),
  prepMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  cookMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  instructions: z.string().max(20_000).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  imageUrl: z.string().url().max(500).nullable().optional(),
});
export type RecipeInputBody = z.infer<typeof RecipeBody>;

export const RecipeUpdateBody = RecipeBody.partial();
export type RecipeUpdateInputBody = z.infer<typeof RecipeUpdateBody>;

export const RecipeIngredientBody = z.object({
  foodItemId: z.string().uuid().nullable().optional(),
  freeformName: z.string().min(1).max(200).nullable().optional(),
  quantity: z.number().min(0).max(100_000),
  unit: z.string().max(40).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  position: z.number().int().min(0).max(10_000).optional(),
});
export type RecipeIngredientInputBody = z.infer<typeof RecipeIngredientBody>;

export const RecipeIngredientUpdateBody = RecipeIngredientBody.partial();
export type RecipeIngredientUpdateInputBody = z.infer<
  typeof RecipeIngredientUpdateBody
>;

export const RecipeIngredientReorderBody = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(200),
});
export type RecipeIngredientReorderInputBody = z.infer<
  typeof RecipeIngredientReorderBody
>;

// ─── Meal plans (Phase 5b) ────────────────────────────────────────────────

export const MealPlanBody = z.object({
  weekStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD required'),
  name: z.string().max(200).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});
export type MealPlanInputBody = z.infer<typeof MealPlanBody>;

export const MealPlanUpdateBody = z.object({
  name: z.string().max(200).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});
export type MealPlanUpdateInputBody = z.infer<typeof MealPlanUpdateBody>;

export const MealPlanSlotBody = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  mealSlot: MealSlotEnum,
  recipeId: z.string().uuid().nullable().optional(),
  foodItemId: z.string().uuid().nullable().optional(),
  freeformText: z.string().max(500).nullable().optional(),
  servings: z.number().min(0).max(1000).optional(),
  notes: z.string().max(2000).nullable().optional(),
  position: z.number().int().min(0).max(10_000).optional(),
});
export type MealPlanSlotInputBody = z.infer<typeof MealPlanSlotBody>;

export const MealPlanSlotUpdateBody = MealPlanSlotBody.partial();
export type MealPlanSlotUpdateInputBody = z.infer<
  typeof MealPlanSlotUpdateBody
>;

// ─── Workout templates (Phase 5c) ─────────────────────────────────────────

export const WORKOUT_TEMPLATE_BLOCK_KINDS = [
  'exercise',
  'rest',
  'note',
] as const;
export const WorkoutTemplateBlockKindEnum = z.enum(
  WORKOUT_TEMPLATE_BLOCK_KINDS,
);
export type WorkoutTemplateBlockKindValue = z.infer<
  typeof WorkoutTemplateBlockKindEnum
>;

export const WorkoutTemplateBody = z.object({
  name: z.string().min(1).max(200).trim(),
  description: z.string().max(4000).nullable().optional(),
  category: z.string().min(1).max(80).trim(),
  targetIntensity: ActivityIntensityEnum.optional(),
  estDurationMin: z.number().int().min(1).max(1440),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type WorkoutTemplateInputBody = z.infer<typeof WorkoutTemplateBody>;

export const WorkoutTemplateUpdateBody = WorkoutTemplateBody.partial();
export type WorkoutTemplateUpdateInputBody = z.infer<
  typeof WorkoutTemplateUpdateBody
>;

export const WorkoutTemplateBlockBody = z.object({
  kind: WorkoutTemplateBlockKindEnum.optional(),
  name: z.string().min(1).max(200).trim(),
  sets: z.number().int().min(0).max(100).nullable().optional(),
  reps: z.string().max(40).nullable().optional(),
  durationSec: z.number().int().min(0).max(86_400).nullable().optional(),
  restSec: z.number().int().min(0).max(86_400).nullable().optional(),
  weightHint: z.string().max(80).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  position: z.number().int().min(0).max(10_000).optional(),
});
export type WorkoutTemplateBlockInputBody = z.infer<
  typeof WorkoutTemplateBlockBody
>;

export const WorkoutTemplateBlockUpdateBody = WorkoutTemplateBlockBody.partial();
export type WorkoutTemplateBlockUpdateInputBody = z.infer<
  typeof WorkoutTemplateBlockUpdateBody
>;

export const WorkoutTemplateBlockReorderBody = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(200),
});
export type WorkoutTemplateBlockReorderInputBody = z.infer<
  typeof WorkoutTemplateBlockReorderBody
>;

// ─── Activity plans (Phase 5c) ────────────────────────────────────────────

export const ActivityPlanBody = z.object({
  weekStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD required'),
  name: z.string().max(200).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});
export type ActivityPlanInputBody = z.infer<typeof ActivityPlanBody>;

export const ActivityPlanUpdateBody = z.object({
  name: z.string().max(200).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});
export type ActivityPlanUpdateInputBody = z.infer<
  typeof ActivityPlanUpdateBody
>;

export const ActivityPlanSlotBody = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  templateId: z.string().uuid().nullable().optional(),
  freeformText: z.string().max(500).nullable().optional(),
  targetDurationMin: z.number().int().min(1).max(1440).nullable().optional(),
  targetIntensity: ActivityIntensityEnum.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  position: z.number().int().min(0).max(10_000).optional(),
});
export type ActivityPlanSlotInputBody = z.infer<typeof ActivityPlanSlotBody>;

export const ActivityPlanSlotUpdateBody = ActivityPlanSlotBody.partial();
export type ActivityPlanSlotUpdateInputBody = z.infer<
  typeof ActivityPlanSlotUpdateBody
>;

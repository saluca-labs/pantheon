/**
 * Tool definitions for the Health OS coach.
 *
 * Each tool wraps an existing repo write (or read) with:
 *   - Zod-validated input.
 *   - Optional `withCrisisGuard` around free-text inputs.
 *   - `recordAudit` to the agos_audit table.
 *   - An `agos_mh_coach_action_log` row capturing input + output.
 *
 * Tools are exposed via the Vercel AI SDK `tool()` helper and bound at
 * call time inside the chat route so they can capture the active
 * conversation id and user context.
 */

import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import {
  createActivityEntry,
  createMealEntry,
  listJournalEntries,
  listWorkoutTemplates,
  recordAudit,
  recordMoodEntry,
  recordRiskFlag,
} from '../repo';
import { withCrisisGuard } from '../../_shared/safety/crisis-guard';
import { logCoachAction } from './repo';

export interface CoachToolBindings {
  tenantId: string;
  userId: string;
  conversationId: string;
}

const MealSlot = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
const Intensity = z.enum(['light', 'moderate', 'vigorous']);

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function buildCoachTools(bindings: CoachToolBindings) {
  const { tenantId, userId, conversationId } = bindings;

  return {
    log_mood: tool({
      description:
        'Record a mood check-in. Use when the user describes how they are feeling and wants it logged.',
      inputSchema: z.object({
        mood: z.number().int().min(1).max(10),
        energy: z.number().int().min(1).max(10),
        anxiety: z.number().int().min(1).max(10),
        sleep: z.number().int().min(1).max(10),
        tags: z.array(z.string()).max(10).optional(),
        note: z.string().max(2000).optional(),
      }),
      execute: async (input) => {
        const sleepLabel =
          input.sleep <= 3
            ? 'poor'
            : input.sleep <= 5
              ? 'fair'
              : input.sleep <= 8
                ? 'good'
                : 'excellent';
        const entry = await withCrisisGuard(
          input,
          {
            osSlug: 'health',
            source: 'health.coach.log_mood',
            extractText: (b) => [b.note ?? null],
            persistFlag: (flag) =>
              recordRiskFlag(userId, tenantId, flag).then(() => undefined),
          },
          () =>
            recordMoodEntry(userId, tenantId, {
              moodScore: input.mood,
              energyScore: input.energy,
              anxietyScore: input.anxiety,
              sleepQuality: sleepLabel,
              notes: input.note ?? null,
            }),
        );
        const result = { id: entry.id, sleep_quality: sleepLabel };
        await recordAudit({
          actorId: userId,
          action: 'health.coach.log_mood',
          payload: { entry_id: entry.id },
        });
        await logCoachAction({
          conversationId,
          tenantId,
          userId,
          toolName: 'log_mood',
          toolInput: input,
          toolOutput: result,
        });
        return result;
      },
    }),

    log_meal: tool({
      description:
        'Log a meal entry for today. Provide a freeform description; macros are optional. Use when the user says they ate something.',
      inputSchema: z.object({
        meal_slot: MealSlot,
        freeform_description: z.string().min(1).max(500),
        kcal: z.number().nonnegative().optional(),
        protein_g: z.number().nonnegative().optional(),
        carbs_g: z.number().nonnegative().optional(),
        fat_g: z.number().nonnegative().optional(),
      }),
      execute: async (input) => {
        const entry = await withCrisisGuard(
          input,
          {
            osSlug: 'health',
            source: 'health.coach.log_meal',
            extractText: (b) => [b.freeform_description],
            persistFlag: (flag) =>
              recordRiskFlag(userId, tenantId, flag).then(() => undefined),
          },
          () =>
            createMealEntry(tenantId, userId, {
              entryDate: todayIso(),
              mealSlot: input.meal_slot,
              freeformDescription: input.freeform_description,
              kcalOverride: input.kcal ?? null,
              proteinGOverride: input.protein_g ?? null,
              carbsGOverride: input.carbs_g ?? null,
              fatGOverride: input.fat_g ?? null,
            }),
        );
        const result = { id: entry.id, meal_slot: entry.mealSlot };
        await recordAudit({
          actorId: userId,
          action: 'health.coach.log_meal',
          payload: { entry_id: entry.id, slot: entry.mealSlot },
        });
        await logCoachAction({
          conversationId,
          tenantId,
          userId,
          toolName: 'log_meal',
          toolInput: input,
          toolOutput: result,
        });
        return result;
      },
    }),

    log_activity: tool({
      description:
        'Log an exercise session for today. Use when the user mentions a workout they completed.',
      inputSchema: z.object({
        activity_type: z.string().min(1).max(80),
        duration_min: z.number().int().positive().max(720),
        intensity: Intensity,
        notes: z.string().max(1000).optional(),
      }),
      execute: async (input) => {
        const entry = await withCrisisGuard(
          input,
          {
            osSlug: 'health',
            source: 'health.coach.log_activity',
            extractText: (b) => [b.notes ?? null],
            persistFlag: (flag) =>
              recordRiskFlag(userId, tenantId, flag).then(() => undefined),
          },
          () =>
            createActivityEntry(tenantId, userId, {
              entryDate: todayIso(),
              activityType: input.activity_type,
              durationMin: input.duration_min,
              intensity: input.intensity,
              notes: input.notes ?? null,
            }),
        );
        const result = {
          id: entry.id,
          activity_type: entry.activityType,
          kcal_burned: entry.kcalBurned,
        };
        await recordAudit({
          actorId: userId,
          action: 'health.coach.log_activity',
          payload: { entry_id: entry.id, type: entry.activityType },
        });
        await logCoachAction({
          conversationId,
          tenantId,
          userId,
          toolName: 'log_activity',
          toolInput: input,
          toolOutput: result,
        });
        return result;
      },
    }),

    suggest_today_workout: tool({
      description:
        'Surface 3 workout template suggestions for today. Filter by intensity if the user expressed a preference.',
      inputSchema: z.object({
        intensity: Intensity.optional(),
      }),
      execute: async (input) => {
        const templates = await listWorkoutTemplates({
          tenantId,
          userId,
          limit: 50,
        });
        let filtered = templates;
        if (input.intensity) {
          filtered = templates.filter(
            (t) => t.targetIntensity === input.intensity,
          );
        }
        // Spread across categories so we don't return three near-duplicates.
        const seenCategory = new Set<string>();
        const top: typeof filtered = [];
        for (const t of filtered) {
          if (seenCategory.has(t.category)) continue;
          seenCategory.add(t.category);
          top.push(t);
          if (top.length === 3) break;
        }
        // Top-off if we filtered out too aggressively.
        if (top.length < 3) {
          for (const t of filtered) {
            if (top.includes(t)) continue;
            top.push(t);
            if (top.length === 3) break;
          }
        }
        const result = {
          suggestions: top.map((t) => ({
            id: t.id,
            name: t.name,
            category: t.category,
            target_intensity: t.targetIntensity,
            est_duration_min: t.estDurationMin,
          })),
        };
        await recordAudit({
          actorId: userId,
          action: 'health.coach.suggest_today_workout',
          payload: { intensity: input.intensity, count: result.suggestions.length },
        });
        await logCoachAction({
          conversationId,
          tenantId,
          userId,
          toolName: 'suggest_today_workout',
          toolInput: input,
          toolOutput: result,
        });
        return result;
      },
    }),

    get_recent_journal_entry: tool({
      description:
        'Return a recent journal entry excerpt. index 0 = most recent. Use when the user asks to revisit something they wrote.',
      inputSchema: z.object({
        index: z.number().int().min(0).max(9).optional(),
      }),
      execute: async (input) => {
        const idx = input.index ?? 0;
        const entries = await listJournalEntries(userId, { limit: idx + 1 });
        const entry = entries[idx] ?? null;
        const result = entry
          ? {
              found: true as const,
              id: entry.id,
              entry_at: entry.entryAt,
              title: entry.title,
              body_excerpt: entry.body.slice(0, 400),
            }
          : { found: false as const };
        await recordAudit({
          actorId: userId,
          action: 'health.coach.get_recent_journal_entry',
          payload: { index: idx, found: result.found },
        });
        await logCoachAction({
          conversationId,
          tenantId,
          userId,
          toolName: 'get_recent_journal_entry',
          toolInput: input,
          toolOutput: result,
        });
        return result;
      },
    }),

    save_reflection_prompt: tool({
      description:
        'Surface a reflection prompt back to the user. Does NOT create a journal entry — the user writes that themselves.',
      inputSchema: z.object({
        prompt: z.string().min(8).max(500),
      }),
      execute: async (input) => {
        // No persistence — coach surfaces the prompt and the user chooses to
        // act on it. We still audit + log it so the action trail is complete.
        const result = { prompt: input.prompt };
        await recordAudit({
          actorId: userId,
          action: 'health.coach.save_reflection_prompt',
          payload: { len: input.prompt.length },
        });
        await logCoachAction({
          conversationId,
          tenantId,
          userId,
          toolName: 'save_reflection_prompt',
          toolInput: input,
          toolOutput: result,
        });
        return result;
      },
    }),
  };
}

export type CoachTools = ReturnType<typeof buildCoachTools>;

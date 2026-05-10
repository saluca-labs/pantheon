/**
 * Coach context snapshot.
 *
 * Pulls a compact, current-state view of the user's health for the system
 * prompt: profile basics, recent mood, latest of each screener, recent
 * journal/CBT/meditation activity, 7-day nutrition/activity averages, the
 * active week's meal + activity plans, and a rules-based intensity
 * suggestion.
 *
 * Composes the existing per-domain repo helpers — no new SQL primitives.
 */

import 'server-only';
import {
  getProfile,
  listMoodEntries,
  listScreeners,
  listJournalEntries,
  listCbtLogs,
  listMeditationSessions,
  listMealEntries,
  listActivityEntries,
  getMealPlanForWeek,
  getActivityPlanForWeek,
  getActivitySuggestionInputs,
  isoMondayWeekStart,
  type HealthProfile,
  type MoodEntry,
  type ScreenerRow,
  type JournalEntry,
  type CbtLog,
  type MeditationSession,
  type MealEntry,
  type ActivityEntry,
  type MealPlan,
  type ActivityPlan,
} from '../repo';
import {
  suggestActivityIntensity,
  type ActivitySuggestion,
} from '../activity-suggestions';
import type { ScreenerKey } from '../screeners';

export interface CoachContextInput {
  tenantId: string;
  userId: string;
  now?: Date;
}

export interface CoachContextProfile {
  age?: number;
  height_cm?: number;
  weight_kg?: number;
  biological_sex?: string;
  fitness_level?: string;
}

export interface CoachContextMoodPoint {
  date: string;
  mood: number | null;
  energy: number | null;
  anxiety: number | null;
  sleep: string | null;
}

export interface CoachContextScreener {
  kind: ScreenerKey;
  score: number;
  completed_at: string;
  severity: string;
}

export interface CoachContextJournal {
  id: string;
  created_at: string;
  body_excerpt: string;
}

export interface CoachContextCbt {
  id: string;
  kind: string;
  created_at: string;
}

export interface CoachContextMeditation {
  id: string;
  created_at: string;
  duration_min: number;
}

export interface CoachContextNutrition {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface CoachContextActivity {
  duration_min: number;
  sessions: number;
  kcal_burned: number;
}

export interface CoachContextPlan {
  week_start_date: string;
  slot_count: number;
}

export interface CoachContext {
  profile: CoachContextProfile;
  recent_mood_7d: CoachContextMoodPoint[];
  recent_screeners: CoachContextScreener[];
  recent_journal_titles_14d: CoachContextJournal[];
  recent_cbt_logs_14d: CoachContextCbt[];
  recent_meditation_14d: CoachContextMeditation[];
  nutrition_7d_avg: CoachContextNutrition | null;
  activity_7d_total: CoachContextActivity | null;
  active_meal_plan: CoachContextPlan | null;
  active_activity_plan: CoachContextPlan | null;
  intensity_suggestion: ActivitySuggestion;
}

function profileSummary(profile: HealthProfile | null): CoachContextProfile {
  if (!profile) return {};
  const out: CoachContextProfile = {};
  if (profile.dateOfBirth) {
    const dob = new Date(profile.dateOfBirth);
    if (!Number.isNaN(dob.getTime())) {
      const ageMs = Date.now() - dob.getTime();
      out.age = Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000));
    }
  }
  if (profile.heightCm !== null) out.height_cm = profile.heightCm;
  if (profile.weightKg !== null) out.weight_kg = profile.weightKg;
  if (profile.sex) out.biological_sex = profile.sex;
  if (profile.activityLevel) out.fitness_level = profile.activityLevel;
  return out;
}

function pickLatestPerScreener(rows: ScreenerRow[]): CoachContextScreener[] {
  const seen = new Set<ScreenerKey>();
  const out: CoachContextScreener[] = [];
  // listScreeners returns DESC by created_at, so first hit per kind wins.
  for (const r of rows) {
    if (seen.has(r.screener)) continue;
    seen.add(r.screener);
    out.push({
      kind: r.screener,
      score: r.score,
      completed_at: r.createdAt,
      severity: r.severity,
    });
  }
  return out;
}

function bodyExcerpt(body: string, max = 120): string {
  const trimmed = body.trim().replace(/\s+/g, ' ');
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max - 1) + '…';
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function moodToPoint(m: MoodEntry): CoachContextMoodPoint {
  return {
    date: m.entryAt.slice(0, 10),
    mood: m.moodScore ?? null,
    energy: m.energyScore ?? null,
    anxiety: m.anxietyScore ?? null,
    sleep: m.sleepQuality ?? null,
  };
}

function avgNutrition(entries: MealEntry[]): CoachContextNutrition | null {
  if (entries.length === 0) return null;
  const byDate = new Map<string, { kcal: number; p: number; c: number; f: number }>();
  for (const e of entries) {
    const cur = byDate.get(e.entryDate) ?? { kcal: 0, p: 0, c: 0, f: 0 };
    cur.kcal += e.nutrients.kcal ?? 0;
    cur.p += e.nutrients.protein_g ?? 0;
    cur.c += e.nutrients.carbs_g ?? 0;
    cur.f += e.nutrients.fat_g ?? 0;
    byDate.set(e.entryDate, cur);
  }
  const n = byDate.size;
  let kcal = 0, p = 0, c = 0, f = 0;
  for (const v of byDate.values()) {
    kcal += v.kcal;
    p += v.p;
    c += v.c;
    f += v.f;
  }
  return {
    kcal: Number((kcal / n).toFixed(1)),
    protein_g: Number((p / n).toFixed(1)),
    carbs_g: Number((c / n).toFixed(1)),
    fat_g: Number((f / n).toFixed(1)),
  };
}

function totalActivity(entries: ActivityEntry[]): CoachContextActivity | null {
  if (entries.length === 0) return null;
  let dur = 0, kcal = 0;
  for (const e of entries) {
    dur += e.durationMin ?? 0;
    kcal += e.kcalBurned ?? 0;
  }
  return {
    duration_min: dur,
    sessions: entries.length,
    kcal_burned: Number(kcal.toFixed(1)),
  };
}

function planSummary(plan: MealPlan | ActivityPlan | null): CoachContextPlan | null {
  if (!plan) return null;
  const slots = (plan as { slots?: unknown[] }).slots;
  return {
    week_start_date: plan.weekStartDate,
    slot_count: Array.isArray(slots) ? slots.length : 0,
  };
}

export async function buildCoachContext(
  input: CoachContextInput,
): Promise<CoachContext> {
  const { tenantId, userId } = input;
  const now = input.now ?? new Date();
  const weekStart = isoMondayWeekStart(now);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [
    profile,
    moodEntries,
    screeners,
    journalEntries,
    cbtLogs,
    medSessions,
    mealEntries,
    activityEntries,
    mealPlan,
    activityPlan,
    suggestionInputs,
  ] = await Promise.all([
    getProfile(userId),
    listMoodEntries(userId, { from: sevenDaysAgo, limit: 50 }),
    listScreeners(userId, 25),
    listJournalEntries(userId, { from: fourteenDaysAgo, limit: 10 }),
    listCbtLogs(userId, { from: fourteenDaysAgo, limit: 10 }),
    listMeditationSessions(userId, { from: fourteenDaysAgo, limit: 10 }),
    listMealEntries({
      tenantId,
      userId,
      fromDate: isoDate(sevenDaysAgo),
      toDate: isoDate(now),
      limit: 500,
    }),
    listActivityEntries({
      tenantId,
      userId,
      fromDate: isoDate(sevenDaysAgo),
      toDate: isoDate(now),
      limit: 200,
    }),
    getMealPlanForWeek(tenantId, userId, weekStart),
    getActivityPlanForWeek(tenantId, userId, weekStart),
    getActivitySuggestionInputs(userId),
  ]);

  return {
    profile: profileSummary(profile),
    recent_mood_7d: moodEntries.map(moodToPoint),
    recent_screeners: pickLatestPerScreener(screeners),
    recent_journal_titles_14d: journalEntries.map((j: JournalEntry) => ({
      id: j.id,
      created_at: j.entryAt,
      body_excerpt: bodyExcerpt(j.body),
    })),
    recent_cbt_logs_14d: cbtLogs.map((l: CbtLog) => ({
      id: l.id,
      kind: l.kind,
      created_at: l.completedAt ?? l.startedAt,
    })),
    recent_meditation_14d: medSessions.map((s: MeditationSession) => ({
      id: s.id,
      created_at: s.completedAt,
      duration_min: s.durationMin,
    })),
    nutrition_7d_avg: avgNutrition(mealEntries),
    activity_7d_total: totalActivity(activityEntries),
    active_meal_plan: planSummary(mealPlan),
    active_activity_plan: planSummary(activityPlan),
    intensity_suggestion: suggestActivityIntensity(suggestionInputs),
  };
}

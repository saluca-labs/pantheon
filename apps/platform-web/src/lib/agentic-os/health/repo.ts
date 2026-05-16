import 'server-only';
import { randomUUID } from 'node:crypto';
import { getHealthPool } from './session';
import type { ScreenerKey, Severity } from './screeners';
import type {
  ConsentScope,
  MentalProfileInput,
} from './schemas';
import type { RiskFlagInput, RiskFlagSeverity } from '../_shared/types';
import {
  getFood as fdcGetFood,
  isUsdaConfigured,
  mapFdcToFoodItem,
  searchFoods as fdcSearchFoods,
} from './usda-fdc';

// ─── Raw DB row shapes ─────────────────────────────────────────────────────
//
// Loosely-typed shapes that mirror node-postgres results for this OS. Most
// columns are typed as the narrowest TS shape the mappers actually consume;
// JSONB columns are kept as `unknown` and cast at the access site.

interface RawScreenerRow {
  id: string;
  user_id: string;
  screener: string;
  answers: unknown;
  score: number;
  severity: string;
  crisis_flag: boolean;
  created_at: Date;
}

interface RawMentalProfileRow {
  user_id: string;
  tenant_id: string;
  stress_baseline: number | string | null;
  sleep_quality: string | null;
  support_system: string | null;
  current_therapy: boolean | null;
  current_meds: boolean | null;
  med_notes: string | null;
  goals: string[] | null;
  created_at: Date;
  updated_at: Date;
}

interface RawConsentRow {
  id: string;
  user_id: string;
  tenant_id: string;
  scope: ConsentScope;
  granted: boolean;
  granted_at: Date;
  revoked_at: Date | null;
  metadata: Record<string, unknown> | null;
}

interface RawRiskFlagRow {
  id: string;
  user_id: string;
  tenant_id: string;
  kind: string;
  severity: string;
  source: string;
  payload: Record<string, unknown> | null;
  created_at: Date;
  dismissed_at: Date | null;
  dismissed_by_user_id: string | null;
}

interface RawMoodEntryRow {
  id: string;
  user_id: string;
  tenant_id: string;
  mood_score: number | string | null;
  energy_score: number | string | null;
  anxiety_score: number | string | null;
  sleep_quality: string | null;
  notes: string | null;
  entry_at: Date;
  created_at: Date;
  updated_at: Date;
}

interface RawMoodTagRow {
  id: string;
  user_id: string;
  tenant_id: string;
  name: string;
  color: string | null;
  created_at: Date;
}

interface RawJournalPromptRow {
  id: string;
  slug: string;
  category: string;
  prompt: string;
  source: string | null;
  is_seed: boolean;
}

interface RawJournalEntryRow {
  id: string;
  user_id: string;
  tenant_id: string;
  prompt_id: string | null;
  title: string | null;
  body: string;
  entry_at: Date;
  created_at: Date;
  updated_at: Date;
}

interface RawCbtExerciseRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: string;
  citation: string | null;
  instructions: Record<string, unknown> | null;
  is_seed: boolean;
}

interface RawCbtLogRow {
  id: string;
  user_id: string;
  tenant_id: string;
  kind: string;
  exercise_id: string | null;
  started_at: Date;
  completed_at: Date | null;
  mood_before: number | string | null;
  mood_after: number | string | null;
  data: Record<string, unknown> | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface RawMeditationSessionRow {
  id: string;
  user_id: string;
  tenant_id: string;
  source: string;
  source_ref: string | null;
  duration_min: number | string;
  completed_at: Date;
  mood_before: number | string | null;
  mood_after: number | string | null;
  notes: string | null;
  created_at: Date;
}

interface RawMeditationPlanRow {
  id: string;
  user_id: string;
  tenant_id: string;
  week_start: Date | string;
  plan: unknown;
  created_at: Date;
}

interface RawFoodItemRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  source: string;
  usda_fdc_id: string | null;
  name: string;
  brand: string | null;
  serving_size_g: number | string | null;
  serving_label: string | null;
  kcal: number | string | null;
  protein_g: number | string | null;
  carbs_g: number | string | null;
  fat_g: number | string | null;
  fiber_g: number | string | null;
  sugar_g: number | string | null;
  sodium_mg: number | string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface RawMealEntryRow {
  id: string;
  tenant_id: string;
  user_id: string;
  entry_date: Date | string;
  meal_slot: string;
  food_item_id: string | null;
  freeform_description: string | null;
  servings: number | string;
  kcal_override: number | string | null;
  protein_g_override: number | string | null;
  carbs_g_override: number | string | null;
  fat_g_override: number | string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface RawActivityEntryRow {
  id: string;
  tenant_id: string;
  user_id: string;
  entry_date: Date | string;
  activity_type: string;
  duration_min: number | string;
  intensity: string;
  kcal_burned: number | string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface RawRecipeRow {
  id: string;
  tenant_id: string;
  user_id: string;
  name: string;
  description: string | null;
  servings: number | string;
  prep_minutes: number | string | null;
  cook_minutes: number | string | null;
  instructions: string | null;
  tags: string[] | null;
  image_url: string | null;
  created_at: Date;
  updated_at: Date;
}

interface RawRecipeIngredientRow {
  id: string;
  recipe_id: string;
  food_item_id: string | null;
  freeform_name: string | null;
  quantity: number | string;
  unit: string | null;
  position: number | string;
  notes: string | null;
}

interface RawMealPlanRow {
  id: string;
  tenant_id: string;
  user_id: string;
  week_start_date: Date | string;
  name: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface RawMealPlanSlotRow {
  id: string;
  plan_id: string;
  day_of_week: number | string;
  meal_slot: string;
  recipe_id: string | null;
  food_item_id: string | null;
  freeform_text: string | null;
  servings: number | string;
  notes: string | null;
  position: number | string;
}

interface RawWorkoutTemplateRow {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  source: string;
  name: string;
  description: string | null;
  category: string;
  target_intensity: string;
  est_duration_min: number | string;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
  block_count?: number | string;
}

interface RawWorkoutTemplateBlockRow {
  id: string;
  template_id: string;
  position: number | string;
  kind: string;
  name: string;
  sets: number | string | null;
  reps: string | null;
  duration_sec: number | string | null;
  rest_sec: number | string | null;
  weight_hint: string | null;
  notes: string | null;
}

interface RawActivityPlanRow {
  id: string;
  tenant_id: string;
  user_id: string;
  week_start_date: Date | string;
  name: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface RawActivityPlanSlotRow {
  id: string;
  plan_id: string;
  day_of_week: number | string;
  template_id: string | null;
  freeform_text: string | null;
  target_duration_min: number | string | null;
  target_intensity: string | null;
  notes: string | null;
  position: number | string;
}

// ─── Profile ───────────────────────────────────────────────────────────────

export interface HealthProfile {
  userId: string;
  sex: string | null;
  dateOfBirth: string | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: string | null;
  goals: string[];
  conditions: string[];
  medications: string[];
  allergies: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProfileUpsert {
  sex?: string | null;
  dateOfBirth?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  activityLevel?: string | null;
  goals?: string[];
  conditions?: string[];
  medications?: string[];
  allergies?: string[];
}

export async function getProfile(userId: string): Promise<HealthProfile | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT user_id, sex, date_of_birth, height_cm, weight_kg, activity_level,
            goals, conditions, medications, allergies, created_at, updated_at
       FROM agos_health_profile WHERE user_id = $1`,
    [userId],
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0];
  return {
    userId: row.user_id,
    sex: row.sex,
    dateOfBirth: row.date_of_birth ? row.date_of_birth.toISOString().slice(0, 10) : null,
    heightCm: row.height_cm === null ? null : Number(row.height_cm),
    weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
    activityLevel: row.activity_level,
    goals: row.goals ?? [],
    conditions: row.conditions ?? [],
    medications: row.medications ?? [],
    allergies: row.allergies ?? [],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function upsertProfile(
  userId: string,
  patch: ProfileUpsert,
): Promise<HealthProfile> {
  const pool = getHealthPool();
  await pool.query(
    `INSERT INTO agos_health_profile (
        user_id, sex, date_of_birth, height_cm, weight_kg, activity_level,
        goals, conditions, medications, allergies)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET
        sex            = COALESCE(EXCLUDED.sex, agos_health_profile.sex),
        date_of_birth  = COALESCE(EXCLUDED.date_of_birth, agos_health_profile.date_of_birth),
        height_cm      = COALESCE(EXCLUDED.height_cm, agos_health_profile.height_cm),
        weight_kg      = COALESCE(EXCLUDED.weight_kg, agos_health_profile.weight_kg),
        activity_level = COALESCE(EXCLUDED.activity_level, agos_health_profile.activity_level),
        goals          = EXCLUDED.goals,
        conditions     = EXCLUDED.conditions,
        medications    = EXCLUDED.medications,
        allergies      = EXCLUDED.allergies,
        updated_at     = now()`,
    [
      userId,
      patch.sex ?? null,
      patch.dateOfBirth ?? null,
      patch.heightCm ?? null,
      patch.weightKg ?? null,
      patch.activityLevel ?? null,
      JSON.stringify(patch.goals ?? []),
      JSON.stringify(patch.conditions ?? []),
      JSON.stringify(patch.medications ?? []),
      JSON.stringify(patch.allergies ?? []),
    ],
  );
  const updated = await getProfile(userId);
  if (!updated) throw new Error('Failed to upsert health profile');
  return updated;
}

// ─── Screeners ─────────────────────────────────────────────────────────────

export interface ScreenerRow {
  id: string;
  userId: string;
  screener: ScreenerKey;
  answers: number[];
  score: number;
  severity: Severity;
  crisisFlag: boolean;
  createdAt: string;
}

export async function recordScreener(args: {
  userId: string;
  screener: ScreenerKey;
  answers: number[];
  score: number;
  severity: Severity;
  crisisFlag: boolean;
}): Promise<ScreenerRow> {
  const pool = getHealthPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_health_screeners
       (id, user_id, screener, answers, score, severity, crisis_flag)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7)`,
    [
      id,
      args.userId,
      args.screener,
      JSON.stringify(args.answers),
      args.score,
      args.severity,
      args.crisisFlag,
    ],
  );
  return {
    id,
    userId: args.userId,
    screener: args.screener,
    answers: args.answers,
    score: args.score,
    severity: args.severity,
    crisisFlag: args.crisisFlag,
    createdAt: new Date().toISOString(),
  };
}

export async function listScreeners(userId: string, limit = 25): Promise<ScreenerRow[]> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT id, user_id, screener, answers, score, severity, crisis_flag, created_at
       FROM agos_health_screeners
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [userId, limit],
  );
  return r.rows.map((row: RawScreenerRow) => ({
    id: row.id,
    userId: row.user_id,
    screener: row.screener as ScreenerKey,
    answers: (row.answers ?? []) as number[],
    score: row.score,
    severity: row.severity as Severity,
    crisisFlag: row.crisis_flag,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function hasActiveCrisisFlag(userId: string): Promise<boolean> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_health_screeners
      WHERE user_id = $1 AND crisis_flag = TRUE
        AND created_at > now() - INTERVAL '24 hours'
      LIMIT 1`,
    [userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Intake ────────────────────────────────────────────────────────────────

export async function recordIntake(args: {
  userId: string;
  intakeKind: string;
  answers: Record<string, unknown>;
  freeText?: string | null;
}): Promise<string> {
  const pool = getHealthPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_health_intake (id, user_id, intake_kind, answers, free_text)
     VALUES ($1,$2,$3,$4::jsonb,$5)`,
    [id, args.userId, args.intakeKind, JSON.stringify(args.answers), args.freeText ?? null],
  );
  return id;
}

// ─── Audit ─────────────────────────────────────────────────────────────────

export async function recordAudit(args: {
  actorId: string;
  action: string;
  payload?: Record<string, unknown>;
  projectId?: string;
}): Promise<void> {
  const pool = getHealthPool();
  await pool.query(
    `INSERT INTO agos_audit (id, project_id, actor_id, os_slug, action, payload)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [
      randomUUID(),
      args.projectId ?? null,
      args.actorId,
      'health',
      args.action,
      JSON.stringify(args.payload ?? {}),
    ],
  );
}

// ─── Mental-health profile (Phase 1) ───────────────────────────────────────

export interface MentalProfile {
  userId: string;
  tenantId: string;
  stressBaseline: number | null;
  sleepQuality: string | null;
  supportSystem: string | null;
  currentTherapy: boolean;
  currentMeds: boolean;
  medNotes: string | null;
  goals: string[];
  createdAt: string;
  updatedAt: string;
}

function rowToMentalProfile(row: RawMentalProfileRow): MentalProfile {
  return {
    userId: row.user_id,
    tenantId: row.tenant_id,
    stressBaseline: row.stress_baseline === null ? null : Number(row.stress_baseline),
    sleepQuality: row.sleep_quality,
    supportSystem: row.support_system,
    currentTherapy: !!row.current_therapy,
    currentMeds: !!row.current_meds,
    medNotes: row.med_notes,
    goals: row.goals ?? [],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function getMentalProfile(
  userId: string,
  tenantId: string,
): Promise<MentalProfile | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT user_id, tenant_id, stress_baseline, sleep_quality, support_system,
            current_therapy, current_meds, med_notes, goals,
            created_at, updated_at
       FROM agos_mh_profile
      WHERE user_id = $1 AND tenant_id = $2`,
    [userId, tenantId],
  );
  if (r.rowCount === 0) return null;
  return rowToMentalProfile(r.rows[0]);
}

export async function upsertMentalProfile(
  userId: string,
  tenantId: string,
  patch: MentalProfileInput,
): Promise<MentalProfile> {
  const pool = getHealthPool();
  await pool.query(
    `INSERT INTO agos_mh_profile (
        user_id, tenant_id, stress_baseline, sleep_quality, support_system,
        current_therapy, current_meds, med_notes, goals)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET
        tenant_id        = EXCLUDED.tenant_id,
        stress_baseline  = COALESCE(EXCLUDED.stress_baseline, agos_mh_profile.stress_baseline),
        sleep_quality    = COALESCE(EXCLUDED.sleep_quality, agos_mh_profile.sleep_quality),
        support_system   = COALESCE(EXCLUDED.support_system, agos_mh_profile.support_system),
        current_therapy  = COALESCE(EXCLUDED.current_therapy, agos_mh_profile.current_therapy),
        current_meds     = COALESCE(EXCLUDED.current_meds, agos_mh_profile.current_meds),
        med_notes        = COALESCE(EXCLUDED.med_notes, agos_mh_profile.med_notes),
        goals            = EXCLUDED.goals,
        updated_at       = now()`,
    [
      userId,
      tenantId,
      patch.stressBaseline ?? null,
      patch.sleepQuality ?? null,
      patch.supportSystem ?? null,
      patch.currentTherapy ?? false,
      patch.currentMeds ?? false,
      patch.medNotes ?? null,
      JSON.stringify(patch.goals ?? []),
    ],
  );
  const updated = await getMentalProfile(userId, tenantId);
  if (!updated) throw new Error('Failed to upsert mental profile');
  return updated;
}

// ─── Consent (Phase 1) ──────────────────────────────────────────────────────

export interface ConsentRow {
  id: string;
  userId: string;
  tenantId: string;
  scope: ConsentScope;
  granted: boolean;
  grantedAt: string;
  revokedAt: string | null;
  metadata: Record<string, unknown>;
}

function rowToConsent(row: RawConsentRow): ConsentRow {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    scope: row.scope,
    granted: !!row.granted,
    grantedAt: row.granted_at.toISOString(),
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
    metadata: row.metadata ?? {},
  };
}

export async function getActiveConsent(
  userId: string,
  tenantId: string,
  scope: ConsentScope,
): Promise<ConsentRow | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT id, user_id, tenant_id, scope, granted, granted_at, revoked_at, metadata
       FROM agos_health_consent
      WHERE user_id = $1 AND tenant_id = $2 AND scope = $3`,
    [userId, tenantId, scope],
  );
  if (r.rowCount === 0) return null;
  return rowToConsent(r.rows[0]);
}

export async function listConsents(
  userId: string,
  tenantId: string,
): Promise<ConsentRow[]> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT id, user_id, tenant_id, scope, granted, granted_at, revoked_at, metadata
       FROM agos_health_consent
      WHERE user_id = $1 AND tenant_id = $2
      ORDER BY scope`,
    [userId, tenantId],
  );
  return r.rows.map(rowToConsent);
}

export async function setConsent(
  userId: string,
  tenantId: string,
  scope: ConsentScope,
  granted: boolean,
  metadata?: Record<string, unknown>,
): Promise<ConsentRow> {
  const pool = getHealthPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_health_consent (id, user_id, tenant_id, scope, granted, revoked_at, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
     ON CONFLICT (user_id, scope) DO UPDATE SET
        granted     = EXCLUDED.granted,
        granted_at  = CASE WHEN EXCLUDED.granted THEN now() ELSE agos_health_consent.granted_at END,
        revoked_at  = CASE WHEN EXCLUDED.granted THEN NULL ELSE now() END,
        metadata    = EXCLUDED.metadata`,
    [
      id,
      userId,
      tenantId,
      scope,
      granted,
      granted ? null : new Date(),
      JSON.stringify(metadata ?? {}),
    ],
  );
  const row = await getActiveConsent(userId, tenantId, scope);
  if (!row) throw new Error('Failed to upsert consent');
  return row;
}

// ─── Risk flags (Phase 1) ───────────────────────────────────────────────────

export interface RiskFlagRow {
  id: string;
  userId: string;
  tenantId: string;
  kind: string;
  severity: RiskFlagSeverity;
  source: string;
  payload: Record<string, unknown>;
  createdAt: string;
  dismissedAt: string | null;
  dismissedByUserId: string | null;
}

function rowToRiskFlag(row: RawRiskFlagRow): RiskFlagRow {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    kind: row.kind,
    severity: row.severity as RiskFlagSeverity,
    source: row.source,
    payload: row.payload ?? {},
    createdAt: row.created_at.toISOString(),
    dismissedAt: row.dismissed_at ? row.dismissed_at.toISOString() : null,
    dismissedByUserId: row.dismissed_by_user_id,
  };
}

export interface ListRiskFlagsOpts {
  activeOnly?: boolean;
  limit?: number;
}

export async function listRiskFlags(
  userId: string,
  tenantId: string,
  opts: ListRiskFlagsOpts = {},
): Promise<RiskFlagRow[]> {
  const pool = getHealthPool();
  const activeOnly = opts.activeOnly ?? true;
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const r = await pool.query(
    `SELECT id, user_id, tenant_id, kind, severity, source, payload,
            created_at, dismissed_at, dismissed_by_user_id
       FROM agos_health_risk_flag
      WHERE user_id = $1 AND tenant_id = $2
        ${activeOnly ? 'AND dismissed_at IS NULL' : ''}
      ORDER BY created_at DESC
      LIMIT $3`,
    [userId, tenantId, limit],
  );
  return r.rows.map(rowToRiskFlag);
}

export async function recordRiskFlag(
  userId: string,
  tenantId: string,
  flag: RiskFlagInput,
): Promise<RiskFlagRow> {
  const pool = getHealthPool();
  const id = randomUUID();
  const r = await pool.query(
    `INSERT INTO agos_health_risk_flag
       (id, user_id, tenant_id, kind, severity, source, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
     RETURNING id, user_id, tenant_id, kind, severity, source, payload,
               created_at, dismissed_at, dismissed_by_user_id`,
    [
      id,
      userId,
      tenantId,
      flag.kind,
      flag.severity,
      flag.source,
      JSON.stringify(flag.payload ?? {}),
    ],
  );
  return rowToRiskFlag(r.rows[0]);
}

export async function recordRiskFlags(
  userId: string,
  tenantId: string,
  flags: RiskFlagInput[],
): Promise<RiskFlagRow[]> {
  const out: RiskFlagRow[] = [];
  for (const f of flags) {
    out.push(await recordRiskFlag(userId, tenantId, f));
  }
  return out;
}

/**
 * Dismiss a risk flag. The owner check is enforced at the SQL layer:
 * the UPDATE only touches rows whose `user_id` matches the actor. The
 * caller can detect "not found / not owner" via the returned row count.
 */
export async function dismissRiskFlag(
  flagId: string,
  userId: string,
): Promise<RiskFlagRow | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `UPDATE agos_health_risk_flag
        SET dismissed_at = now(),
            dismissed_by_user_id = $2
      WHERE id = $1 AND user_id = $2 AND dismissed_at IS NULL
      RETURNING id, user_id, tenant_id, kind, severity, source, payload,
                created_at, dismissed_at, dismissed_by_user_id`,
    [flagId, userId],
  );
  if (r.rowCount === 0) return null;
  return rowToRiskFlag(r.rows[0]);
}

// ─── Mood entries (Phase 2) ─────────────────────────────────────────────────

export interface MoodEntry {
  id: string;
  userId: string;
  tenantId: string;
  moodScore: number | null;
  energyScore: number | null;
  anxietyScore: number | null;
  sleepQuality: string | null;
  notes: string | null;
  entryAt: string;
  createdAt: string;
  updatedAt: string;
  tags?: MoodTag[];
}

function rowToMoodEntry(row: RawMoodEntryRow): MoodEntry {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    moodScore: row.mood_score === null ? null : Number(row.mood_score),
    energyScore: row.energy_score === null ? null : Number(row.energy_score),
    anxietyScore: row.anxiety_score === null ? null : Number(row.anxiety_score),
    sleepQuality: row.sleep_quality,
    notes: row.notes,
    entryAt: row.entry_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface MoodEntryInput {
  moodScore?: number | null;
  energyScore?: number | null;
  anxietyScore?: number | null;
  sleepQuality?: string | null;
  notes?: string | null;
  entryAt?: Date | string | null;
  tagIds?: string[];
}

export async function recordMoodEntry(
  userId: string,
  tenantId: string,
  patch: MoodEntryInput,
): Promise<MoodEntry> {
  const pool = getHealthPool();
  const id = randomUUID();
  const entryAt =
    patch.entryAt instanceof Date
      ? patch.entryAt
      : patch.entryAt
        ? new Date(patch.entryAt)
        : new Date();
  const r = await pool.query(
    `INSERT INTO agos_mh_mood_entry
       (id, user_id, tenant_id, mood_score, energy_score, anxiety_score,
        sleep_quality, notes, entry_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, user_id, tenant_id, mood_score, energy_score, anxiety_score,
               sleep_quality, notes, entry_at, created_at, updated_at`,
    [
      id,
      userId,
      tenantId,
      patch.moodScore ?? null,
      patch.energyScore ?? null,
      patch.anxietyScore ?? null,
      patch.sleepQuality ?? null,
      patch.notes ?? null,
      entryAt,
    ],
  );
  if (patch.tagIds && patch.tagIds.length > 0) {
    await attachTagsToEntry(id, userId, patch.tagIds);
  }
  return rowToMoodEntry(r.rows[0]);
}

export interface ListMoodEntryOpts {
  from?: Date | string;
  to?: Date | string;
  limit?: number;
  withTags?: boolean;
}

export async function listMoodEntries(
  userId: string,
  opts: ListMoodEntryOpts = {},
): Promise<MoodEntry[]> {
  const pool = getHealthPool();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 365);
  const params: unknown[] = [userId];
  let where = 'WHERE user_id = $1';
  if (opts.from) {
    params.push(opts.from instanceof Date ? opts.from : new Date(opts.from));
    where += ` AND entry_at >= $${params.length}`;
  }
  if (opts.to) {
    params.push(opts.to instanceof Date ? opts.to : new Date(opts.to));
    where += ` AND entry_at <= $${params.length}`;
  }
  params.push(limit);
  const r = await pool.query(
    `SELECT id, user_id, tenant_id, mood_score, energy_score, anxiety_score,
            sleep_quality, notes, entry_at, created_at, updated_at
       FROM agos_mh_mood_entry
       ${where}
      ORDER BY entry_at DESC
      LIMIT $${params.length}`,
    params,
  );
  const entries = r.rows.map(rowToMoodEntry);
  if (opts.withTags && entries.length > 0) {
    const ids = entries.map((e) => e.id);
    const tagRows = await pool.query(
      `SELECT met.mood_entry_id, t.id, t.user_id, t.tenant_id, t.name, t.color, t.created_at
         FROM agos_mh_mood_entry_tag met
         JOIN agos_mh_mood_tag t ON t.id = met.tag_id
        WHERE met.mood_entry_id = ANY($1::uuid[])`,
      [ids],
    );
    const byEntry = new Map<string, MoodTag[]>();
    for (const row of tagRows.rows) {
      const list = byEntry.get(row.mood_entry_id) ?? [];
      list.push(rowToMoodTag(row));
      byEntry.set(row.mood_entry_id, list);
    }
    for (const entry of entries) {
      entry.tags = byEntry.get(entry.id) ?? [];
    }
  }
  return entries;
}

export async function getMoodEntry(
  id: string,
  userId: string,
): Promise<MoodEntry | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT id, user_id, tenant_id, mood_score, energy_score, anxiety_score,
            sleep_quality, notes, entry_at, created_at, updated_at
       FROM agos_mh_mood_entry
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if (r.rowCount === 0) return null;
  const entry = rowToMoodEntry(r.rows[0]);
  // Always attach tags on a single-entry fetch — the UI needs them for
  // edit forms and the cost is one extra small query.
  const tagRows = await pool.query(
    `SELECT t.id, t.user_id, t.tenant_id, t.name, t.color, t.created_at
       FROM agos_mh_mood_entry_tag met
       JOIN agos_mh_mood_tag t ON t.id = met.tag_id
      WHERE met.mood_entry_id = $1`,
    [id],
  );
  entry.tags = tagRows.rows.map(rowToMoodTag);
  return entry;
}

export async function updateMoodEntry(
  id: string,
  userId: string,
  patch: MoodEntryInput,
): Promise<MoodEntry | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `UPDATE agos_mh_mood_entry
        SET mood_score    = COALESCE($3, mood_score),
            energy_score  = COALESCE($4, energy_score),
            anxiety_score = COALESCE($5, anxiety_score),
            sleep_quality = COALESCE($6, sleep_quality),
            notes         = COALESCE($7, notes),
            entry_at      = COALESCE($8, entry_at),
            updated_at    = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id, user_id, tenant_id, mood_score, energy_score, anxiety_score,
                sleep_quality, notes, entry_at, created_at, updated_at`,
    [
      id,
      userId,
      patch.moodScore ?? null,
      patch.energyScore ?? null,
      patch.anxietyScore ?? null,
      patch.sleepQuality ?? null,
      patch.notes ?? null,
      patch.entryAt
        ? patch.entryAt instanceof Date
          ? patch.entryAt
          : new Date(patch.entryAt)
        : null,
    ],
  );
  if (r.rowCount === 0) return null;
  if (patch.tagIds) {
    // Replace-set semantics on tag updates — clear and re-attach.
    await pool.query(
      `DELETE FROM agos_mh_mood_entry_tag WHERE mood_entry_id = $1`,
      [id],
    );
    if (patch.tagIds.length > 0) {
      await attachTagsToEntry(id, userId, patch.tagIds);
    }
  }
  return rowToMoodEntry(r.rows[0]);
}

export async function deleteMoodEntry(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getHealthPool();
  const r = await pool.query(
    `DELETE FROM agos_mh_mood_entry WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Mood tags (Phase 2) ────────────────────────────────────────────────────

export interface MoodTag {
  id: string;
  userId: string;
  tenantId: string;
  name: string;
  color: string | null;
  createdAt: string;
}

function rowToMoodTag(row: RawMoodTagRow): MoodTag {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Starter tags seeded on first user access. Kept here (not in the
 * migration) because the migration runs before any users exist; the
 * intent is "first time this user opens the mood feature, give them
 * something to start with."
 */
export const STARTER_MOOD_TAGS: { name: string; color: string }[] = [
  { name: 'anxious', color: 'amber' },
  { name: 'focused', color: 'sky' },
  { name: 'tired', color: 'slate' },
  { name: 'energetic', color: 'emerald' },
  { name: 'lonely', color: 'violet' },
  { name: 'connected', color: 'rose' },
];

export async function listMoodTags(
  userId: string,
  tenantId: string,
): Promise<MoodTag[]> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT id, user_id, tenant_id, name, color, created_at
       FROM agos_mh_mood_tag
      WHERE user_id = $1
      ORDER BY name`,
    [userId],
  );
  if (r.rowCount === 0) {
    // First access — seed the starter set and return what we just wrote.
    const seeded: MoodTag[] = [];
    for (const tag of STARTER_MOOD_TAGS) {
      const id = randomUUID();
      const ins = await pool.query(
        `INSERT INTO agos_mh_mood_tag (id, user_id, tenant_id, name, color)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (user_id, name) DO NOTHING
         RETURNING id, user_id, tenant_id, name, color, created_at`,
        [id, userId, tenantId, tag.name, tag.color],
      );
      if (ins.rowCount && ins.rowCount > 0) {
        seeded.push(rowToMoodTag(ins.rows[0]));
      }
    }
    if (seeded.length > 0) return seeded;
    // Fall through if seeding raced; re-read.
    const re = await pool.query(
      `SELECT id, user_id, tenant_id, name, color, created_at
         FROM agos_mh_mood_tag WHERE user_id = $1 ORDER BY name`,
      [userId],
    );
    return re.rows.map(rowToMoodTag);
  }
  return r.rows.map(rowToMoodTag);
}

export async function createMoodTag(
  userId: string,
  tenantId: string,
  name: string,
  color: string | null,
): Promise<MoodTag> {
  const pool = getHealthPool();
  const id = randomUUID();
  const r = await pool.query(
    `INSERT INTO agos_mh_mood_tag (id, user_id, tenant_id, name, color)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id, name) DO UPDATE SET color = EXCLUDED.color
     RETURNING id, user_id, tenant_id, name, color, created_at`,
    [id, userId, tenantId, name.trim(), color],
  );
  return rowToMoodTag(r.rows[0]);
}

export async function attachTagsToEntry(
  moodEntryId: string,
  userId: string,
  tagIds: string[],
): Promise<void> {
  if (tagIds.length === 0) return;
  const pool = getHealthPool();
  // Defensive: only attach tags the caller actually owns. The migration
  // CASCADEs on delete but does not enforce ownership at write time.
  const owned = await pool.query(
    `SELECT id FROM agos_mh_mood_tag WHERE id = ANY($1::uuid[]) AND user_id = $2`,
    [tagIds, userId],
  );
  const ownedIds: string[] = owned.rows.map((row: { id: string }) => row.id);
  for (const tagId of ownedIds) {
    await pool.query(
      `INSERT INTO agos_mh_mood_entry_tag (mood_entry_id, tag_id)
       VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [moodEntryId, tagId],
    );
  }
}

export async function detachTagsFromEntry(
  moodEntryId: string,
  userId: string,
  tagIds: string[],
): Promise<void> {
  if (tagIds.length === 0) return;
  const pool = getHealthPool();
  // Confirm the entry belongs to the actor before detaching anything.
  const owns = await pool.query(
    `SELECT 1 FROM agos_mh_mood_entry WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [moodEntryId, userId],
  );
  if (owns.rowCount === 0) return;
  await pool.query(
    `DELETE FROM agos_mh_mood_entry_tag
      WHERE mood_entry_id = $1 AND tag_id = ANY($2::uuid[])`,
    [moodEntryId, tagIds],
  );
}

// ─── Journal prompts (Phase 2) ──────────────────────────────────────────────

export type JournalPromptCategory =
  | 'cbt-thought-record'
  | 'gratitude'
  | 'values-clarification'
  | 'behavioral-activation'
  | 'self-compassion';

export interface JournalPrompt {
  id: string;
  slug: string;
  category: JournalPromptCategory;
  prompt: string;
  source: string | null;
  isSeed: boolean;
}

function rowToJournalPrompt(row: RawJournalPromptRow): JournalPrompt {
  return {
    id: row.id,
    slug: row.slug,
    category: row.category as JournalPromptCategory,
    prompt: row.prompt,
    source: row.source,
    isSeed: !!row.is_seed,
  };
}

export async function listJournalPrompts(
  opts: { category?: JournalPromptCategory } = {},
): Promise<JournalPrompt[]> {
  const pool = getHealthPool();
  const params: unknown[] = [];
  let where = '';
  if (opts.category) {
    params.push(opts.category);
    where = `WHERE category = $${params.length}`;
  }
  const r = await pool.query(
    `SELECT id, slug, category, prompt, source, is_seed
       FROM agos_mh_journal_prompt
       ${where}
      ORDER BY category, slug`,
    params,
  );
  return r.rows.map(rowToJournalPrompt);
}

export async function getJournalPrompt(
  slugOrId: string,
): Promise<JournalPrompt | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT id, slug, category, prompt, source, is_seed
       FROM agos_mh_journal_prompt
      WHERE slug = $1 OR id::text = $1
      LIMIT 1`,
    [slugOrId],
  );
  if (r.rowCount === 0) return null;
  return rowToJournalPrompt(r.rows[0]);
}

// ─── Journal entries (Phase 2) ──────────────────────────────────────────────

export interface JournalEntry {
  id: string;
  userId: string;
  tenantId: string;
  promptId: string | null;
  prompt?: JournalPrompt | null;
  title: string | null;
  body: string;
  entryAt: string;
  createdAt: string;
  updatedAt: string;
}

function rowToJournalEntry(row: RawJournalEntryRow): JournalEntry {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    promptId: row.prompt_id,
    title: row.title,
    body: row.body,
    entryAt: row.entry_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface JournalEntryInput {
  promptId?: string | null;
  title?: string | null;
  body: string;
  entryAt?: Date | string | null;
}

export async function recordJournalEntry(
  userId: string,
  tenantId: string,
  patch: JournalEntryInput,
): Promise<JournalEntry> {
  const pool = getHealthPool();
  const id = randomUUID();
  const entryAt =
    patch.entryAt instanceof Date
      ? patch.entryAt
      : patch.entryAt
        ? new Date(patch.entryAt)
        : new Date();
  const r = await pool.query(
    `INSERT INTO agos_mh_journal_entry
       (id, user_id, tenant_id, prompt_id, title, body, entry_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, user_id, tenant_id, prompt_id, title, body,
               entry_at, created_at, updated_at`,
    [
      id,
      userId,
      tenantId,
      patch.promptId ?? null,
      patch.title ?? null,
      patch.body,
      entryAt,
    ],
  );
  return rowToJournalEntry(r.rows[0]);
}

export interface ListJournalEntryOpts {
  from?: Date | string;
  to?: Date | string;
  limit?: number;
  withPrompt?: boolean;
}

export async function listJournalEntries(
  userId: string,
  opts: ListJournalEntryOpts = {},
): Promise<JournalEntry[]> {
  const pool = getHealthPool();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 365);
  const params: unknown[] = [userId];
  let where = 'WHERE j.user_id = $1';
  if (opts.from) {
    params.push(opts.from instanceof Date ? opts.from : new Date(opts.from));
    where += ` AND j.entry_at >= $${params.length}`;
  }
  if (opts.to) {
    params.push(opts.to instanceof Date ? opts.to : new Date(opts.to));
    where += ` AND j.entry_at <= $${params.length}`;
  }
  params.push(limit);
  const r = await pool.query(
    `SELECT j.id, j.user_id, j.tenant_id, j.prompt_id, j.title, j.body,
            j.entry_at, j.created_at, j.updated_at,
            p.slug AS p_slug, p.category AS p_category,
            p.prompt AS p_prompt, p.source AS p_source, p.is_seed AS p_is_seed
       FROM agos_mh_journal_entry j
       LEFT JOIN agos_mh_journal_prompt p ON p.id = j.prompt_id
       ${where}
      ORDER BY j.entry_at DESC
      LIMIT $${params.length}`,
    params,
  );
  type JoinedJournalRow = RawJournalEntryRow & {
    p_slug: string | null;
    p_category: string | null;
    p_prompt: string | null;
    p_source: string | null;
    p_is_seed: boolean | null;
  };
  return r.rows.map((row: JoinedJournalRow) => {
    const entry = rowToJournalEntry(row);
    if (opts.withPrompt && row.prompt_id) {
      entry.prompt = {
        id: row.prompt_id,
        slug: row.p_slug as string,
        category: row.p_category as JournalPromptCategory,
        prompt: row.p_prompt as string,
        source: row.p_source,
        isSeed: !!row.p_is_seed,
      };
    }
    return entry;
  });
}

export async function getJournalEntry(
  id: string,
  userId: string,
): Promise<JournalEntry | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT j.id, j.user_id, j.tenant_id, j.prompt_id, j.title, j.body,
            j.entry_at, j.created_at, j.updated_at,
            p.slug AS p_slug, p.category AS p_category,
            p.prompt AS p_prompt, p.source AS p_source, p.is_seed AS p_is_seed
       FROM agos_mh_journal_entry j
       LEFT JOIN agos_mh_journal_prompt p ON p.id = j.prompt_id
      WHERE j.id = $1 AND j.user_id = $2`,
    [id, userId],
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0];
  const entry = rowToJournalEntry(row);
  if (row.prompt_id) {
    entry.prompt = {
      id: row.prompt_id,
      slug: row.p_slug,
      category: row.p_category,
      prompt: row.p_prompt,
      source: row.p_source,
      isSeed: !!row.p_is_seed,
    };
  }
  return entry;
}

export async function updateJournalEntry(
  id: string,
  userId: string,
  patch: Partial<JournalEntryInput>,
): Promise<JournalEntry | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `UPDATE agos_mh_journal_entry
        SET title      = COALESCE($3, title),
            body       = COALESCE($4, body),
            prompt_id  = COALESCE($5, prompt_id),
            entry_at   = COALESCE($6, entry_at),
            updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id, user_id, tenant_id, prompt_id, title, body,
                entry_at, created_at, updated_at`,
    [
      id,
      userId,
      patch.title ?? null,
      patch.body ?? null,
      patch.promptId ?? null,
      patch.entryAt
        ? patch.entryAt instanceof Date
          ? patch.entryAt
          : new Date(patch.entryAt)
        : null,
    ],
  );
  if (r.rowCount === 0) return null;
  return rowToJournalEntry(r.rows[0]);
}

export async function deleteJournalEntry(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getHealthPool();
  const r = await pool.query(
    `DELETE FROM agos_mh_journal_entry WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── CBT exercise catalog (Phase 3) ─────────────────────────────────────────

export type CbtKindValue =
  | 'thought-record'
  | 'behavioral-activation'
  | 'worry-time'
  | 'grounding-54321'
  | 'gratitude'
  | 'values-clarification'
  | 'sleep-hygiene';

export interface CbtExercise {
  id: string;
  slug: string;
  name: string;
  description: string;
  kind: CbtKindValue;
  citation: string | null;
  instructions: Record<string, unknown>;
  isSeed: boolean;
}

function rowToCbtExercise(row: RawCbtExerciseRow): CbtExercise {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? '',
    kind: row.kind as CbtKindValue,
    citation: row.citation,
    instructions: row.instructions ?? {},
    isSeed: !!row.is_seed,
  };
}

export async function listCbtExercises(): Promise<CbtExercise[]> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT id, slug, name, description, kind, citation, instructions, is_seed
       FROM agos_mh_cbt_exercise
      ORDER BY name`,
  );
  return r.rows.map(rowToCbtExercise);
}

export async function getCbtExercise(
  slugOrId: string,
): Promise<CbtExercise | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT id, slug, name, description, kind, citation, instructions, is_seed
       FROM agos_mh_cbt_exercise
      WHERE slug = $1 OR id::text = $1
      LIMIT 1`,
    [slugOrId],
  );
  if (r.rowCount === 0) return null;
  return rowToCbtExercise(r.rows[0]);
}

// ─── CBT logs (Phase 3) ─────────────────────────────────────────────────────

export interface CbtLog {
  id: string;
  userId: string;
  tenantId: string;
  kind: CbtKindValue;
  exerciseId: string | null;
  startedAt: string;
  completedAt: string | null;
  moodBefore: number | null;
  moodAfter: number | null;
  data: Record<string, unknown>;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToCbtLog(row: RawCbtLogRow): CbtLog {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    kind: row.kind as CbtKindValue,
    exerciseId: row.exercise_id,
    startedAt: row.started_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    moodBefore: row.mood_before === null ? null : Number(row.mood_before),
    moodAfter: row.mood_after === null ? null : Number(row.mood_after),
    data: row.data ?? {},
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface CbtLogInput {
  kind: CbtKindValue;
  exerciseId?: string | null;
  data: Record<string, unknown>;
  moodBefore?: number | null;
  moodAfter?: number | null;
  notes?: string | null;
  /** When true, completed_at is set to NOW(); when false/undefined, it stays NULL. */
  completed?: boolean;
}

export async function recordCbtLog(
  userId: string,
  tenantId: string,
  patch: CbtLogInput,
): Promise<CbtLog> {
  const pool = getHealthPool();
  const id = randomUUID();
  const r = await pool.query(
    `INSERT INTO agos_mh_cbt_log
       (id, user_id, tenant_id, kind, exercise_id,
        started_at, completed_at, mood_before, mood_after, data, notes)
     VALUES ($1,$2,$3,$4,$5, now(), $6, $7, $8, $9::jsonb, $10)
     RETURNING id, user_id, tenant_id, kind, exercise_id, started_at,
               completed_at, mood_before, mood_after, data, notes,
               created_at, updated_at`,
    [
      id,
      userId,
      tenantId,
      patch.kind,
      patch.exerciseId ?? null,
      patch.completed === false ? null : new Date(),
      patch.moodBefore ?? null,
      patch.moodAfter ?? null,
      JSON.stringify(patch.data ?? {}),
      patch.notes ?? null,
    ],
  );
  return rowToCbtLog(r.rows[0]);
}

export interface ListCbtLogOpts {
  kind?: CbtKindValue;
  from?: Date | string;
  to?: Date | string;
  limit?: number;
}

export async function listCbtLogs(
  userId: string,
  opts: ListCbtLogOpts = {},
): Promise<CbtLog[]> {
  const pool = getHealthPool();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 365);
  const params: unknown[] = [userId];
  let where = 'WHERE user_id = $1';
  if (opts.kind) {
    params.push(opts.kind);
    where += ` AND kind = $${params.length}`;
  }
  if (opts.from) {
    params.push(opts.from instanceof Date ? opts.from : new Date(opts.from));
    where += ` AND COALESCE(completed_at, started_at) >= $${params.length}`;
  }
  if (opts.to) {
    params.push(opts.to instanceof Date ? opts.to : new Date(opts.to));
    where += ` AND COALESCE(completed_at, started_at) <= $${params.length}`;
  }
  params.push(limit);
  const r = await pool.query(
    `SELECT id, user_id, tenant_id, kind, exercise_id, started_at,
            completed_at, mood_before, mood_after, data, notes,
            created_at, updated_at
       FROM agos_mh_cbt_log
       ${where}
      ORDER BY COALESCE(completed_at, started_at) DESC
      LIMIT $${params.length}`,
    params,
  );
  return r.rows.map(rowToCbtLog);
}

export async function getCbtLog(
  id: string,
  userId: string,
): Promise<CbtLog | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT id, user_id, tenant_id, kind, exercise_id, started_at,
            completed_at, mood_before, mood_after, data, notes,
            created_at, updated_at
       FROM agos_mh_cbt_log
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if (r.rowCount === 0) return null;
  return rowToCbtLog(r.rows[0]);
}

export interface CbtLogUpdate {
  data?: Record<string, unknown>;
  moodBefore?: number | null;
  moodAfter?: number | null;
  notes?: string | null;
  completed?: boolean;
}

export async function updateCbtLog(
  id: string,
  userId: string,
  patch: CbtLogUpdate,
): Promise<CbtLog | null> {
  const pool = getHealthPool();
  // completedAt: tri-state — true → set now; false → set null; undefined → leave alone.
  let completedClause = 'completed_at';
  const params: unknown[] = [
    id,
    userId,
    patch.moodBefore ?? null,
    patch.moodAfter ?? null,
    patch.notes ?? null,
    patch.data ? JSON.stringify(patch.data) : null,
  ];
  if (patch.completed === true) {
    completedClause = 'now()';
  } else if (patch.completed === false) {
    completedClause = 'NULL';
  }
  const r = await pool.query(
    `UPDATE agos_mh_cbt_log
        SET mood_before  = COALESCE($3, mood_before),
            mood_after   = COALESCE($4, mood_after),
            notes        = COALESCE($5, notes),
            data         = COALESCE($6::jsonb, data),
            completed_at = ${completedClause},
            updated_at   = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id, user_id, tenant_id, kind, exercise_id, started_at,
                completed_at, mood_before, mood_after, data, notes,
                created_at, updated_at`,
    params,
  );
  if (r.rowCount === 0) return null;
  return rowToCbtLog(r.rows[0]);
}

export async function deleteCbtLog(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getHealthPool();
  const r = await pool.query(
    `DELETE FROM agos_mh_cbt_log WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Meditation sessions (Phase 3) ──────────────────────────────────────────

export type MeditationSourceValue = 'medito' | 'manual' | 'plan';

export interface MeditationSession {
  id: string;
  userId: string;
  tenantId: string;
  source: MeditationSourceValue;
  sourceRef: string | null;
  durationMin: number;
  completedAt: string;
  moodBefore: number | null;
  moodAfter: number | null;
  notes: string | null;
  createdAt: string;
}

function rowToMeditationSession(row: RawMeditationSessionRow): MeditationSession {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    source: row.source as MeditationSourceValue,
    sourceRef: row.source_ref,
    durationMin: Number(row.duration_min),
    completedAt: row.completed_at.toISOString(),
    moodBefore: row.mood_before === null ? null : Number(row.mood_before),
    moodAfter: row.mood_after === null ? null : Number(row.mood_after),
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
  };
}

export interface MeditationSessionInput {
  source: MeditationSourceValue;
  sourceRef?: string | null;
  durationMin: number;
  completedAt?: Date | string | null;
  moodBefore?: number | null;
  moodAfter?: number | null;
  notes?: string | null;
}

export async function recordMeditationSession(
  userId: string,
  tenantId: string,
  patch: MeditationSessionInput,
): Promise<MeditationSession> {
  const pool = getHealthPool();
  const id = randomUUID();
  const completedAt =
    patch.completedAt instanceof Date
      ? patch.completedAt
      : patch.completedAt
        ? new Date(patch.completedAt)
        : new Date();
  const r = await pool.query(
    `INSERT INTO agos_mh_meditation_session
       (id, user_id, tenant_id, source, source_ref, duration_min,
        completed_at, mood_before, mood_after, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id, user_id, tenant_id, source, source_ref, duration_min,
               completed_at, mood_before, mood_after, notes, created_at`,
    [
      id,
      userId,
      tenantId,
      patch.source,
      patch.sourceRef ?? null,
      patch.durationMin,
      completedAt,
      patch.moodBefore ?? null,
      patch.moodAfter ?? null,
      patch.notes ?? null,
    ],
  );
  return rowToMeditationSession(r.rows[0]);
}

export interface ListMeditationSessionOpts {
  from?: Date | string;
  to?: Date | string;
  limit?: number;
}

export async function listMeditationSessions(
  userId: string,
  opts: ListMeditationSessionOpts = {},
): Promise<MeditationSession[]> {
  const pool = getHealthPool();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 365);
  const params: unknown[] = [userId];
  let where = 'WHERE user_id = $1';
  if (opts.from) {
    params.push(opts.from instanceof Date ? opts.from : new Date(opts.from));
    where += ` AND completed_at >= $${params.length}`;
  }
  if (opts.to) {
    params.push(opts.to instanceof Date ? opts.to : new Date(opts.to));
    where += ` AND completed_at <= $${params.length}`;
  }
  params.push(limit);
  const r = await pool.query(
    `SELECT id, user_id, tenant_id, source, source_ref, duration_min,
            completed_at, mood_before, mood_after, notes, created_at
       FROM agos_mh_meditation_session
       ${where}
      ORDER BY completed_at DESC
      LIMIT $${params.length}`,
    params,
  );
  return r.rows.map(rowToMeditationSession);
}

export async function getMeditationSession(
  id: string,
  userId: string,
): Promise<MeditationSession | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT id, user_id, tenant_id, source, source_ref, duration_min,
            completed_at, mood_before, mood_after, notes, created_at
       FROM agos_mh_meditation_session
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if (r.rowCount === 0) return null;
  return rowToMeditationSession(r.rows[0]);
}

export async function updateMeditationSession(
  id: string,
  userId: string,
  patch: Partial<MeditationSessionInput>,
): Promise<MeditationSession | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `UPDATE agos_mh_meditation_session
        SET source       = COALESCE($3, source),
            source_ref   = COALESCE($4, source_ref),
            duration_min = COALESCE($5, duration_min),
            completed_at = COALESCE($6, completed_at),
            mood_before  = COALESCE($7, mood_before),
            mood_after   = COALESCE($8, mood_after),
            notes        = COALESCE($9, notes)
      WHERE id = $1 AND user_id = $2
      RETURNING id, user_id, tenant_id, source, source_ref, duration_min,
                completed_at, mood_before, mood_after, notes, created_at`,
    [
      id,
      userId,
      patch.source ?? null,
      patch.sourceRef ?? null,
      patch.durationMin ?? null,
      patch.completedAt
        ? patch.completedAt instanceof Date
          ? patch.completedAt
          : new Date(patch.completedAt)
        : null,
      patch.moodBefore ?? null,
      patch.moodAfter ?? null,
      patch.notes ?? null,
    ],
  );
  if (r.rowCount === 0) return null;
  return rowToMeditationSession(r.rows[0]);
}

export async function deleteMeditationSession(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getHealthPool();
  const r = await pool.query(
    `DELETE FROM agos_mh_meditation_session WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Meditation plan (Phase 3) ──────────────────────────────────────────────

export interface MeditationPlanSlot {
  /** ISO weekday name (mon, tue, ...) — kept lowercase for stability. */
  day: string;
  /** Catalog slug from `meditation-catalog.ts`. */
  session_slug: string;
  /** Allotted duration in minutes (matches the catalog default). */
  duration_min: number;
  /** Goal-tag the slot was picked for (stress/sleep/focus/general). */
  focus: string;
}

export interface MeditationPlan {
  id: string;
  userId: string;
  tenantId: string;
  weekStart: string;
  plan: MeditationPlanSlot[];
  createdAt: string;
}

function rowToMeditationPlan(row: RawMeditationPlanRow): MeditationPlan {
  const weekStart =
    row.week_start instanceof Date
      ? row.week_start.toISOString().slice(0, 10)
      : String(row.week_start).slice(0, 10);
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    weekStart,
    plan: Array.isArray(row.plan) ? (row.plan as MeditationPlanSlot[]) : [],
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * ISO Monday-aligned start of the week containing `now` (UTC). Plans
 * are keyed by week-start so the unique index keeps one plan per week
 * per user.
 */
export function isoMondayWeekStart(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // ISO weekday: Mon=1, Sun=7. Subtract day-1 days to land on Mon.
  const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}

export async function getCurrentMeditationPlan(
  userId: string,
): Promise<MeditationPlan | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT id, user_id, tenant_id, week_start, plan, created_at
       FROM agos_mh_meditation_plan
      WHERE user_id = $1
      ORDER BY week_start DESC
      LIMIT 1`,
    [userId],
  );
  if (r.rowCount === 0) return null;
  return rowToMeditationPlan(r.rows[0]);
}

export async function recordMeditationPlan(
  userId: string,
  tenantId: string,
  weekStart: string,
  plan: MeditationPlanSlot[],
): Promise<MeditationPlan> {
  const pool = getHealthPool();
  const id = randomUUID();
  const r = await pool.query(
    `INSERT INTO agos_mh_meditation_plan
       (id, user_id, tenant_id, week_start, plan)
     VALUES ($1,$2,$3,$4,$5::jsonb)
     ON CONFLICT (user_id, week_start) DO UPDATE SET
        plan       = EXCLUDED.plan,
        created_at = now()
     RETURNING id, user_id, tenant_id, week_start, plan, created_at`,
    [id, userId, tenantId, weekStart, JSON.stringify(plan)],
  );
  return rowToMeditationPlan(r.rows[0]);
}

// ─── Meditation plan generator (rules-based; NO LLM) ────────────────────────

import {
  MEDITATION_CATALOG,
  type MeditationCatalogEntry,
  type MeditationGoalTag,
} from './meditation-catalog';

export interface GenerateMeditationPlanOpts {
  goal?: MeditationGoalTag;
  weeklyMinutes?: number;
}

/**
 * Generate a 7-day meditation plan from the static catalog using simple
 * rules over the user's recent state:
 *
 *  1. Inputs: most recent mood entries (last 7 days) and the mental-health
 *     profile (sleep_quality, stress baseline). Both are optional.
 *  2. If `goal` is supplied, it overrides any inferred goal.
 *  3. Otherwise:
 *     - high anxiety (avg anxiety_score >= 7 OR stress_baseline >= 7) →
 *       prefer 'stress'-tagged sessions.
 *     - poor sleep (sleep_quality === 'poor') → prefer 'sleep' for at
 *       least the last 2 days (winding down).
 *     - low energy (avg energy_score <= 4) → prefer a mix with one
 *       'focus' / energy-reset slot.
 *     - default → 'general'.
 *  4. Pick a session per day, rotating through eligible catalog entries
 *     so the same slug doesn't repeat day-after-day. Last 1-2 days bias
 *     toward 'sleep' if the sleep signal is poor.
 *  5. Total weeklyMinutes is informational; the planner does not strictly
 *     enforce a minute cap (the static catalog's per-session durations
 *     are already short).
 *
 * Phase 3 explicitly prohibits LLM calls in plan generation; that lands
 * in Phase 6.
 */
export async function generateMeditationPlan(
  userId: string,
  tenantId: string,
  opts: GenerateMeditationPlanOpts = {},
): Promise<MeditationPlanSlot[]> {
  const pool = getHealthPool();

  // Fetch most-recent mood entries (last 14, to cover noisy days).
  const moodRes = await pool.query(
    `SELECT mood_score, energy_score, anxiety_score, sleep_quality
       FROM agos_mh_mood_entry
      WHERE user_id = $1
      ORDER BY entry_at DESC
      LIMIT 14`,
    [userId],
  );
  const moods = moodRes.rows;

  // Fetch mental profile (stress baseline + sleep quality).
  const profRes = await pool.query(
    `SELECT stress_baseline, sleep_quality
       FROM agos_mh_profile
      WHERE user_id = $1 AND tenant_id = $2`,
    [userId, tenantId],
  );
  const profile = profRes.rows[0];

  return planFromSignals(moods, profile, opts);
}

/**
 * Pure planner — split out so tests can drive it with synthetic signals
 * without touching the DB.
 */
export function planFromSignals(
  moods: Array<{
    mood_score?: number | null;
    energy_score?: number | null;
    anxiety_score?: number | null;
    sleep_quality?: string | null;
  }>,
  profile: { stress_baseline?: number | null; sleep_quality?: string | null } | null | undefined,
  opts: GenerateMeditationPlanOpts = {},
): MeditationPlanSlot[] {
  const avg = (xs: Array<number | null | undefined>): number | null => {
    const filtered = xs.filter(
      (x): x is number => typeof x === 'number' && !Number.isNaN(x),
    );
    if (filtered.length === 0) return null;
    return filtered.reduce((a, b) => a + b, 0) / filtered.length;
  };
  const avgAnxiety = avg(moods.map((m) => (m.anxiety_score ?? null) as number | null));
  const avgEnergy = avg(moods.map((m) => (m.energy_score ?? null) as number | null));
  const baseline =
    typeof profile?.stress_baseline === 'number' ? profile.stress_baseline : null;
  const profileSleep = profile?.sleep_quality ?? null;
  const recentSleepPoor =
    moods.slice(0, 5).some((m) => m.sleep_quality === 'poor') ||
    profileSleep === 'poor';

  let inferredGoal: MeditationGoalTag = 'general';
  if (opts.goal) {
    inferredGoal = opts.goal;
  } else if (
    (avgAnxiety !== null && avgAnxiety >= 7) ||
    (baseline !== null && baseline >= 7)
  ) {
    inferredGoal = 'stress';
  } else if (recentSleepPoor) {
    inferredGoal = 'sleep';
  } else if (avgEnergy !== null && avgEnergy <= 4) {
    inferredGoal = 'focus';
  }

  // Eligible catalog by goal; if empty, fall back to general.
  const eligible: MeditationCatalogEntry[] = MEDITATION_CATALOG.filter((s) =>
    s.tags.includes(inferredGoal),
  );
  const pool: MeditationCatalogEntry[] =
    eligible.length > 0 ? eligible : MEDITATION_CATALOG;

  // Bias the last two slots toward 'sleep' when sleep is poor.
  const sleepPool = MEDITATION_CATALOG.filter((s) => s.tags.includes('sleep'));

  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const slots: MeditationPlanSlot[] = [];
  for (let i = 0; i < 7; i += 1) {
    const isLastTwo = i >= 5;
    const usePool = isLastTwo && recentSleepPoor && sleepPool.length > 0
      ? sleepPool
      : pool;
    const entry = usePool[i % usePool.length]!;
    slots.push({
      day: days[i]!,
      session_slug: entry.slug,
      duration_min: entry.durationMin,
      focus:
        isLastTwo && recentSleepPoor && sleepPool.length > 0
          ? 'sleep'
          : inferredGoal,
    });
  }
  return slots;
}

// ─── Trends (Phase 4) ───────────────────────────────────────────────────────

export type TrendWindow = '7d' | '30d' | '90d';

export interface TrendsResult {
  window: TrendWindow;
  windowDays: number;
  mood_series: {
    date: string;
    mood: number | null;
    energy: number | null;
    anxiety: number | null;
    sleep: number | null;
  }[];
  screener_series: {
    date: string;
    kind: ScreenerKey;
    score: number;
  }[];
  tag_heatmap: { tag: string; bucket: string; count: number }[];
  nutrition_series: {
    date: string;
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }[];
  activity_series: {
    date: string;
    duration_min: number;
    kcal_burned: number;
  }[];
  stats: {
    avg_mood: number | null;
    journal_count: number;
    cbt_count: number;
    meditation_count: number;
    screener_trend: 'up' | 'down' | 'flat';
    avg_daily_kcal: number | null;
    avg_daily_active_min: number | null;
  };
}

/** Map the sleep_quality string enum to a 1-4 numeric for charting. */
const SLEEP_QUALITY_TO_NUMERIC: Record<string, number> = {
  poor: 1,
  fair: 2,
  good: 3,
  excellent: 4,
};

const WINDOW_DAYS: Record<TrendWindow, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

/**
 * Aggregate trends across mood entries, screeners, journal entries, CBT
 * logs, meditation sessions, and mood tags. One repo call, multiple
 * server-side queries — kept here so the route stays a thin BFF wrapper.
 *
 * All time windows are computed in UTC; the API will eventually become
 * timezone-aware (issue #TBD), but day-bucketing on entry_at is good
 * enough for the v0.1.12 cut.
 */
export async function getTrends(
  userId: string,
  _tenantId: string,
  window: TrendWindow,
): Promise<TrendsResult> {
  const pool = getHealthPool();
  const windowDays = WINDOW_DAYS[window];
  const sinceClause = `now() - INTERVAL '${windowDays} days'`;

  // Per-day mood/energy/anxiety/sleep averages.
  const moodRes = await pool.query(
    `SELECT
        to_char(date_trunc('day', entry_at), 'YYYY-MM-DD') AS day,
        AVG(mood_score)::float    AS mood,
        AVG(energy_score)::float  AS energy,
        AVG(anxiety_score)::float AS anxiety,
        AVG(CASE sleep_quality
              WHEN 'poor' THEN 1
              WHEN 'fair' THEN 2
              WHEN 'good' THEN 3
              WHEN 'excellent' THEN 4
              ELSE NULL
            END)::float AS sleep
       FROM agos_mh_mood_entry
      WHERE user_id = $1 AND entry_at >= ${sinceClause}
      GROUP BY 1
      ORDER BY 1`,
    [userId],
  );
  const mood_series = moodRes.rows.map(
    (r: {
      day: string;
      mood: number | string | null;
      energy: number | string | null;
      anxiety: number | string | null;
      sleep: number | string | null;
    }) => ({
      date: r.day,
      mood: r.mood === null ? null : Number(r.mood),
      energy: r.energy === null ? null : Number(r.energy),
      anxiety: r.anxiety === null ? null : Number(r.anxiety),
      sleep: r.sleep === null ? null : Number(r.sleep),
    }),
  );

  // Screener scores over time.
  const screenerRes = await pool.query(
    `SELECT
        to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
        screener,
        score
       FROM agos_health_screeners
      WHERE user_id = $1 AND created_at >= ${sinceClause}
      ORDER BY created_at`,
    [userId],
  );
  const screener_series = screenerRes.rows.map(
    (r: { day: string; screener: string; score: number | string }) => ({
      date: r.day,
      kind: r.screener as ScreenerKey,
      score: Number(r.score),
    }),
  );

  // Mood tag × day-of-week heatmap.
  // dow: 0=Sun..6=Sat from extract(dow ...); we relabel as Mon..Sun for
  // a more conventional left-to-right axis.
  const tagRes = await pool.query(
    `SELECT
        t.name AS tag,
        EXTRACT(dow FROM e.entry_at)::int AS dow,
        COUNT(*)::int AS count
       FROM agos_mh_mood_entry e
       JOIN agos_mh_mood_entry_tag met ON met.mood_entry_id = e.id
       JOIN agos_mh_mood_tag t ON t.id = met.tag_id
      WHERE e.user_id = $1 AND e.entry_at >= ${sinceClause}
      GROUP BY t.name, dow
      ORDER BY t.name, dow`,
    [userId],
  );
  const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const tag_heatmap = tagRes.rows.map(
    (r: { tag: string; dow: number | string; count: number | string }) => ({
      tag: r.tag,
      bucket: DOW_LABELS[Number(r.dow)] ?? 'Sun',
      count: Number(r.count),
    }),
  );

  // Aggregate stats — three counts + avg mood + screener-trend direction.
  const statsRes = await pool.query(
    `SELECT
        (SELECT AVG(mood_score)::float
           FROM agos_mh_mood_entry
          WHERE user_id = $1 AND entry_at >= ${sinceClause}) AS avg_mood,
        (SELECT COUNT(*)::int
           FROM agos_mh_journal_entry
          WHERE user_id = $1 AND entry_at >= ${sinceClause}) AS journal_count,
        (SELECT COUNT(*)::int
           FROM agos_mh_cbt_log
          WHERE user_id = $1
            AND COALESCE(completed_at, started_at) >= ${sinceClause}) AS cbt_count,
        (SELECT COUNT(*)::int
           FROM agos_mh_meditation_session
          WHERE user_id = $1 AND completed_at >= ${sinceClause}) AS meditation_count`,
    [userId],
  );
  const statsRow = statsRes.rows[0] ?? {};

  // Screener trend: compare the two most recent PHQ-9 scores within the
  // window. Returns 'flat' if fewer than two exist or the delta is zero.
  const phqRes = await pool.query(
    `SELECT score
       FROM agos_health_screeners
      WHERE user_id = $1 AND screener = 'phq9'
        AND created_at >= ${sinceClause}
      ORDER BY created_at DESC
      LIMIT 2`,
    [userId],
  );
  let screenerTrend: 'up' | 'down' | 'flat' = 'flat';
  if (phqRes.rowCount === 2) {
    const latest = Number(phqRes.rows[0].score);
    const prev = Number(phqRes.rows[1].score);
    if (latest > prev) screenerTrend = 'up';
    else if (latest < prev) screenerTrend = 'down';
  }

  // Per-day nutrition rollups. Pulls the food_item via LEFT JOIN so the
  // override-vs-food-item-vs-null resolution happens in SQL (mirrors
  // `mergeMealEntryNutrients`). Days with no meal entries are simply absent
  // from the series — the UI fills gaps if it wants a contiguous axis.
  const nutritionRes = await pool.query(
    `SELECT
        to_char(m.entry_date, 'YYYY-MM-DD') AS day,
        SUM(COALESCE(m.kcal_override,      f.kcal      * m.servings, 0))::float AS kcal,
        SUM(COALESCE(m.protein_g_override, f.protein_g * m.servings, 0))::float AS protein_g,
        SUM(COALESCE(m.carbs_g_override,   f.carbs_g   * m.servings, 0))::float AS carbs_g,
        SUM(COALESCE(m.fat_g_override,     f.fat_g     * m.servings, 0))::float AS fat_g
       FROM agos_mh_meal_entry m
       LEFT JOIN agos_mh_food_item f ON f.id = m.food_item_id
      WHERE m.user_id = $1 AND m.entry_date >= (now() - INTERVAL '${windowDays} days')::date
      GROUP BY 1
      ORDER BY 1`,
    [userId],
  );
  const nutrition_series = nutritionRes.rows.map(
    (r: {
      day: string;
      kcal: number | string | null;
      protein_g: number | string | null;
      carbs_g: number | string | null;
      fat_g: number | string | null;
    }) => ({
      date: r.day,
      kcal: Number(r.kcal ?? 0),
      protein_g: Number(r.protein_g ?? 0),
      carbs_g: Number(r.carbs_g ?? 0),
      fat_g: Number(r.fat_g ?? 0),
    }),
  );

  // Per-day activity rollups.
  const activityRes = await pool.query(
    `SELECT
        to_char(entry_date, 'YYYY-MM-DD') AS day,
        SUM(duration_min)::int  AS duration_min,
        SUM(kcal_burned)::float AS kcal_burned
       FROM agos_mh_activity_entry
      WHERE user_id = $1 AND entry_date >= (now() - INTERVAL '${windowDays} days')::date
      GROUP BY 1
      ORDER BY 1`,
    [userId],
  );
  const activity_series = activityRes.rows.map(
    (r: { day: string; duration_min: number | string | null; kcal_burned: number | string | null }) => ({
      date: r.day,
      duration_min: Number(r.duration_min ?? 0),
      kcal_burned: Number(r.kcal_burned ?? 0),
    }),
  );

  // Daily averages for the stat cards. Use the window length as the denominator
  // (not just observed days) so the average reflects "how I'm doing across the
  // window," not just "across days I logged."
  const avg_daily_kcal =
    nutrition_series.length === 0
      ? null
      : Number(
          (
            nutrition_series.reduce((s, r) => s + (r.kcal || 0), 0) / windowDays
          ).toFixed(1),
        );
  const avg_daily_active_min =
    activity_series.length === 0
      ? null
      : Number(
          (
            activity_series.reduce((s, r) => s + (r.duration_min || 0), 0) /
            windowDays
          ).toFixed(1),
        );

  return {
    window,
    windowDays,
    mood_series,
    screener_series,
    tag_heatmap,
    nutrition_series,
    activity_series,
    stats: {
      avg_mood: statsRow.avg_mood === null ? null : Number(statsRow.avg_mood),
      journal_count: Number(statsRow.journal_count ?? 0),
      cbt_count: Number(statsRow.cbt_count ?? 0),
      meditation_count: Number(statsRow.meditation_count ?? 0),
      screener_trend: screenerTrend,
      avg_daily_kcal,
      avg_daily_active_min,
    },
  };
}

// Re-export the numeric sleep mapping so the UI can label the y-axis.
export { SLEEP_QUALITY_TO_NUMERIC };

// ─── Nutrition + activity (Phase 5a) ────────────────────────────────────────

export type FoodSourceValue = 'usda' | 'custom';
export type MealSlotValue = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type ActivityIntensityValue = 'light' | 'moderate' | 'vigorous';

export interface FoodItem {
  id: string;
  tenantId: string;
  userId: string | null;
  source: FoodSourceValue;
  usdaFdcId: string | null;
  name: string;
  brand: string | null;
  servingSizeG: number | null;
  servingLabel: string | null;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const FOOD_ITEM_COLS = `
  id, tenant_id, user_id, source, usda_fdc_id, name, brand,
  serving_size_g, serving_label, kcal, protein_g, carbs_g, fat_g,
  fiber_g, sugar_g, sodium_mg, metadata, created_at, updated_at
`;

const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

function rowToFoodItem(row: RawFoodItemRow): FoodItem {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    source: row.source as FoodSourceValue,
    usdaFdcId: row.usda_fdc_id,
    name: row.name,
    brand: row.brand,
    servingSizeG: num(row.serving_size_g),
    servingLabel: row.serving_label,
    kcal: num(row.kcal),
    proteinG: num(row.protein_g),
    carbsG: num(row.carbs_g),
    fatG: num(row.fat_g),
    fiberG: num(row.fiber_g),
    sugarG: num(row.sugar_g),
    sodiumMg: num(row.sodium_mg),
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface CreateFoodItemInput {
  name: string;
  brand?: string | null;
  servingSizeG?: number | null;
  servingLabel?: string | null;
  kcal?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  fiberG?: number | null;
  sugarG?: number | null;
  sodiumMg?: number | null;
  metadata?: Record<string, unknown>;
}

export async function createFoodItem(
  tenantId: string,
  userId: string,
  input: CreateFoodItemInput,
): Promise<FoodItem> {
  const pool = getHealthPool();
  const id = randomUUID();
  const r = await pool.query(
    `INSERT INTO agos_mh_food_item (
        id, tenant_id, user_id, source, name, brand,
        serving_size_g, serving_label, kcal, protein_g, carbs_g, fat_g,
        fiber_g, sugar_g, sodium_mg, metadata)
     VALUES ($1,$2,$3,'custom',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
     RETURNING ${FOOD_ITEM_COLS}`,
    [
      id,
      tenantId,
      userId,
      input.name,
      input.brand ?? null,
      input.servingSizeG ?? null,
      input.servingLabel ?? null,
      input.kcal ?? null,
      input.proteinG ?? null,
      input.carbsG ?? null,
      input.fatG ?? null,
      input.fiberG ?? null,
      input.sugarG ?? null,
      input.sodiumMg ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return rowToFoodItem(r.rows[0]);
}

export interface SearchFoodItemsInput {
  tenantId: string;
  userId: string;
  query?: string;
  limit?: number;
}

export async function searchFoodItems(
  input: SearchFoodItemsInput,
): Promise<FoodItem[]> {
  const pool = getHealthPool();
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const params: unknown[] = [input.tenantId, input.userId];
  let where = `WHERE tenant_id = $1 AND (user_id = $2 OR user_id IS NULL)`;
  if (input.query && input.query.trim().length > 0) {
    params.push(`%${input.query.trim()}%`);
    where += ` AND name ILIKE $${params.length}`;
  }
  params.push(limit);
  const r = await pool.query(
    `SELECT ${FOOD_ITEM_COLS}
       FROM agos_mh_food_item
       ${where}
      ORDER BY name
      LIMIT $${params.length}`,
    params,
  );
  return r.rows.map(rowToFoodItem);
}

export async function getFoodItem(
  id: string,
  tenantId: string,
): Promise<FoodItem | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT ${FOOD_ITEM_COLS}
       FROM agos_mh_food_item
      WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );
  if (r.rowCount === 0) return null;
  return rowToFoodItem(r.rows[0]);
}

export async function listUserFoodItems(
  tenantId: string,
  userId: string,
  limit = 200,
): Promise<FoodItem[]> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT ${FOOD_ITEM_COLS}
       FROM agos_mh_food_item
      WHERE tenant_id = $1 AND user_id = $2
      ORDER BY name
      LIMIT $3`,
    [tenantId, userId, Math.min(Math.max(limit, 1), 500)],
  );
  return r.rows.map(rowToFoodItem);
}

export interface UpdateFoodItemInput {
  name?: string;
  brand?: string | null;
  servingSizeG?: number | null;
  servingLabel?: string | null;
  kcal?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  fiberG?: number | null;
  sugarG?: number | null;
  sodiumMg?: number | null;
  metadata?: Record<string, unknown>;
}

export async function updateFoodItem(
  id: string,
  tenantId: string,
  userId: string,
  patch: UpdateFoodItemInput,
): Promise<FoodItem | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `UPDATE agos_mh_food_item
        SET name           = COALESCE($4, name),
            brand          = COALESCE($5, brand),
            serving_size_g = COALESCE($6, serving_size_g),
            serving_label  = COALESCE($7, serving_label),
            kcal           = COALESCE($8, kcal),
            protein_g      = COALESCE($9, protein_g),
            carbs_g        = COALESCE($10, carbs_g),
            fat_g          = COALESCE($11, fat_g),
            fiber_g        = COALESCE($12, fiber_g),
            sugar_g        = COALESCE($13, sugar_g),
            sodium_mg      = COALESCE($14, sodium_mg),
            metadata       = COALESCE($15::jsonb, metadata),
            updated_at     = now()
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND source = 'custom'
      RETURNING ${FOOD_ITEM_COLS}`,
    [
      id,
      tenantId,
      userId,
      patch.name ?? null,
      patch.brand ?? null,
      patch.servingSizeG ?? null,
      patch.servingLabel ?? null,
      patch.kcal ?? null,
      patch.proteinG ?? null,
      patch.carbsG ?? null,
      patch.fatG ?? null,
      patch.fiberG ?? null,
      patch.sugarG ?? null,
      patch.sodiumMg ?? null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  if (r.rowCount === 0) return null;
  return rowToFoodItem(r.rows[0]);
}

export async function deleteFoodItem(
  id: string,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const pool = getHealthPool();
  const r = await pool.query(
    `DELETE FROM agos_mh_food_item
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND source = 'custom'`,
    [id, tenantId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Meal entries (Phase 5a) ────────────────────────────────────────────────

export interface MealEntry {
  id: string;
  tenantId: string;
  userId: string;
  entryDate: string;
  mealSlot: MealSlotValue;
  foodItemId: string | null;
  foodItem?: FoodItem | null;
  freeformDescription: string | null;
  servings: number;
  kcalOverride: number | null;
  proteinGOverride: number | null;
  carbsGOverride: number | null;
  fatGOverride: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Resolved nutrient totals: override → food_item × servings → null. */
  nutrients: { kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null };
}

const MEAL_ENTRY_COLS = `
  id, tenant_id, user_id, entry_date, meal_slot, food_item_id,
  freeform_description, servings, kcal_override, protein_g_override,
  carbs_g_override, fat_g_override, notes, created_at, updated_at
`;

function rowToMealEntry(row: RawMealEntryRow, food?: FoodItem | null): MealEntry {
  const entry: MealEntry = {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    entryDate:
      row.entry_date instanceof Date
        ? row.entry_date.toISOString().slice(0, 10)
        : String(row.entry_date).slice(0, 10),
    mealSlot: row.meal_slot as MealSlotValue,
    foodItemId: row.food_item_id,
    foodItem: food ?? null,
    freeformDescription: row.freeform_description,
    servings: Number(row.servings),
    kcalOverride: num(row.kcal_override),
    proteinGOverride: num(row.protein_g_override),
    carbsGOverride: num(row.carbs_g_override),
    fatGOverride: num(row.fat_g_override),
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    nutrients: { kcal: null, protein_g: null, carbs_g: null, fat_g: null },
  };
  entry.nutrients = mergeMealEntryNutrients(entry);
  return entry;
}

/**
 * Resolve final nutrient totals for a meal entry. Overrides take precedence;
 * otherwise the food_item nutrient × servings; otherwise null. Each macro is
 * resolved independently — partial overrides are allowed.
 */
export function mergeMealEntryNutrients(entry: {
  servings: number;
  foodItem?: FoodItem | null;
  kcalOverride: number | null;
  proteinGOverride: number | null;
  carbsGOverride: number | null;
  fatGOverride: number | null;
}): { kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null } {
  const fi = entry.foodItem;
  const s = entry.servings ?? 1;
  const fromFood = (v: number | null | undefined): number | null =>
    typeof v === 'number' ? Number((v * s).toFixed(2)) : null;
  return {
    kcal: entry.kcalOverride ?? fromFood(fi?.kcal ?? null),
    protein_g: entry.proteinGOverride ?? fromFood(fi?.proteinG ?? null),
    carbs_g: entry.carbsGOverride ?? fromFood(fi?.carbsG ?? null),
    fat_g: entry.fatGOverride ?? fromFood(fi?.fatG ?? null),
  };
}

export interface CreateMealEntryInput {
  entryDate: string;
  mealSlot: MealSlotValue;
  foodItemId?: string | null;
  freeformDescription?: string | null;
  servings?: number;
  kcalOverride?: number | null;
  proteinGOverride?: number | null;
  carbsGOverride?: number | null;
  fatGOverride?: number | null;
  notes?: string | null;
}

export class MealEntryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MealEntryValidationError';
  }
}

export async function createMealEntry(
  tenantId: string,
  userId: string,
  input: CreateMealEntryInput,
): Promise<MealEntry> {
  const hasFood = !!input.foodItemId;
  const hasFreeform = !!(input.freeformDescription && input.freeformDescription.trim());
  const hasOverride =
    input.kcalOverride !== null && input.kcalOverride !== undefined ||
    input.proteinGOverride !== null && input.proteinGOverride !== undefined ||
    input.carbsGOverride !== null && input.carbsGOverride !== undefined ||
    input.fatGOverride !== null && input.fatGOverride !== undefined;
  if (!hasFood && !hasFreeform && !hasOverride) {
    throw new MealEntryValidationError(
      'Meal entry requires either a food item, a freeform description, or a nutrient override.',
    );
  }
  const pool = getHealthPool();
  const id = randomUUID();
  const r = await pool.query(
    `INSERT INTO agos_mh_meal_entry (
        id, tenant_id, user_id, entry_date, meal_slot, food_item_id,
        freeform_description, servings, kcal_override, protein_g_override,
        carbs_g_override, fat_g_override, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING ${MEAL_ENTRY_COLS}`,
    [
      id,
      tenantId,
      userId,
      input.entryDate,
      input.mealSlot,
      input.foodItemId ?? null,
      input.freeformDescription ?? null,
      input.servings ?? 1,
      input.kcalOverride ?? null,
      input.proteinGOverride ?? null,
      input.carbsGOverride ?? null,
      input.fatGOverride ?? null,
      input.notes ?? null,
    ],
  );
  const food = input.foodItemId ? await getFoodItem(input.foodItemId, tenantId) : null;
  return rowToMealEntry(r.rows[0], food);
}

export interface ListMealEntriesInput {
  tenantId: string;
  userId: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}

export async function listMealEntries(
  input: ListMealEntriesInput,
): Promise<MealEntry[]> {
  const pool = getHealthPool();
  const limit = Math.min(Math.max(input.limit ?? 200, 1), 1000);
  const params: unknown[] = [input.tenantId, input.userId];
  let where = `WHERE m.tenant_id = $1 AND m.user_id = $2`;
  if (input.fromDate) {
    params.push(input.fromDate);
    where += ` AND m.entry_date >= $${params.length}`;
  }
  if (input.toDate) {
    params.push(input.toDate);
    where += ` AND m.entry_date <= $${params.length}`;
  }
  params.push(limit);
  const r = await pool.query(
    `SELECT m.id, m.tenant_id, m.user_id, m.entry_date, m.meal_slot,
            m.food_item_id, m.freeform_description, m.servings,
            m.kcal_override, m.protein_g_override, m.carbs_g_override,
            m.fat_g_override, m.notes, m.created_at, m.updated_at,
            f.id AS f_id, f.tenant_id AS f_tenant_id, f.user_id AS f_user_id,
            f.source AS f_source, f.usda_fdc_id AS f_usda_fdc_id,
            f.name AS f_name, f.brand AS f_brand,
            f.serving_size_g AS f_serving_size_g, f.serving_label AS f_serving_label,
            f.kcal AS f_kcal, f.protein_g AS f_protein_g, f.carbs_g AS f_carbs_g,
            f.fat_g AS f_fat_g, f.fiber_g AS f_fiber_g, f.sugar_g AS f_sugar_g,
            f.sodium_mg AS f_sodium_mg, f.metadata AS f_metadata,
            f.created_at AS f_created_at, f.updated_at AS f_updated_at
       FROM agos_mh_meal_entry m
       LEFT JOIN agos_mh_food_item f ON f.id = m.food_item_id
       ${where}
      ORDER BY m.entry_date DESC, m.meal_slot, m.created_at
      LIMIT $${params.length}`,
    params,
  );
  type RawMealJoinedRow = RawMealEntryRow & {
    f_id: string | null;
    f_tenant_id: string | null;
    f_user_id: string | null;
    f_source: string | null;
    f_usda_fdc_id: string | null;
    f_name: string | null;
    f_brand: string | null;
    f_serving_size_g: number | string | null;
    f_serving_label: string | null;
    f_kcal: number | string | null;
    f_protein_g: number | string | null;
    f_carbs_g: number | string | null;
    f_fat_g: number | string | null;
    f_fiber_g: number | string | null;
    f_sugar_g: number | string | null;
    f_sodium_mg: number | string | null;
    f_metadata: Record<string, unknown> | null;
    f_created_at: Date | null;
    f_updated_at: Date | null;
  };
  return r.rows.map((row: RawMealJoinedRow) => {
    let food: FoodItem | null = null;
    if (row.f_id) {
      food = rowToFoodItem({
        id: row.f_id,
        tenant_id: row.f_tenant_id as string,
        user_id: row.f_user_id,
        source: row.f_source as string,
        usda_fdc_id: row.f_usda_fdc_id,
        name: row.f_name as string,
        brand: row.f_brand,
        serving_size_g: row.f_serving_size_g,
        serving_label: row.f_serving_label,
        kcal: row.f_kcal,
        protein_g: row.f_protein_g,
        carbs_g: row.f_carbs_g,
        fat_g: row.f_fat_g,
        fiber_g: row.f_fiber_g,
        sugar_g: row.f_sugar_g,
        sodium_mg: row.f_sodium_mg,
        metadata: row.f_metadata,
        created_at: row.f_created_at as Date,
        updated_at: row.f_updated_at as Date,
      });
    }
    return rowToMealEntry(row, food);
  });
}

export async function getMealEntry(
  id: string,
  tenantId: string,
  userId: string,
): Promise<MealEntry | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT ${MEAL_ENTRY_COLS}
       FROM agos_mh_meal_entry
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [id, tenantId, userId],
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0];
  const food = row.food_item_id ? await getFoodItem(row.food_item_id, tenantId) : null;
  return rowToMealEntry(row, food);
}

export interface UpdateMealEntryInput {
  entryDate?: string;
  mealSlot?: MealSlotValue;
  foodItemId?: string | null;
  freeformDescription?: string | null;
  servings?: number;
  kcalOverride?: number | null;
  proteinGOverride?: number | null;
  carbsGOverride?: number | null;
  fatGOverride?: number | null;
  notes?: string | null;
}

export async function updateMealEntry(
  id: string,
  tenantId: string,
  userId: string,
  patch: UpdateMealEntryInput,
): Promise<MealEntry | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `UPDATE agos_mh_meal_entry
        SET entry_date           = COALESCE($4, entry_date),
            meal_slot            = COALESCE($5, meal_slot),
            food_item_id         = COALESCE($6, food_item_id),
            freeform_description = COALESCE($7, freeform_description),
            servings             = COALESCE($8, servings),
            kcal_override        = COALESCE($9, kcal_override),
            protein_g_override   = COALESCE($10, protein_g_override),
            carbs_g_override     = COALESCE($11, carbs_g_override),
            fat_g_override       = COALESCE($12, fat_g_override),
            notes                = COALESCE($13, notes),
            updated_at           = now()
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3
      RETURNING ${MEAL_ENTRY_COLS}`,
    [
      id,
      tenantId,
      userId,
      patch.entryDate ?? null,
      patch.mealSlot ?? null,
      patch.foodItemId ?? null,
      patch.freeformDescription ?? null,
      patch.servings ?? null,
      patch.kcalOverride ?? null,
      patch.proteinGOverride ?? null,
      patch.carbsGOverride ?? null,
      patch.fatGOverride ?? null,
      patch.notes ?? null,
    ],
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0];
  const food = row.food_item_id ? await getFoodItem(row.food_item_id, tenantId) : null;
  return rowToMealEntry(row, food);
}

export async function deleteMealEntry(
  id: string,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const pool = getHealthPool();
  const r = await pool.query(
    `DELETE FROM agos_mh_meal_entry
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [id, tenantId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Activity entries (Phase 5a) ────────────────────────────────────────────

export interface ActivityEntry {
  id: string;
  tenantId: string;
  userId: string;
  entryDate: string;
  activityType: string;
  durationMin: number;
  intensity: ActivityIntensityValue;
  kcalBurned: number | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const ACTIVITY_ENTRY_COLS = `
  id, tenant_id, user_id, entry_date, activity_type, duration_min,
  intensity, kcal_burned, notes, metadata, created_at, updated_at
`;

function rowToActivityEntry(row: RawActivityEntryRow): ActivityEntry {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    entryDate:
      row.entry_date instanceof Date
        ? row.entry_date.toISOString().slice(0, 10)
        : String(row.entry_date).slice(0, 10),
    activityType: row.activity_type,
    durationMin: Number(row.duration_min),
    intensity: row.intensity as ActivityIntensityValue,
    kcalBurned: num(row.kcal_burned),
    notes: row.notes,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * MET (Metabolic Equivalent of Task) lookup. Values are the steady-state
 * MET for the named activity at moderate intensity. The estimator scales
 * ±20% for 'light' / 'vigorous'. Sourced from the Compendium of Physical
 * Activities (Ainsworth et al., 2011, public-domain summary tables) —
 * paraphrased / typical values, not the full code-level catalog.
 */
export const MET_TABLE: Record<string, number> = {
  walk: 3.5,
  walking: 3.5,
  run: 9.0,
  running: 9.0,
  jog: 7.0,
  jogging: 7.0,
  cycling: 7.5,
  bike: 7.5,
  biking: 7.5,
  swim: 8.0,
  swimming: 8.0,
  hike: 6.0,
  hiking: 6.0,
  yoga: 2.5,
  pilates: 3.0,
  weights: 5.0,
  lifting: 5.0,
  strength: 5.0,
  hiit: 8.0,
  dance: 5.0,
  dancing: 5.0,
  rowing: 7.0,
  elliptical: 5.0,
  stretching: 2.3,
  basketball: 6.5,
  soccer: 7.0,
  tennis: 7.3,
  climbing: 8.0,
};

const DEFAULT_MET = 4.0;
const DEFAULT_WEIGHT_KG = 75;

export function estimateActivityKcal(
  activityType: string,
  durationMin: number,
  intensity: ActivityIntensityValue,
  weightKg: number | null | undefined,
): number {
  const key = activityType.trim().toLowerCase();
  const baseMet = MET_TABLE[key] ?? DEFAULT_MET;
  const intensityFactor =
    intensity === 'light' ? 0.8 : intensity === 'vigorous' ? 1.2 : 1.0;
  const met = baseMet * intensityFactor;
  const w = typeof weightKg === 'number' && weightKg > 0 ? weightKg : DEFAULT_WEIGHT_KG;
  const kcal = met * w * (durationMin / 60);
  return Number(kcal.toFixed(1));
}

async function getProfileWeightKg(
  userId: string,
  tenantId: string,
): Promise<number | null> {
  const pool = getHealthPool();
  // Try the cross-domain physical profile first (height/weight live here).
  const phys = await pool.query(
    `SELECT weight_kg FROM agos_health_profile WHERE user_id = $1`,
    [userId],
  );
  if ((phys.rowCount ?? 0) > 0 && phys.rows[0].weight_kg !== null) {
    return Number(phys.rows[0].weight_kg);
  }
  // Fall back to the mental-health profile (no weight column today; reserved
  // for future use). Returning null is fine — the estimator has its own
  // default. Tenant lookup is kept here so future shape changes can land.
  void tenantId;
  return null;
}

export interface CreateActivityEntryInput {
  entryDate: string;
  activityType: string;
  durationMin: number;
  intensity?: ActivityIntensityValue;
  kcalBurned?: number | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export async function createActivityEntry(
  tenantId: string,
  userId: string,
  input: CreateActivityEntryInput,
): Promise<ActivityEntry> {
  const pool = getHealthPool();
  const intensity: ActivityIntensityValue = input.intensity ?? 'moderate';
  let kcal = input.kcalBurned ?? null;
  if (kcal === null) {
    const weightKg = await getProfileWeightKg(userId, tenantId);
    kcal = estimateActivityKcal(
      input.activityType,
      input.durationMin,
      intensity,
      weightKg,
    );
  }
  const id = randomUUID();
  const r = await pool.query(
    `INSERT INTO agos_mh_activity_entry (
        id, tenant_id, user_id, entry_date, activity_type, duration_min,
        intensity, kcal_burned, notes, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
     RETURNING ${ACTIVITY_ENTRY_COLS}`,
    [
      id,
      tenantId,
      userId,
      input.entryDate,
      input.activityType.trim(),
      input.durationMin,
      intensity,
      kcal,
      input.notes ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return rowToActivityEntry(r.rows[0]);
}

export interface ListActivityEntriesInput {
  tenantId: string;
  userId: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}

export async function listActivityEntries(
  input: ListActivityEntriesInput,
): Promise<ActivityEntry[]> {
  const pool = getHealthPool();
  const limit = Math.min(Math.max(input.limit ?? 200, 1), 1000);
  const params: unknown[] = [input.tenantId, input.userId];
  let where = `WHERE tenant_id = $1 AND user_id = $2`;
  if (input.fromDate) {
    params.push(input.fromDate);
    where += ` AND entry_date >= $${params.length}`;
  }
  if (input.toDate) {
    params.push(input.toDate);
    where += ` AND entry_date <= $${params.length}`;
  }
  params.push(limit);
  const r = await pool.query(
    `SELECT ${ACTIVITY_ENTRY_COLS}
       FROM agos_mh_activity_entry
       ${where}
      ORDER BY entry_date DESC, created_at
      LIMIT $${params.length}`,
    params,
  );
  return r.rows.map(rowToActivityEntry);
}

export async function getActivityEntry(
  id: string,
  tenantId: string,
  userId: string,
): Promise<ActivityEntry | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT ${ACTIVITY_ENTRY_COLS}
       FROM agos_mh_activity_entry
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [id, tenantId, userId],
  );
  if (r.rowCount === 0) return null;
  return rowToActivityEntry(r.rows[0]);
}

export interface UpdateActivityEntryInput {
  entryDate?: string;
  activityType?: string;
  durationMin?: number;
  intensity?: ActivityIntensityValue;
  kcalBurned?: number | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export async function updateActivityEntry(
  id: string,
  tenantId: string,
  userId: string,
  patch: UpdateActivityEntryInput,
): Promise<ActivityEntry | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `UPDATE agos_mh_activity_entry
        SET entry_date    = COALESCE($4, entry_date),
            activity_type = COALESCE($5, activity_type),
            duration_min  = COALESCE($6, duration_min),
            intensity     = COALESCE($7, intensity),
            kcal_burned   = COALESCE($8, kcal_burned),
            notes         = COALESCE($9, notes),
            metadata      = COALESCE($10::jsonb, metadata),
            updated_at    = now()
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3
      RETURNING ${ACTIVITY_ENTRY_COLS}`,
    [
      id,
      tenantId,
      userId,
      patch.entryDate ?? null,
      patch.activityType ? patch.activityType.trim() : null,
      patch.durationMin ?? null,
      patch.intensity ?? null,
      patch.kcalBurned ?? null,
      patch.notes ?? null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  if (r.rowCount === 0) return null;
  return rowToActivityEntry(r.rows[0]);
}

export async function deleteActivityEntry(
  id: string,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const pool = getHealthPool();
  const r = await pool.query(
    `DELETE FROM agos_mh_activity_entry
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [id, tenantId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Daily summaries (Phase 5a) ─────────────────────────────────────────────

export interface DailyNutritionSummary {
  date: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meal_count: number;
}

export async function getDailyNutritionSummary(
  tenantId: string,
  userId: string,
  date: string,
): Promise<DailyNutritionSummary> {
  const entries = await listMealEntries({
    tenantId,
    userId,
    fromDate: date,
    toDate: date,
    limit: 100,
  });
  let kcal = 0,
    protein = 0,
    carbs = 0,
    fat = 0;
  for (const e of entries) {
    if (e.nutrients.kcal !== null) kcal += e.nutrients.kcal;
    if (e.nutrients.protein_g !== null) protein += e.nutrients.protein_g;
    if (e.nutrients.carbs_g !== null) carbs += e.nutrients.carbs_g;
    if (e.nutrients.fat_g !== null) fat += e.nutrients.fat_g;
  }
  return {
    date,
    kcal: Number(kcal.toFixed(1)),
    protein_g: Number(protein.toFixed(1)),
    carbs_g: Number(carbs.toFixed(1)),
    fat_g: Number(fat.toFixed(1)),
    meal_count: entries.length,
  };
}

export interface DailyActivitySummary {
  date: string;
  duration_min: number;
  kcal_burned: number;
  activity_count: number;
}

export async function getDailyActivitySummary(
  tenantId: string,
  userId: string,
  date: string,
): Promise<DailyActivitySummary> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT
        COALESCE(SUM(duration_min), 0)::int AS duration_min,
        COALESCE(SUM(kcal_burned), 0)::float AS kcal_burned,
        COUNT(*)::int AS activity_count
       FROM agos_mh_activity_entry
      WHERE tenant_id = $1 AND user_id = $2 AND entry_date = $3`,
    [tenantId, userId, date],
  );
  const row = r.rows[0] ?? {};
  return {
    date,
    duration_min: Number(row.duration_min ?? 0),
    kcal_burned: Number((Number(row.kcal_burned ?? 0)).toFixed(1)),
    activity_count: Number(row.activity_count ?? 0),
  };
}

// ─── USDA cache (Phase 5b) ──────────────────────────────────────────────────

export interface SearchUsdaAndCacheInput {
  tenantId: string;
  query: string;
  limit?: number;
}

/**
 * Search USDA FoodData Central, upsert each hit into ``agos_mh_food_item``
 * with ``source='usda'`` and ``user_id=NULL``, and return the cached rows.
 *
 * If ``USDA_FDC_API_KEY`` is unset, returns ``[]`` — callers branch on
 * that to surface an inline "USDA not configured" notice.
 */
export async function searchUsdaAndCache(
  input: SearchUsdaAndCacheInput,
): Promise<FoodItem[]> {
  if (!isUsdaConfigured()) return [];
  const hits = await fdcSearchFoods(input.query, {
    pageSize: Math.min(Math.max(input.limit ?? 15, 1), 50),
  });
  if (hits.length === 0) return [];
  const pool = getHealthPool();
  const out: FoodItem[] = [];
  for (const hit of hits) {
    // The search endpoint returns a partial nutrient list; we still map it
    // so the row has macros for the common case. Detail-fetch on import
    // backfills anything missing.
    const detail = {
      fdcId: hit.fdcId,
      description: hit.description,
      brandName: hit.brandName ?? null,
      brandOwner: hit.brandOwner ?? null,
      dataType: hit.dataType,
      servingSize: hit.servingSize ?? null,
      servingSizeUnit: hit.servingSizeUnit ?? null,
      foodNutrients: hit.foodNutrients ?? [],
    };
    const mapped = mapFdcToFoodItem(detail);
    const id = randomUUID();
    const r = await pool.query(
      `INSERT INTO agos_mh_food_item (
          id, tenant_id, user_id, source, usda_fdc_id, name, brand,
          serving_size_g, serving_label, kcal, protein_g, carbs_g, fat_g,
          fiber_g, sugar_g, sodium_mg, metadata)
       VALUES ($1,$2,NULL,'usda',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
       ON CONFLICT (usda_fdc_id) WHERE usda_fdc_id IS NOT NULL DO UPDATE SET
          name           = EXCLUDED.name,
          brand          = EXCLUDED.brand,
          serving_size_g = EXCLUDED.serving_size_g,
          serving_label  = EXCLUDED.serving_label,
          kcal           = COALESCE(EXCLUDED.kcal, agos_mh_food_item.kcal),
          protein_g      = COALESCE(EXCLUDED.protein_g, agos_mh_food_item.protein_g),
          carbs_g        = COALESCE(EXCLUDED.carbs_g, agos_mh_food_item.carbs_g),
          fat_g          = COALESCE(EXCLUDED.fat_g, agos_mh_food_item.fat_g),
          fiber_g        = COALESCE(EXCLUDED.fiber_g, agos_mh_food_item.fiber_g),
          sugar_g        = COALESCE(EXCLUDED.sugar_g, agos_mh_food_item.sugar_g),
          sodium_mg      = COALESCE(EXCLUDED.sodium_mg, agos_mh_food_item.sodium_mg),
          metadata       = EXCLUDED.metadata,
          updated_at     = now()
       RETURNING ${FOOD_ITEM_COLS}`,
      [
        id,
        input.tenantId,
        mapped.usdaFdcId,
        mapped.name,
        mapped.brand ?? null,
        mapped.servingSizeG ?? null,
        mapped.servingLabel ?? null,
        mapped.kcal ?? null,
        mapped.proteinG ?? null,
        mapped.carbsG ?? null,
        mapped.fatG ?? null,
        mapped.fiberG ?? null,
        mapped.sugarG ?? null,
        mapped.sodiumMg ?? null,
        JSON.stringify(mapped.metadata ?? {}),
      ],
    );
    out.push(rowToFoodItem(r.rows[0]));
  }
  return out;
}

export interface ImportUsdaFoodInput {
  tenantId: string;
  fdcId: number;
}

/**
 * Fetch a single USDA food by fdcId, upsert into the cache, return it.
 * Used by "import this USDA result" buttons in the UI.
 */
export async function importUsdaFood(
  input: ImportUsdaFoodInput,
): Promise<FoodItem> {
  const detail = await fdcGetFood(input.fdcId);
  const mapped = mapFdcToFoodItem(detail);
  const pool = getHealthPool();
  const id = randomUUID();
  const r = await pool.query(
    `INSERT INTO agos_mh_food_item (
        id, tenant_id, user_id, source, usda_fdc_id, name, brand,
        serving_size_g, serving_label, kcal, protein_g, carbs_g, fat_g,
        fiber_g, sugar_g, sodium_mg, metadata)
     VALUES ($1,$2,NULL,'usda',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
     ON CONFLICT (usda_fdc_id) WHERE usda_fdc_id IS NOT NULL DO UPDATE SET
        name           = EXCLUDED.name,
        brand          = EXCLUDED.brand,
        serving_size_g = EXCLUDED.serving_size_g,
        serving_label  = EXCLUDED.serving_label,
        kcal           = COALESCE(EXCLUDED.kcal, agos_mh_food_item.kcal),
        protein_g      = COALESCE(EXCLUDED.protein_g, agos_mh_food_item.protein_g),
        carbs_g        = COALESCE(EXCLUDED.carbs_g, agos_mh_food_item.carbs_g),
        fat_g          = COALESCE(EXCLUDED.fat_g, agos_mh_food_item.fat_g),
        fiber_g        = COALESCE(EXCLUDED.fiber_g, agos_mh_food_item.fiber_g),
        sugar_g        = COALESCE(EXCLUDED.sugar_g, agos_mh_food_item.sugar_g),
        sodium_mg      = COALESCE(EXCLUDED.sodium_mg, agos_mh_food_item.sodium_mg),
        metadata       = EXCLUDED.metadata,
        updated_at     = now()
     RETURNING ${FOOD_ITEM_COLS}`,
    [
      id,
      input.tenantId,
      mapped.usdaFdcId,
      mapped.name,
      mapped.brand ?? null,
      mapped.servingSizeG ?? null,
      mapped.servingLabel ?? null,
      mapped.kcal ?? null,
      mapped.proteinG ?? null,
      mapped.carbsG ?? null,
      mapped.fatG ?? null,
      mapped.fiberG ?? null,
      mapped.sugarG ?? null,
      mapped.sodiumMg ?? null,
      JSON.stringify(mapped.metadata ?? {}),
    ],
  );
  return rowToFoodItem(r.rows[0]);
}

// ─── Unit conversion (Phase 5b) ─────────────────────────────────────────────

const UNIT_TO_GRAMS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
  cup: 240,
  tbsp: 15,
  tsp: 5,
};

/**
 * Convert ``quantity`` of ``unit`` to grams. Returns null for unknown
 * units so recipe nutrition aggregates can show "partial" honestly
 * rather than guessing.
 */
export function gramsFor(
  quantity: number,
  unit: string | null | undefined,
): number | null {
  if (typeof quantity !== 'number' || quantity < 0) return null;
  if (!unit) return null;
  const factor = UNIT_TO_GRAMS[unit.trim().toLowerCase()];
  if (factor === undefined) return null;
  return quantity * factor;
}

/**
 * Return the ISO Monday for any date. Locale-independent: uses UTC date
 * math so a Sunday late-night in a western TZ doesn't get bucketed into
 * next week.
 */
export function mondayOf(input: Date | string): string {
  const d = input instanceof Date ? new Date(input) : new Date(input);
  // Anchor to UTC midnight so DST + locale never shift the bucket.
  const utc = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const dow = utc.getUTCDay(); // 0=Sun..6=Sat
  const delta = dow === 0 ? -6 : 1 - dow;
  utc.setUTCDate(utc.getUTCDate() + delta);
  return utc.toISOString().slice(0, 10);
}

// ─── Recipes (Phase 5b) ─────────────────────────────────────────────────────

export interface RecipeIngredient {
  id: string;
  recipeId: string;
  foodItemId: string | null;
  foodItem?: FoodItem | null;
  freeformName: string | null;
  quantity: number;
  unit: string | null;
  position: number;
  notes: string | null;
}

export interface Recipe {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  description: string | null;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  instructions: string | null;
  tags: string[];
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
  ingredients?: RecipeIngredient[];
}

const RECIPE_COLS = `
  id, tenant_id, user_id, name, description, servings, prep_minutes,
  cook_minutes, instructions, tags, image_url, created_at, updated_at
`;

const INGREDIENT_COLS = `
  id, recipe_id, food_item_id, freeform_name, quantity, unit, position, notes
`;

function rowToRecipe(row: RawRecipeRow, ingredients?: RecipeIngredient[]): Recipe {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    servings: Number(row.servings),
    prepMinutes: row.prep_minutes === null ? null : Number(row.prep_minutes),
    cookMinutes: row.cook_minutes === null ? null : Number(row.cook_minutes),
    instructions: row.instructions,
    tags: row.tags ?? [],
    imageUrl: row.image_url,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ingredients,
  };
}

function rowToIngredient(
  row: RawRecipeIngredientRow,
  food?: FoodItem | null,
): RecipeIngredient {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    foodItemId: row.food_item_id,
    foodItem: food ?? null,
    freeformName: row.freeform_name,
    quantity: Number(row.quantity),
    unit: row.unit,
    position: Number(row.position),
    notes: row.notes,
  };
}

export interface CreateRecipeInput {
  name: string;
  description?: string | null;
  servings?: number;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  instructions?: string | null;
  tags?: string[];
  imageUrl?: string | null;
}

export async function createRecipe(
  tenantId: string,
  userId: string,
  input: CreateRecipeInput,
): Promise<Recipe> {
  const pool = getHealthPool();
  const id = randomUUID();
  const r = await pool.query(
    `INSERT INTO agos_mh_recipe (
        id, tenant_id, user_id, name, description, servings,
        prep_minutes, cook_minutes, instructions, tags, image_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING ${RECIPE_COLS}`,
    [
      id,
      tenantId,
      userId,
      input.name,
      input.description ?? null,
      input.servings ?? 1,
      input.prepMinutes ?? null,
      input.cookMinutes ?? null,
      input.instructions ?? null,
      input.tags ?? [],
      input.imageUrl ?? null,
    ],
  );
  return rowToRecipe(r.rows[0], []);
}

export async function getRecipe(
  id: string,
  tenantId: string,
): Promise<Recipe | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT ${RECIPE_COLS}
       FROM agos_mh_recipe
      WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );
  if (r.rowCount === 0) return null;
  const ingredients = await listRecipeIngredients(id, tenantId);
  return rowToRecipe(r.rows[0], ingredients);
}

export interface ListRecipesInput {
  tenantId: string;
  userId: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export async function listRecipes(
  input: ListRecipesInput,
): Promise<Recipe[]> {
  const pool = getHealthPool();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  const params: unknown[] = [input.tenantId, input.userId];
  let where = `WHERE tenant_id = $1 AND user_id = $2`;
  if (input.q && input.q.trim().length > 0) {
    params.push(`%${input.q.trim()}%`);
    where += ` AND name ILIKE $${params.length}`;
  }
  params.push(limit);
  params.push(offset);
  const r = await pool.query(
    `SELECT ${RECIPE_COLS}
       FROM agos_mh_recipe
       ${where}
      ORDER BY updated_at DESC
      LIMIT $${params.length - 1}
      OFFSET $${params.length}`,
    params,
  );
  return r.rows.map((row: RawRecipeRow) => rowToRecipe(row));
}

export interface UpdateRecipeInput {
  name?: string;
  description?: string | null;
  servings?: number;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  instructions?: string | null;
  tags?: string[];
  imageUrl?: string | null;
}

export async function updateRecipe(
  id: string,
  tenantId: string,
  userId: string,
  patch: UpdateRecipeInput,
): Promise<Recipe | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `UPDATE agos_mh_recipe
        SET name         = COALESCE($4, name),
            description  = COALESCE($5, description),
            servings     = COALESCE($6, servings),
            prep_minutes = COALESCE($7, prep_minutes),
            cook_minutes = COALESCE($8, cook_minutes),
            instructions = COALESCE($9, instructions),
            tags         = COALESCE($10, tags),
            image_url    = COALESCE($11, image_url),
            updated_at   = now()
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3
      RETURNING ${RECIPE_COLS}`,
    [
      id,
      tenantId,
      userId,
      patch.name ?? null,
      patch.description ?? null,
      patch.servings ?? null,
      patch.prepMinutes ?? null,
      patch.cookMinutes ?? null,
      patch.instructions ?? null,
      patch.tags ?? null,
      patch.imageUrl ?? null,
    ],
  );
  if (r.rowCount === 0) return null;
  const ingredients = await listRecipeIngredients(id, tenantId);
  return rowToRecipe(r.rows[0], ingredients);
}

export async function deleteRecipe(
  id: string,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const pool = getHealthPool();
  const r = await pool.query(
    `DELETE FROM agos_mh_recipe
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [id, tenantId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Recipe ingredients ─────────────────────────────────────────────────────

export async function listRecipeIngredients(
  recipeId: string,
  tenantId: string,
): Promise<RecipeIngredient[]> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT i.id, i.recipe_id, i.food_item_id, i.freeform_name, i.quantity,
            i.unit, i.position, i.notes,
            f.id AS f_id, f.tenant_id AS f_tenant_id, f.user_id AS f_user_id,
            f.source AS f_source, f.usda_fdc_id AS f_usda_fdc_id,
            f.name AS f_name, f.brand AS f_brand,
            f.serving_size_g AS f_serving_size_g, f.serving_label AS f_serving_label,
            f.kcal AS f_kcal, f.protein_g AS f_protein_g, f.carbs_g AS f_carbs_g,
            f.fat_g AS f_fat_g, f.fiber_g AS f_fiber_g, f.sugar_g AS f_sugar_g,
            f.sodium_mg AS f_sodium_mg, f.metadata AS f_metadata,
            f.created_at AS f_created_at, f.updated_at AS f_updated_at
       FROM agos_mh_recipe_ingredient i
       JOIN agos_mh_recipe r ON r.id = i.recipe_id
       LEFT JOIN agos_mh_food_item f ON f.id = i.food_item_id
      WHERE i.recipe_id = $1 AND r.tenant_id = $2
      ORDER BY i.position`,
    [recipeId, tenantId],
  );
  type RawIngredientJoinedRow = RawRecipeIngredientRow & {
    f_id: string | null;
    f_tenant_id: string | null;
    f_user_id: string | null;
    f_source: string | null;
    f_usda_fdc_id: string | null;
    f_name: string | null;
    f_brand: string | null;
    f_serving_size_g: number | string | null;
    f_serving_label: string | null;
    f_kcal: number | string | null;
    f_protein_g: number | string | null;
    f_carbs_g: number | string | null;
    f_fat_g: number | string | null;
    f_fiber_g: number | string | null;
    f_sugar_g: number | string | null;
    f_sodium_mg: number | string | null;
    f_metadata: Record<string, unknown> | null;
    f_created_at: Date | null;
    f_updated_at: Date | null;
  };
  return r.rows.map((row: RawIngredientJoinedRow) => {
    let food: FoodItem | null = null;
    if (row.f_id) {
      food = rowToFoodItem({
        id: row.f_id,
        tenant_id: row.f_tenant_id as string,
        user_id: row.f_user_id,
        source: row.f_source as string,
        usda_fdc_id: row.f_usda_fdc_id,
        name: row.f_name as string,
        brand: row.f_brand,
        serving_size_g: row.f_serving_size_g,
        serving_label: row.f_serving_label,
        kcal: row.f_kcal,
        protein_g: row.f_protein_g,
        carbs_g: row.f_carbs_g,
        fat_g: row.f_fat_g,
        fiber_g: row.f_fiber_g,
        sugar_g: row.f_sugar_g,
        sodium_mg: row.f_sodium_mg,
        metadata: row.f_metadata,
        created_at: row.f_created_at as Date,
        updated_at: row.f_updated_at as Date,
      });
    }
    return rowToIngredient(row, food);
  });
}

export interface AddRecipeIngredientInput {
  foodItemId?: string | null;
  freeformName?: string | null;
  quantity: number;
  unit?: string | null;
  notes?: string | null;
  position?: number;
}

export async function addRecipeIngredient(
  recipeId: string,
  tenantId: string,
  userId: string,
  input: AddRecipeIngredientInput,
): Promise<RecipeIngredient | null> {
  const pool = getHealthPool();
  // Verify recipe ownership before insert.
  const owner = await pool.query(
    `SELECT 1 FROM agos_mh_recipe WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [recipeId, tenantId, userId],
  );
  if (owner.rowCount === 0) return null;
  const id = randomUUID();
  // Default position = end of list.
  let position = input.position;
  if (position === undefined || position === null) {
    const tail = await pool.query(
      `SELECT COALESCE(MAX(position), -1) AS p FROM agos_mh_recipe_ingredient WHERE recipe_id = $1`,
      [recipeId],
    );
    position = Number(tail.rows[0].p) + 1;
  }
  const r = await pool.query(
    `INSERT INTO agos_mh_recipe_ingredient (
        id, recipe_id, food_item_id, freeform_name, quantity, unit, position, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING ${INGREDIENT_COLS}`,
    [
      id,
      recipeId,
      input.foodItemId ?? null,
      input.freeformName ?? null,
      input.quantity,
      input.unit ?? null,
      position,
      input.notes ?? null,
    ],
  );
  const food = input.foodItemId
    ? await getFoodItem(input.foodItemId, tenantId)
    : null;
  return rowToIngredient(r.rows[0], food);
}

export interface UpdateRecipeIngredientInput {
  foodItemId?: string | null;
  freeformName?: string | null;
  quantity?: number;
  unit?: string | null;
  notes?: string | null;
  position?: number;
}

export async function updateRecipeIngredient(
  ingredientId: string,
  recipeId: string,
  tenantId: string,
  userId: string,
  patch: UpdateRecipeIngredientInput,
): Promise<RecipeIngredient | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `UPDATE agos_mh_recipe_ingredient i
        SET food_item_id  = COALESCE($4, i.food_item_id),
            freeform_name = COALESCE($5, i.freeform_name),
            quantity      = COALESCE($6, i.quantity),
            unit          = COALESCE($7, i.unit),
            position      = COALESCE($8, i.position),
            notes         = COALESCE($9, i.notes)
      FROM agos_mh_recipe r
     WHERE i.id = $1 AND i.recipe_id = $2 AND r.id = i.recipe_id
       AND r.tenant_id = $3 AND r.user_id = $10
     RETURNING ${INGREDIENT_COLS.split(',').map((c) => 'i.' + c.trim()).join(', ')}`,
    [
      ingredientId,
      recipeId,
      tenantId,
      patch.foodItemId ?? null,
      patch.freeformName ?? null,
      patch.quantity ?? null,
      patch.unit ?? null,
      patch.position ?? null,
      patch.notes ?? null,
      userId,
    ],
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0];
  const food = row.food_item_id ? await getFoodItem(row.food_item_id, tenantId) : null;
  return rowToIngredient(row, food);
}

export async function deleteRecipeIngredient(
  ingredientId: string,
  recipeId: string,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const pool = getHealthPool();
  const r = await pool.query(
    `DELETE FROM agos_mh_recipe_ingredient i
      USING agos_mh_recipe r
     WHERE i.id = $1 AND i.recipe_id = $2 AND r.id = i.recipe_id
       AND r.tenant_id = $3 AND r.user_id = $4`,
    [ingredientId, recipeId, tenantId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Re-assign positions to the supplied ingredient ids in order. Caller
 * passes the full set in the desired new order; we rewrite ``position``
 * to match the array index. Cross-tenant attempts are filtered out.
 */
export async function reorderRecipeIngredients(
  recipeId: string,
  tenantId: string,
  userId: string,
  orderedIds: string[],
): Promise<boolean> {
  const pool = getHealthPool();
  const owner = await pool.query(
    `SELECT 1 FROM agos_mh_recipe WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [recipeId, tenantId, userId],
  );
  if (owner.rowCount === 0) return false;
  // Two-phase so we never collide on a (recipe_id, position) constraint
  // even if we add one later: bump everything out of the way first.
  await pool.query(
    `UPDATE agos_mh_recipe_ingredient
        SET position = position + 1000
      WHERE recipe_id = $1`,
    [recipeId],
  );
  for (let i = 0; i < orderedIds.length; i++) {
    await pool.query(
      `UPDATE agos_mh_recipe_ingredient
          SET position = $3
        WHERE id = $1 AND recipe_id = $2`,
      [orderedIds[i], recipeId, i],
    );
  }
  return true;
}

// ─── Recipe nutrition rollup ────────────────────────────────────────────────

export interface RecipeNutrition {
  recipeId: string;
  servings: number;
  total: {
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    sugar_g: number;
    sodium_mg: number;
  };
  perServing: {
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    sugar_g: number;
    sodium_mg: number;
  };
  /** Ingredient count that we couldn't convert to grams (unit unknown). */
  partial: number;
}

/**
 * Aggregate ingredients × quantity-in-grams → recipe totals. Falls back to
 * "1 unit ≈ 1 serving of the food item" when the unit is unknown but the
 * food has nutrients per-serving; reports the remainder as ``partial``.
 */
export async function computeRecipeNutrition(
  recipeId: string,
  tenantId: string,
): Promise<RecipeNutrition | null> {
  const recipe = await getRecipe(recipeId, tenantId);
  if (!recipe) return null;
  let kcal = 0,
    protein = 0,
    carbs = 0,
    fat = 0,
    fiber = 0,
    sugar = 0,
    sodium = 0;
  let partial = 0;
  for (const ing of recipe.ingredients ?? []) {
    const food = ing.foodItem;
    if (!food) {
      partial += 1;
      continue;
    }
    const grams = gramsFor(ing.quantity, ing.unit);
    // Two paths: grams-based (food row is per-100g) vs serving-based.
    const servingSizeG = food.servingSizeG;
    let factor: number | null = null;
    if (grams !== null && servingSizeG && servingSizeG > 0) {
      factor = grams / servingSizeG;
    } else if (grams === null && (!ing.unit || ing.unit.trim() === '')) {
      // No unit at all → treat quantity as # of servings of the food item.
      factor = ing.quantity;
    }
    if (factor === null) {
      partial += 1;
      continue;
    }
    if (food.kcal !== null) kcal += food.kcal * factor;
    if (food.proteinG !== null) protein += food.proteinG * factor;
    if (food.carbsG !== null) carbs += food.carbsG * factor;
    if (food.fatG !== null) fat += food.fatG * factor;
    if (food.fiberG !== null) fiber += food.fiberG * factor;
    if (food.sugarG !== null) sugar += food.sugarG * factor;
    if (food.sodiumMg !== null) sodium += food.sodiumMg * factor;
  }
  const total = {
    kcal: Number(kcal.toFixed(1)),
    protein_g: Number(protein.toFixed(1)),
    carbs_g: Number(carbs.toFixed(1)),
    fat_g: Number(fat.toFixed(1)),
    fiber_g: Number(fiber.toFixed(1)),
    sugar_g: Number(sugar.toFixed(1)),
    sodium_mg: Number(sodium.toFixed(1)),
  };
  const s = recipe.servings > 0 ? recipe.servings : 1;
  const perServing = {
    kcal: Number((total.kcal / s).toFixed(1)),
    protein_g: Number((total.protein_g / s).toFixed(1)),
    carbs_g: Number((total.carbs_g / s).toFixed(1)),
    fat_g: Number((total.fat_g / s).toFixed(1)),
    fiber_g: Number((total.fiber_g / s).toFixed(1)),
    sugar_g: Number((total.sugar_g / s).toFixed(1)),
    sodium_mg: Number((total.sodium_mg / s).toFixed(1)),
  };
  return {
    recipeId,
    servings: recipe.servings,
    total,
    perServing,
    partial,
  };
}

// ─── Meal plans (Phase 5b) ──────────────────────────────────────────────────

export interface MealPlanSlot {
  id: string;
  planId: string;
  dayOfWeek: number;
  mealSlot: MealSlotValue;
  recipeId: string | null;
  recipe?: Recipe | null;
  foodItemId: string | null;
  foodItem?: FoodItem | null;
  freeformText: string | null;
  servings: number;
  notes: string | null;
  position: number;
}

export interface MealPlan {
  id: string;
  tenantId: string;
  userId: string;
  weekStartDate: string;
  name: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  slots?: MealPlanSlot[];
}

const PLAN_COLS = `
  id, tenant_id, user_id, week_start_date, name, notes, created_at, updated_at
`;

const PLAN_SLOT_COLS = `
  id, plan_id, day_of_week, meal_slot, recipe_id, food_item_id,
  freeform_text, servings, notes, position
`;

function rowToPlan(row: RawMealPlanRow, slots?: MealPlanSlot[]): MealPlan {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    weekStartDate:
      row.week_start_date instanceof Date
        ? row.week_start_date.toISOString().slice(0, 10)
        : String(row.week_start_date).slice(0, 10),
    name: row.name,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    slots,
  };
}

function rowToSlot(
  row: RawMealPlanSlotRow,
  recipe?: Recipe | null,
  food?: FoodItem | null,
): MealPlanSlot {
  return {
    id: row.id,
    planId: row.plan_id,
    dayOfWeek: Number(row.day_of_week),
    mealSlot: row.meal_slot as MealSlotValue,
    recipeId: row.recipe_id,
    recipe: recipe ?? null,
    foodItemId: row.food_item_id,
    foodItem: food ?? null,
    freeformText: row.freeform_text,
    servings: Number(row.servings),
    notes: row.notes,
    position: Number(row.position),
  };
}

export interface CreateMealPlanInput {
  weekStartDate: string;
  name?: string | null;
  notes?: string | null;
}

export class MealPlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MealPlanValidationError';
  }
}

export async function createMealPlan(
  tenantId: string,
  userId: string,
  input: CreateMealPlanInput,
): Promise<MealPlan> {
  const monday = mondayOf(input.weekStartDate);
  if (monday !== input.weekStartDate) {
    throw new MealPlanValidationError(
      `weekStartDate must be a Monday (got ${input.weekStartDate}, Monday is ${monday})`,
    );
  }
  const pool = getHealthPool();
  const id = randomUUID();
  const r = await pool.query(
    `INSERT INTO agos_mh_meal_plan
        (id, tenant_id, user_id, week_start_date, name, notes)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (tenant_id, user_id, week_start_date) DO UPDATE SET
        name       = COALESCE(EXCLUDED.name, agos_mh_meal_plan.name),
        notes      = COALESCE(EXCLUDED.notes, agos_mh_meal_plan.notes),
        updated_at = now()
     RETURNING ${PLAN_COLS}`,
    [id, tenantId, userId, input.weekStartDate, input.name ?? null, input.notes ?? null],
  );
  return rowToPlan(r.rows[0], []);
}

export async function getMealPlan(
  id: string,
  tenantId: string,
  userId: string,
): Promise<MealPlan | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT ${PLAN_COLS}
       FROM agos_mh_meal_plan
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [id, tenantId, userId],
  );
  if (r.rowCount === 0) return null;
  const slots = await listMealPlanSlots(r.rows[0].id, tenantId);
  return rowToPlan(r.rows[0], slots);
}

export interface ListMealPlansInput {
  tenantId: string;
  userId: string;
  fromWeek?: string;
  toWeek?: string;
  limit?: number;
}

export async function listMealPlans(
  input: ListMealPlansInput,
): Promise<MealPlan[]> {
  const pool = getHealthPool();
  const limit = Math.min(Math.max(input.limit ?? 26, 1), 200);
  const params: unknown[] = [input.tenantId, input.userId];
  let where = `WHERE tenant_id = $1 AND user_id = $2`;
  if (input.fromWeek) {
    params.push(input.fromWeek);
    where += ` AND week_start_date >= $${params.length}`;
  }
  if (input.toWeek) {
    params.push(input.toWeek);
    where += ` AND week_start_date <= $${params.length}`;
  }
  params.push(limit);
  const r = await pool.query(
    `SELECT ${PLAN_COLS}
       FROM agos_mh_meal_plan
       ${where}
      ORDER BY week_start_date DESC
      LIMIT $${params.length}`,
    params,
  );
  return r.rows.map((row: RawMealPlanRow) => rowToPlan(row));
}

export interface UpdateMealPlanInput {
  name?: string | null;
  notes?: string | null;
}

export async function updateMealPlan(
  id: string,
  tenantId: string,
  userId: string,
  patch: UpdateMealPlanInput,
): Promise<MealPlan | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `UPDATE agos_mh_meal_plan
        SET name       = COALESCE($4, name),
            notes      = COALESCE($5, notes),
            updated_at = now()
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3
      RETURNING ${PLAN_COLS}`,
    [id, tenantId, userId, patch.name ?? null, patch.notes ?? null],
  );
  if (r.rowCount === 0) return null;
  const slots = await listMealPlanSlots(id, tenantId);
  return rowToPlan(r.rows[0], slots);
}

export async function deleteMealPlan(
  id: string,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const pool = getHealthPool();
  const r = await pool.query(
    `DELETE FROM agos_mh_meal_plan
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [id, tenantId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Fetch (or create-on-empty? — we just return null when missing so the UI
 * can choose to lazy-create) the plan for a given Monday, with all slots,
 * recipe + food joins included.
 */
export async function getMealPlanForWeek(
  tenantId: string,
  userId: string,
  weekStartDate: string,
): Promise<MealPlan | null> {
  const monday = mondayOf(weekStartDate);
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT ${PLAN_COLS}
       FROM agos_mh_meal_plan
      WHERE tenant_id = $1 AND user_id = $2 AND week_start_date = $3`,
    [tenantId, userId, monday],
  );
  if (r.rowCount === 0) return null;
  const slots = await listMealPlanSlots(r.rows[0].id, tenantId);
  return rowToPlan(r.rows[0], slots);
}

// ─── Meal plan slots ────────────────────────────────────────────────────────

async function listMealPlanSlots(
  planId: string,
  tenantId: string,
): Promise<MealPlanSlot[]> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT s.id, s.plan_id, s.day_of_week, s.meal_slot, s.recipe_id,
            s.food_item_id, s.freeform_text, s.servings, s.notes, s.position,
            r.id AS r_id, r.tenant_id AS r_tenant_id, r.user_id AS r_user_id,
            r.name AS r_name, r.description AS r_description, r.servings AS r_servings,
            r.prep_minutes AS r_prep_minutes, r.cook_minutes AS r_cook_minutes,
            r.instructions AS r_instructions, r.tags AS r_tags,
            r.image_url AS r_image_url, r.created_at AS r_created_at,
            r.updated_at AS r_updated_at,
            f.id AS f_id, f.tenant_id AS f_tenant_id, f.user_id AS f_user_id,
            f.source AS f_source, f.usda_fdc_id AS f_usda_fdc_id,
            f.name AS f_name, f.brand AS f_brand,
            f.serving_size_g AS f_serving_size_g, f.serving_label AS f_serving_label,
            f.kcal AS f_kcal, f.protein_g AS f_protein_g, f.carbs_g AS f_carbs_g,
            f.fat_g AS f_fat_g, f.fiber_g AS f_fiber_g, f.sugar_g AS f_sugar_g,
            f.sodium_mg AS f_sodium_mg, f.metadata AS f_metadata,
            f.created_at AS f_created_at, f.updated_at AS f_updated_at
       FROM agos_mh_meal_plan_slot s
       JOIN agos_mh_meal_plan p ON p.id = s.plan_id
       LEFT JOIN agos_mh_recipe r ON r.id = s.recipe_id
       LEFT JOIN agos_mh_food_item f ON f.id = s.food_item_id
      WHERE s.plan_id = $1 AND p.tenant_id = $2
      ORDER BY s.day_of_week, s.meal_slot, s.position`,
    [planId, tenantId],
  );
  type RawSlotJoinedRow = RawMealPlanSlotRow & {
    r_id: string | null;
    r_tenant_id: string | null;
    r_user_id: string | null;
    r_name: string | null;
    r_description: string | null;
    r_servings: number | string | null;
    r_prep_minutes: number | string | null;
    r_cook_minutes: number | string | null;
    r_instructions: string | null;
    r_tags: string[] | null;
    r_image_url: string | null;
    r_created_at: Date | null;
    r_updated_at: Date | null;
    f_id: string | null;
    f_tenant_id: string | null;
    f_user_id: string | null;
    f_source: string | null;
    f_usda_fdc_id: string | null;
    f_name: string | null;
    f_brand: string | null;
    f_serving_size_g: number | string | null;
    f_serving_label: string | null;
    f_kcal: number | string | null;
    f_protein_g: number | string | null;
    f_carbs_g: number | string | null;
    f_fat_g: number | string | null;
    f_fiber_g: number | string | null;
    f_sugar_g: number | string | null;
    f_sodium_mg: number | string | null;
    f_metadata: Record<string, unknown> | null;
    f_created_at: Date | null;
    f_updated_at: Date | null;
  };
  return r.rows.map((row: RawSlotJoinedRow) => {
    const recipe: Recipe | null = row.r_id
      ? rowToRecipe({
          id: row.r_id,
          tenant_id: row.r_tenant_id as string,
          user_id: row.r_user_id as string,
          name: row.r_name as string,
          description: row.r_description,
          servings: row.r_servings as number | string,
          prep_minutes: row.r_prep_minutes,
          cook_minutes: row.r_cook_minutes,
          instructions: row.r_instructions,
          tags: row.r_tags,
          image_url: row.r_image_url,
          created_at: row.r_created_at as Date,
          updated_at: row.r_updated_at as Date,
        })
      : null;
    let food: FoodItem | null = null;
    if (row.f_id) {
      food = rowToFoodItem({
        id: row.f_id,
        tenant_id: row.f_tenant_id as string,
        user_id: row.f_user_id,
        source: row.f_source as string,
        usda_fdc_id: row.f_usda_fdc_id,
        name: row.f_name as string,
        brand: row.f_brand,
        serving_size_g: row.f_serving_size_g,
        serving_label: row.f_serving_label,
        kcal: row.f_kcal,
        protein_g: row.f_protein_g,
        carbs_g: row.f_carbs_g,
        fat_g: row.f_fat_g,
        fiber_g: row.f_fiber_g,
        sugar_g: row.f_sugar_g,
        sodium_mg: row.f_sodium_mg,
        metadata: row.f_metadata,
        created_at: row.f_created_at as Date,
        updated_at: row.f_updated_at as Date,
      });
    }
    return rowToSlot(row, recipe, food);
  });
}

export interface AddPlanSlotInput {
  dayOfWeek: number;
  mealSlot: MealSlotValue;
  recipeId?: string | null;
  foodItemId?: string | null;
  freeformText?: string | null;
  servings?: number;
  notes?: string | null;
  position?: number;
}

export async function addPlanSlot(
  planId: string,
  tenantId: string,
  userId: string,
  input: AddPlanSlotInput,
): Promise<MealPlanSlot | null> {
  const pool = getHealthPool();
  const owner = await pool.query(
    `SELECT 1 FROM agos_mh_meal_plan WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [planId, tenantId, userId],
  );
  if (owner.rowCount === 0) return null;
  let position = input.position;
  if (position === undefined || position === null) {
    const tail = await pool.query(
      `SELECT COALESCE(MAX(position), -1) AS p
         FROM agos_mh_meal_plan_slot
        WHERE plan_id = $1 AND day_of_week = $2 AND meal_slot = $3`,
      [planId, input.dayOfWeek, input.mealSlot],
    );
    position = Number(tail.rows[0].p) + 1;
  }
  const id = randomUUID();
  const r = await pool.query(
    `INSERT INTO agos_mh_meal_plan_slot (
        id, plan_id, day_of_week, meal_slot, recipe_id, food_item_id,
        freeform_text, servings, notes, position)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING ${PLAN_SLOT_COLS}`,
    [
      id,
      planId,
      input.dayOfWeek,
      input.mealSlot,
      input.recipeId ?? null,
      input.foodItemId ?? null,
      input.freeformText ?? null,
      input.servings ?? 1,
      input.notes ?? null,
      position,
    ],
  );
  const recipe = input.recipeId ? await getRecipe(input.recipeId, tenantId) : null;
  const food = input.foodItemId ? await getFoodItem(input.foodItemId, tenantId) : null;
  return rowToSlot(r.rows[0], recipe, food);
}

export interface UpdatePlanSlotInput {
  dayOfWeek?: number;
  mealSlot?: MealSlotValue;
  recipeId?: string | null;
  foodItemId?: string | null;
  freeformText?: string | null;
  servings?: number;
  notes?: string | null;
  position?: number;
}

export async function updatePlanSlot(
  slotId: string,
  tenantId: string,
  userId: string,
  patch: UpdatePlanSlotInput,
): Promise<MealPlanSlot | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `UPDATE agos_mh_meal_plan_slot s
        SET day_of_week   = COALESCE($3, s.day_of_week),
            meal_slot     = COALESCE($4, s.meal_slot),
            recipe_id     = COALESCE($5, s.recipe_id),
            food_item_id  = COALESCE($6, s.food_item_id),
            freeform_text = COALESCE($7, s.freeform_text),
            servings      = COALESCE($8, s.servings),
            notes         = COALESCE($9, s.notes),
            position      = COALESCE($10, s.position)
      FROM agos_mh_meal_plan p
     WHERE s.id = $1 AND p.id = s.plan_id
       AND p.tenant_id = $2 AND p.user_id = $11
     RETURNING ${PLAN_SLOT_COLS.split(',').map((c) => 's.' + c.trim()).join(', ')}`,
    [
      slotId,
      tenantId,
      patch.dayOfWeek ?? null,
      patch.mealSlot ?? null,
      patch.recipeId ?? null,
      patch.foodItemId ?? null,
      patch.freeformText ?? null,
      patch.servings ?? null,
      patch.notes ?? null,
      patch.position ?? null,
      userId,
    ],
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0];
  const recipe = row.recipe_id ? await getRecipe(row.recipe_id, tenantId) : null;
  const food = row.food_item_id ? await getFoodItem(row.food_item_id, tenantId) : null;
  return rowToSlot(row, recipe, food);
}

export async function deletePlanSlot(
  slotId: string,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const pool = getHealthPool();
  const r = await pool.query(
    `DELETE FROM agos_mh_meal_plan_slot s
      USING agos_mh_meal_plan p
     WHERE s.id = $1 AND p.id = s.plan_id
       AND p.tenant_id = $2 AND p.user_id = $3`,
    [slotId, tenantId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function movePlanSlot(
  slotId: string,
  tenantId: string,
  userId: string,
  dayOfWeek: number,
  mealSlot: MealSlotValue,
  position: number,
): Promise<MealPlanSlot | null> {
  return updatePlanSlot(slotId, tenantId, userId, {
    dayOfWeek,
    mealSlot,
    position,
  });
}

/**
 * Convenience: turn a planned slot into an actual ``agos_mh_meal_entry``
 * for the given date. Used by the "I ate this" button on the calendar.
 */
export async function addPlanSlotToMealLog(
  slotId: string,
  tenantId: string,
  userId: string,
  entryDate: string,
): Promise<MealEntry | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT s.meal_slot, s.recipe_id, s.food_item_id, s.freeform_text,
            s.servings, s.notes
       FROM agos_mh_meal_plan_slot s
       JOIN agos_mh_meal_plan p ON p.id = s.plan_id
      WHERE s.id = $1 AND p.tenant_id = $2 AND p.user_id = $3`,
    [slotId, tenantId, userId],
  );
  if (r.rowCount === 0) return null;
  const slot = r.rows[0];
  // If the slot points at a recipe, log the recipe name as freeform (we don't
  // currently expand recipes into ingredient-level meal entries — that's a
  // future enhancement once nutrition rollup is per-serving solid).
  let freeform: string | null = slot.freeform_text;
  if (slot.recipe_id) {
    const recipe = await getRecipe(slot.recipe_id, tenantId);
    freeform = recipe?.name ?? freeform;
  }
  return createMealEntry(tenantId, userId, {
    entryDate,
    mealSlot: slot.meal_slot as MealSlotValue,
    foodItemId: slot.food_item_id,
    freeformDescription: slot.food_item_id ? null : freeform,
    servings: Number(slot.servings),
    notes: slot.notes,
  });
}

// ─── Workout templates (Phase 5c) ───────────────────────────────────────────

export type WorkoutTemplateSource = 'system' | 'custom';
export type WorkoutTemplateBlockKind = 'exercise' | 'rest' | 'note';

export interface WorkoutTemplateBlock {
  id: string;
  templateId: string;
  position: number;
  kind: WorkoutTemplateBlockKind;
  name: string;
  sets: number | null;
  reps: string | null;
  durationSec: number | null;
  restSec: number | null;
  weightHint: string | null;
  notes: string | null;
}

export interface WorkoutTemplate {
  id: string;
  tenantId: string | null;
  userId: string | null;
  source: WorkoutTemplateSource;
  name: string;
  description: string | null;
  category: string;
  targetIntensity: ActivityIntensityValue;
  estDurationMin: number;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  blocks?: WorkoutTemplateBlock[];
  blockCount?: number;
}

const WORKOUT_TEMPLATE_COLS = `
  id, tenant_id, user_id, source, name, description, category,
  target_intensity, est_duration_min, tags, metadata, created_at, updated_at
`;

const WORKOUT_TEMPLATE_BLOCK_COLS = `
  id, template_id, position, kind, name, sets, reps, duration_sec,
  rest_sec, weight_hint, notes
`;

function rowToWorkoutTemplate(
  row: RawWorkoutTemplateRow,
  blocks?: WorkoutTemplateBlock[],
  blockCount?: number,
): WorkoutTemplate {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    source: row.source as WorkoutTemplateSource,
    name: row.name,
    description: row.description,
    category: row.category,
    targetIntensity: row.target_intensity as ActivityIntensityValue,
    estDurationMin: Number(row.est_duration_min),
    tags: row.tags ?? [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    blocks,
    blockCount:
      blockCount ??
      (row.block_count !== undefined ? Number(row.block_count) : undefined),
  };
}

function rowToWorkoutTemplateBlock(row: RawWorkoutTemplateBlockRow): WorkoutTemplateBlock {
  return {
    id: row.id,
    templateId: row.template_id,
    position: Number(row.position),
    kind: row.kind as WorkoutTemplateBlockKind,
    name: row.name,
    sets: row.sets === null ? null : Number(row.sets),
    reps: row.reps,
    durationSec: row.duration_sec === null ? null : Number(row.duration_sec),
    restSec: row.rest_sec === null ? null : Number(row.rest_sec),
    weightHint: row.weight_hint,
    notes: row.notes,
  };
}

export interface ListWorkoutTemplatesInput {
  tenantId: string;
  userId: string;
  q?: string;
  category?: string;
  source?: WorkoutTemplateSource | 'all';
  limit?: number;
  offset?: number;
}

export async function listWorkoutTemplates(
  input: ListWorkoutTemplatesInput,
): Promise<WorkoutTemplate[]> {
  const pool = getHealthPool();
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const offset = Math.max(input.offset ?? 0, 0);
  const params: unknown[] = [input.tenantId, input.userId];
  // Visibility: system rows (cross-tenant) OR your own customs.
  let where = `WHERE (source = 'system'
                     OR (source = 'custom' AND tenant_id = $1 AND user_id = $2))`;
  if (input.source === 'system') {
    where += ` AND source = 'system'`;
  } else if (input.source === 'custom') {
    where += ` AND source = 'custom'`;
  }
  if (input.category && input.category.trim().length > 0) {
    params.push(input.category.trim());
    where += ` AND category = $${params.length}`;
  }
  if (input.q && input.q.trim().length > 0) {
    params.push(`%${input.q.trim()}%`);
    where += ` AND name ILIKE $${params.length}`;
  }
  params.push(limit);
  params.push(offset);
  const r = await pool.query(
    `SELECT ${WORKOUT_TEMPLATE_COLS},
            (SELECT COUNT(*)::int FROM agos_mh_workout_template_block b
              WHERE b.template_id = t.id) AS block_count
       FROM agos_mh_workout_template t
       ${where}
      ORDER BY source DESC, name ASC
      LIMIT $${params.length - 1}
      OFFSET $${params.length}`,
    params,
  );
  return r.rows.map((row: RawWorkoutTemplateRow) => rowToWorkoutTemplate(row));
}

export async function getWorkoutTemplate(
  id: string,
  tenantId: string,
  userId?: string,
): Promise<WorkoutTemplate | null> {
  const pool = getHealthPool();
  // System rows visible to all; customs only to their owner.
  const params: unknown[] = [id, tenantId];
  let where = `WHERE id = $1 AND (source = 'system'
                                  OR (source = 'custom' AND tenant_id = $2`;
  if (userId !== undefined) {
    params.push(userId);
    where += ` AND user_id = $${params.length}`;
  }
  where += '))';
  const r = await pool.query(
    `SELECT ${WORKOUT_TEMPLATE_COLS} FROM agos_mh_workout_template ${where}`,
    params,
  );
  if (r.rowCount === 0) return null;
  const blocks = await listWorkoutTemplateBlocks(id);
  return rowToWorkoutTemplate(r.rows[0], blocks, blocks.length);
}

export interface CreateWorkoutTemplateInput {
  name: string;
  description?: string | null;
  category: string;
  targetIntensity?: ActivityIntensityValue;
  estDurationMin: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export async function createWorkoutTemplate(
  tenantId: string,
  userId: string,
  input: CreateWorkoutTemplateInput,
): Promise<WorkoutTemplate> {
  const pool = getHealthPool();
  const id = randomUUID();
  const r = await pool.query(
    `INSERT INTO agos_mh_workout_template (
        id, tenant_id, user_id, source, name, description, category,
        target_intensity, est_duration_min, tags, metadata)
     VALUES ($1,$2,$3,'custom',$4,$5,$6,$7,$8,$9,$10::jsonb)
     RETURNING ${WORKOUT_TEMPLATE_COLS}`,
    [
      id,
      tenantId,
      userId,
      input.name.trim(),
      input.description ?? null,
      input.category,
      input.targetIntensity ?? 'moderate',
      input.estDurationMin,
      input.tags ?? [],
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return rowToWorkoutTemplate(r.rows[0], [], 0);
}

export interface UpdateWorkoutTemplateInput {
  name?: string;
  description?: string | null;
  category?: string;
  targetIntensity?: ActivityIntensityValue;
  estDurationMin?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export async function updateWorkoutTemplate(
  id: string,
  tenantId: string,
  userId: string,
  patch: UpdateWorkoutTemplateInput,
): Promise<WorkoutTemplate | null> {
  const pool = getHealthPool();
  // Customs-only — system rows are immutable.
  const r = await pool.query(
    `UPDATE agos_mh_workout_template
        SET name             = COALESCE($4, name),
            description      = COALESCE($5, description),
            category         = COALESCE($6, category),
            target_intensity = COALESCE($7, target_intensity),
            est_duration_min = COALESCE($8, est_duration_min),
            tags             = COALESCE($9, tags),
            metadata         = COALESCE($10::jsonb, metadata),
            updated_at       = now()
      WHERE id = $1 AND source = 'custom' AND tenant_id = $2 AND user_id = $3
      RETURNING ${WORKOUT_TEMPLATE_COLS}`,
    [
      id,
      tenantId,
      userId,
      patch.name ?? null,
      patch.description ?? null,
      patch.category ?? null,
      patch.targetIntensity ?? null,
      patch.estDurationMin ?? null,
      patch.tags ?? null,
      patch.metadata !== undefined ? JSON.stringify(patch.metadata) : null,
    ],
  );
  if (r.rowCount === 0) return null;
  const blocks = await listWorkoutTemplateBlocks(id);
  return rowToWorkoutTemplate(r.rows[0], blocks, blocks.length);
}

export async function deleteWorkoutTemplate(
  id: string,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const pool = getHealthPool();
  const r = await pool.query(
    `DELETE FROM agos_mh_workout_template
      WHERE id = $1 AND source = 'custom' AND tenant_id = $2 AND user_id = $3`,
    [id, tenantId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Copy a system template's header + blocks into a new ``source='custom'``
 * template owned by the user. Returns the new template id, or null when
 * the source template does not exist or is not a system template.
 */
export async function cloneSystemTemplate(
  systemTemplateId: string,
  tenantId: string,
  userId: string,
): Promise<WorkoutTemplate | null> {
  const pool = getHealthPool();
  const src = await pool.query(
    `SELECT ${WORKOUT_TEMPLATE_COLS}
       FROM agos_mh_workout_template
      WHERE id = $1 AND source = 'system'`,
    [systemTemplateId],
  );
  if (src.rowCount === 0) return null;
  const s = src.rows[0];
  const newId = randomUUID();
  await pool.query(
    `INSERT INTO agos_mh_workout_template (
        id, tenant_id, user_id, source, name, description, category,
        target_intensity, est_duration_min, tags, metadata)
     VALUES ($1,$2,$3,'custom',$4,$5,$6,$7,$8,$9,$10::jsonb)`,
    [
      newId,
      tenantId,
      userId,
      s.name, // user can rename after clone
      s.description,
      s.category,
      s.target_intensity,
      s.est_duration_min,
      s.tags ?? [],
      JSON.stringify(s.metadata ?? {}),
    ],
  );
  // Copy blocks preserving ordering.
  await pool.query(
    `INSERT INTO agos_mh_workout_template_block
        (template_id, position, kind, name, sets, reps,
         duration_sec, rest_sec, weight_hint, notes)
     SELECT $1, position, kind, name, sets, reps,
            duration_sec, rest_sec, weight_hint, notes
       FROM agos_mh_workout_template_block
      WHERE template_id = $2
      ORDER BY position`,
    [newId, systemTemplateId],
  );
  const fresh = await getWorkoutTemplate(newId, tenantId, userId);
  return fresh;
}

// ─── Workout template blocks ────────────────────────────────────────────────

async function listWorkoutTemplateBlocks(
  templateId: string,
): Promise<WorkoutTemplateBlock[]> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT ${WORKOUT_TEMPLATE_BLOCK_COLS}
       FROM agos_mh_workout_template_block
      WHERE template_id = $1
      ORDER BY position`,
    [templateId],
  );
  return r.rows.map(rowToWorkoutTemplateBlock);
}

export interface AddWorkoutTemplateBlockInput {
  kind?: WorkoutTemplateBlockKind;
  name: string;
  sets?: number | null;
  reps?: string | null;
  durationSec?: number | null;
  restSec?: number | null;
  weightHint?: string | null;
  notes?: string | null;
  position?: number;
}

export async function addTemplateBlock(
  templateId: string,
  tenantId: string,
  userId: string,
  input: AddWorkoutTemplateBlockInput,
): Promise<WorkoutTemplateBlock | null> {
  const pool = getHealthPool();
  // Ownership check — customs only.
  const owner = await pool.query(
    `SELECT 1 FROM agos_mh_workout_template
      WHERE id = $1 AND source = 'custom' AND tenant_id = $2 AND user_id = $3`,
    [templateId, tenantId, userId],
  );
  if (owner.rowCount === 0) return null;
  let position = input.position;
  if (position === undefined || position === null) {
    const tail = await pool.query(
      `SELECT COALESCE(MAX(position), -1) AS p
         FROM agos_mh_workout_template_block
        WHERE template_id = $1`,
      [templateId],
    );
    position = Number(tail.rows[0].p) + 1;
  }
  const id = randomUUID();
  const r = await pool.query(
    `INSERT INTO agos_mh_workout_template_block (
        id, template_id, position, kind, name, sets, reps,
        duration_sec, rest_sec, weight_hint, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING ${WORKOUT_TEMPLATE_BLOCK_COLS}`,
    [
      id,
      templateId,
      position,
      input.kind ?? 'exercise',
      input.name,
      input.sets ?? null,
      input.reps ?? null,
      input.durationSec ?? null,
      input.restSec ?? null,
      input.weightHint ?? null,
      input.notes ?? null,
    ],
  );
  return rowToWorkoutTemplateBlock(r.rows[0]);
}

export interface UpdateWorkoutTemplateBlockInput {
  kind?: WorkoutTemplateBlockKind;
  name?: string;
  sets?: number | null;
  reps?: string | null;
  durationSec?: number | null;
  restSec?: number | null;
  weightHint?: string | null;
  notes?: string | null;
  position?: number;
}

export async function updateTemplateBlock(
  blockId: string,
  templateId: string,
  tenantId: string,
  userId: string,
  patch: UpdateWorkoutTemplateBlockInput,
): Promise<WorkoutTemplateBlock | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `UPDATE agos_mh_workout_template_block b
        SET kind         = COALESCE($4, b.kind),
            name         = COALESCE($5, b.name),
            sets         = COALESCE($6, b.sets),
            reps         = COALESCE($7, b.reps),
            duration_sec = COALESCE($8, b.duration_sec),
            rest_sec     = COALESCE($9, b.rest_sec),
            weight_hint  = COALESCE($10, b.weight_hint),
            notes        = COALESCE($11, b.notes),
            position     = COALESCE($12, b.position)
      FROM agos_mh_workout_template t
     WHERE b.id = $1 AND b.template_id = $2 AND t.id = b.template_id
       AND t.source = 'custom' AND t.tenant_id = $3 AND t.user_id = $13
     RETURNING ${WORKOUT_TEMPLATE_BLOCK_COLS
       .split(',')
       .map((c) => 'b.' + c.trim())
       .join(', ')}`,
    [
      blockId,
      templateId,
      tenantId,
      patch.kind ?? null,
      patch.name ?? null,
      patch.sets ?? null,
      patch.reps ?? null,
      patch.durationSec ?? null,
      patch.restSec ?? null,
      patch.weightHint ?? null,
      patch.notes ?? null,
      patch.position ?? null,
      userId,
    ],
  );
  if (r.rowCount === 0) return null;
  return rowToWorkoutTemplateBlock(r.rows[0]);
}

export async function deleteTemplateBlock(
  blockId: string,
  templateId: string,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const pool = getHealthPool();
  const r = await pool.query(
    `DELETE FROM agos_mh_workout_template_block b
      USING agos_mh_workout_template t
     WHERE b.id = $1 AND b.template_id = $2 AND t.id = b.template_id
       AND t.source = 'custom' AND t.tenant_id = $3 AND t.user_id = $4`,
    [blockId, templateId, tenantId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function reorderTemplateBlocks(
  templateId: string,
  tenantId: string,
  userId: string,
  orderedIds: string[],
): Promise<boolean> {
  const pool = getHealthPool();
  const owner = await pool.query(
    `SELECT 1 FROM agos_mh_workout_template
      WHERE id = $1 AND source = 'custom' AND tenant_id = $2 AND user_id = $3`,
    [templateId, tenantId, userId],
  );
  if (owner.rowCount === 0) return false;
  await pool.query(
    `UPDATE agos_mh_workout_template_block
        SET position = position + 1000
      WHERE template_id = $1`,
    [templateId],
  );
  for (let i = 0; i < orderedIds.length; i++) {
    await pool.query(
      `UPDATE agos_mh_workout_template_block
          SET position = $3
        WHERE id = $1 AND template_id = $2`,
      [orderedIds[i], templateId, i],
    );
  }
  return true;
}

// ─── Activity plans (Phase 5c) ──────────────────────────────────────────────

export interface ActivityPlanSlot {
  id: string;
  planId: string;
  dayOfWeek: number;
  templateId: string | null;
  template?: WorkoutTemplate | null;
  freeformText: string | null;
  targetDurationMin: number | null;
  targetIntensity: ActivityIntensityValue | null;
  notes: string | null;
  position: number;
}

export interface ActivityPlan {
  id: string;
  tenantId: string;
  userId: string;
  weekStartDate: string;
  name: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  slots?: ActivityPlanSlot[];
}

const ACTIVITY_PLAN_COLS = `
  id, tenant_id, user_id, week_start_date, name, notes, created_at, updated_at
`;

const ACTIVITY_PLAN_SLOT_COLS = `
  id, plan_id, day_of_week, template_id, freeform_text,
  target_duration_min, target_intensity, notes, position
`;

function rowToActivityPlan(
  row: RawActivityPlanRow,
  slots?: ActivityPlanSlot[],
): ActivityPlan {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    weekStartDate:
      row.week_start_date instanceof Date
        ? row.week_start_date.toISOString().slice(0, 10)
        : String(row.week_start_date).slice(0, 10),
    name: row.name,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    slots,
  };
}

function rowToActivityPlanSlot(
  row: RawActivityPlanSlotRow,
  template?: WorkoutTemplate | null,
): ActivityPlanSlot {
  return {
    id: row.id,
    planId: row.plan_id,
    dayOfWeek: Number(row.day_of_week),
    templateId: row.template_id,
    template: template ?? null,
    freeformText: row.freeform_text,
    targetDurationMin:
      row.target_duration_min === null ? null : Number(row.target_duration_min),
    targetIntensity:
      row.target_intensity === null
        ? null
        : (row.target_intensity as ActivityIntensityValue),
    notes: row.notes,
    position: Number(row.position),
  };
}

export class ActivityPlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActivityPlanValidationError';
  }
}

export interface CreateActivityPlanInput {
  weekStartDate: string;
  name?: string | null;
  notes?: string | null;
}

export async function createActivityPlan(
  tenantId: string,
  userId: string,
  input: CreateActivityPlanInput,
): Promise<ActivityPlan> {
  const monday = mondayOf(input.weekStartDate);
  if (monday !== input.weekStartDate) {
    throw new ActivityPlanValidationError(
      `weekStartDate must be a Monday (got ${input.weekStartDate}, Monday is ${monday})`,
    );
  }
  const pool = getHealthPool();
  const id = randomUUID();
  const r = await pool.query(
    `INSERT INTO agos_mh_activity_plan
        (id, tenant_id, user_id, week_start_date, name, notes)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (tenant_id, user_id, week_start_date) DO UPDATE SET
        name       = COALESCE(EXCLUDED.name, agos_mh_activity_plan.name),
        notes      = COALESCE(EXCLUDED.notes, agos_mh_activity_plan.notes),
        updated_at = now()
     RETURNING ${ACTIVITY_PLAN_COLS}`,
    [id, tenantId, userId, input.weekStartDate, input.name ?? null, input.notes ?? null],
  );
  return rowToActivityPlan(r.rows[0], []);
}

export async function getActivityPlan(
  id: string,
  tenantId: string,
  userId: string,
): Promise<ActivityPlan | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT ${ACTIVITY_PLAN_COLS}
       FROM agos_mh_activity_plan
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [id, tenantId, userId],
  );
  if (r.rowCount === 0) return null;
  const slots = await listActivityPlanSlots(r.rows[0].id, tenantId);
  return rowToActivityPlan(r.rows[0], slots);
}

export interface ListActivityPlansInput {
  tenantId: string;
  userId: string;
  fromWeek?: string;
  toWeek?: string;
  limit?: number;
}

export async function listActivityPlans(
  input: ListActivityPlansInput,
): Promise<ActivityPlan[]> {
  const pool = getHealthPool();
  const limit = Math.min(Math.max(input.limit ?? 26, 1), 200);
  const params: unknown[] = [input.tenantId, input.userId];
  let where = `WHERE tenant_id = $1 AND user_id = $2`;
  if (input.fromWeek) {
    params.push(input.fromWeek);
    where += ` AND week_start_date >= $${params.length}`;
  }
  if (input.toWeek) {
    params.push(input.toWeek);
    where += ` AND week_start_date <= $${params.length}`;
  }
  params.push(limit);
  const r = await pool.query(
    `SELECT ${ACTIVITY_PLAN_COLS}
       FROM agos_mh_activity_plan
       ${where}
      ORDER BY week_start_date DESC
      LIMIT $${params.length}`,
    params,
  );
  return r.rows.map((row: RawActivityPlanRow) => rowToActivityPlan(row));
}

export async function getActivityPlanForWeek(
  tenantId: string,
  userId: string,
  weekStartDate: string,
): Promise<ActivityPlan | null> {
  const monday = mondayOf(weekStartDate);
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT ${ACTIVITY_PLAN_COLS}
       FROM agos_mh_activity_plan
      WHERE tenant_id = $1 AND user_id = $2 AND week_start_date = $3`,
    [tenantId, userId, monday],
  );
  if (r.rowCount === 0) return null;
  const slots = await listActivityPlanSlots(r.rows[0].id, tenantId);
  return rowToActivityPlan(r.rows[0], slots);
}

export interface UpdateActivityPlanInput {
  name?: string | null;
  notes?: string | null;
}

export async function updateActivityPlan(
  id: string,
  tenantId: string,
  userId: string,
  patch: UpdateActivityPlanInput,
): Promise<ActivityPlan | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `UPDATE agos_mh_activity_plan
        SET name       = COALESCE($4, name),
            notes      = COALESCE($5, notes),
            updated_at = now()
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3
      RETURNING ${ACTIVITY_PLAN_COLS}`,
    [id, tenantId, userId, patch.name ?? null, patch.notes ?? null],
  );
  if (r.rowCount === 0) return null;
  const slots = await listActivityPlanSlots(id, tenantId);
  return rowToActivityPlan(r.rows[0], slots);
}

export async function deleteActivityPlan(
  id: string,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const pool = getHealthPool();
  const r = await pool.query(
    `DELETE FROM agos_mh_activity_plan
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [id, tenantId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Activity plan slots ────────────────────────────────────────────────────

async function listActivityPlanSlots(
  planId: string,
  tenantId: string,
): Promise<ActivityPlanSlot[]> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT s.id, s.plan_id, s.day_of_week, s.template_id, s.freeform_text,
            s.target_duration_min, s.target_intensity, s.notes, s.position,
            t.id AS t_id, t.tenant_id AS t_tenant_id, t.user_id AS t_user_id,
            t.source AS t_source, t.name AS t_name, t.description AS t_description,
            t.category AS t_category, t.target_intensity AS t_target_intensity,
            t.est_duration_min AS t_est_duration_min, t.tags AS t_tags,
            t.metadata AS t_metadata, t.created_at AS t_created_at,
            t.updated_at AS t_updated_at
       FROM agos_mh_activity_plan_slot s
       JOIN agos_mh_activity_plan p ON p.id = s.plan_id
       LEFT JOIN agos_mh_workout_template t ON t.id = s.template_id
      WHERE s.plan_id = $1 AND p.tenant_id = $2
      ORDER BY s.day_of_week, s.position`,
    [planId, tenantId],
  );
  type RawActivityPlanSlotJoinedRow = RawActivityPlanSlotRow & {
    t_id: string | null;
    t_tenant_id: string | null;
    t_user_id: string | null;
    t_source: string | null;
    t_name: string | null;
    t_description: string | null;
    t_category: string | null;
    t_target_intensity: string | null;
    t_est_duration_min: number | string | null;
    t_tags: string[] | null;
    t_metadata: Record<string, unknown> | null;
    t_created_at: Date | null;
    t_updated_at: Date | null;
  };
  return r.rows.map((row: RawActivityPlanSlotJoinedRow) => {
    const template: WorkoutTemplate | null = row.t_id
      ? rowToWorkoutTemplate({
          id: row.t_id,
          tenant_id: row.t_tenant_id,
          user_id: row.t_user_id,
          source: row.t_source as string,
          name: row.t_name as string,
          description: row.t_description,
          category: row.t_category as string,
          target_intensity: row.t_target_intensity as string,
          est_duration_min: row.t_est_duration_min as number | string,
          tags: row.t_tags,
          metadata: row.t_metadata,
          created_at: row.t_created_at as Date,
          updated_at: row.t_updated_at as Date,
        })
      : null;
    return rowToActivityPlanSlot(row, template);
  });
}

export interface AddActivityPlanSlotInput {
  dayOfWeek: number;
  templateId?: string | null;
  freeformText?: string | null;
  targetDurationMin?: number | null;
  targetIntensity?: ActivityIntensityValue | null;
  notes?: string | null;
  position?: number;
}

export async function addActivityPlanSlot(
  planId: string,
  tenantId: string,
  userId: string,
  input: AddActivityPlanSlotInput,
): Promise<ActivityPlanSlot | null> {
  const pool = getHealthPool();
  const owner = await pool.query(
    `SELECT 1 FROM agos_mh_activity_plan
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [planId, tenantId, userId],
  );
  if (owner.rowCount === 0) return null;
  let position = input.position;
  if (position === undefined || position === null) {
    const tail = await pool.query(
      `SELECT COALESCE(MAX(position), -1) AS p
         FROM agos_mh_activity_plan_slot
        WHERE plan_id = $1 AND day_of_week = $2`,
      [planId, input.dayOfWeek],
    );
    position = Number(tail.rows[0].p) + 1;
  }
  const id = randomUUID();
  const r = await pool.query(
    `INSERT INTO agos_mh_activity_plan_slot (
        id, plan_id, day_of_week, template_id, freeform_text,
        target_duration_min, target_intensity, notes, position)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING ${ACTIVITY_PLAN_SLOT_COLS}`,
    [
      id,
      planId,
      input.dayOfWeek,
      input.templateId ?? null,
      input.freeformText ?? null,
      input.targetDurationMin ?? null,
      input.targetIntensity ?? null,
      input.notes ?? null,
      position,
    ],
  );
  const template = input.templateId
    ? await getWorkoutTemplate(input.templateId, tenantId, userId)
    : null;
  return rowToActivityPlanSlot(r.rows[0], template);
}

export interface UpdateActivityPlanSlotInput {
  dayOfWeek?: number;
  templateId?: string | null;
  freeformText?: string | null;
  targetDurationMin?: number | null;
  targetIntensity?: ActivityIntensityValue | null;
  notes?: string | null;
  position?: number;
}

export async function updateActivityPlanSlot(
  slotId: string,
  tenantId: string,
  userId: string,
  patch: UpdateActivityPlanSlotInput,
): Promise<ActivityPlanSlot | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `UPDATE agos_mh_activity_plan_slot s
        SET day_of_week         = COALESCE($3, s.day_of_week),
            template_id         = COALESCE($4, s.template_id),
            freeform_text       = COALESCE($5, s.freeform_text),
            target_duration_min = COALESCE($6, s.target_duration_min),
            target_intensity    = COALESCE($7, s.target_intensity),
            notes               = COALESCE($8, s.notes),
            position            = COALESCE($9, s.position)
      FROM agos_mh_activity_plan p
     WHERE s.id = $1 AND p.id = s.plan_id
       AND p.tenant_id = $2 AND p.user_id = $10
     RETURNING ${ACTIVITY_PLAN_SLOT_COLS
       .split(',')
       .map((c) => 's.' + c.trim())
       .join(', ')}`,
    [
      slotId,
      tenantId,
      patch.dayOfWeek ?? null,
      patch.templateId ?? null,
      patch.freeformText ?? null,
      patch.targetDurationMin ?? null,
      patch.targetIntensity ?? null,
      patch.notes ?? null,
      patch.position ?? null,
      userId,
    ],
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0];
  const template = row.template_id
    ? await getWorkoutTemplate(row.template_id, tenantId, userId)
    : null;
  return rowToActivityPlanSlot(row, template);
}

export async function deleteActivityPlanSlot(
  slotId: string,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const pool = getHealthPool();
  const r = await pool.query(
    `DELETE FROM agos_mh_activity_plan_slot s
      USING agos_mh_activity_plan p
     WHERE s.id = $1 AND p.id = s.plan_id
       AND p.tenant_id = $2 AND p.user_id = $3`,
    [slotId, tenantId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function moveActivityPlanSlot(
  slotId: string,
  tenantId: string,
  userId: string,
  dayOfWeek: number,
  position: number,
): Promise<ActivityPlanSlot | null> {
  return updateActivityPlanSlot(slotId, tenantId, userId, {
    dayOfWeek,
    position,
  });
}

/**
 * Turn a planned activity slot into an actual ``agos_mh_activity_entry``
 * for the given date. If the slot has a workout template, derive
 * activity_type from the template's category, duration from the slot's
 * target_duration_min (falling back to template.est_duration_min), and
 * intensity from slot.target_intensity (falling back to template.target_intensity).
 * Freeform-only slots use freeform_text as activity_type.
 */
export async function addActivityPlanSlotToActivityLog(
  slotId: string,
  tenantId: string,
  userId: string,
  entryDate: string,
): Promise<ActivityEntry | null> {
  const pool = getHealthPool();
  const r = await pool.query(
    `SELECT s.template_id, s.freeform_text, s.target_duration_min,
            s.target_intensity, s.notes,
            t.name AS t_name, t.category AS t_category,
            t.target_intensity AS t_target_intensity,
            t.est_duration_min AS t_est_duration_min
       FROM agos_mh_activity_plan_slot s
       JOIN agos_mh_activity_plan p ON p.id = s.plan_id
       LEFT JOIN agos_mh_workout_template t ON t.id = s.template_id
      WHERE s.id = $1 AND p.tenant_id = $2 AND p.user_id = $3`,
    [slotId, tenantId, userId],
  );
  if (r.rowCount === 0) return null;
  const slot = r.rows[0];

  const activityType: string =
    slot.template_id !== null
      ? String(slot.t_category ?? slot.t_name ?? 'workout')
      : String(slot.freeform_text ?? 'activity').trim() || 'activity';
  const durationMin = Number(
    slot.target_duration_min ?? slot.t_est_duration_min ?? 30,
  );
  const intensity: ActivityIntensityValue =
    (slot.target_intensity as ActivityIntensityValue | null) ??
    (slot.t_target_intensity as ActivityIntensityValue | null) ??
    'moderate';

  return createActivityEntry(tenantId, userId, {
    entryDate,
    activityType,
    durationMin,
    intensity,
    notes: slot.notes,
    metadata: {
      source: 'activity_plan_slot',
      slot_id: slotId,
      template_id: slot.template_id,
    },
  });
}

// ─── Activity suggestion data (Phase 5c) ────────────────────────────────────

/**
 * Pull the data shape the suggestion helper consumes, derived from the
 * last 7 days of mood entries + the most recent screener of each kind.
 * Pure DB reads; the rules engine lives in ``activity-suggestions.ts``.
 */
export async function getActivitySuggestionInputs(userId: string): Promise<{
  recentMoodAvg: number | null;
  recentAnxietyAvg: number | null;
  recentSleepAvg: number | null;
  lastPhq9: number | null;
  lastGad7: number | null;
  lastPss10: number | null;
}> {
  const pool = getHealthPool();
  const moodRes = await pool.query(
    `SELECT
        AVG(mood_score)::float    AS mood,
        AVG(anxiety_score)::float AS anxiety,
        AVG(CASE sleep_quality
              WHEN 'poor' THEN 1
              WHEN 'fair' THEN 2
              WHEN 'good' THEN 3
              WHEN 'excellent' THEN 4
              ELSE NULL
            END)::float AS sleep
       FROM agos_mh_mood_entry
      WHERE user_id = $1 AND entry_at >= now() - INTERVAL '7 days'`,
    [userId],
  );
  const moodRow = moodRes.rows[0] ?? {};

  // Most recent screener of each kind. Three round-trips kept simple
  // since per-user screener tables are tiny and indexed.
  const phqRes = await pool.query(
    `SELECT score FROM agos_health_screeners
      WHERE user_id = $1 AND screener = 'phq9'
      ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  const gadRes = await pool.query(
    `SELECT score FROM agos_health_screeners
      WHERE user_id = $1 AND screener = 'gad7'
      ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  const pssRes = await pool.query(
    `SELECT score FROM agos_health_screeners
      WHERE user_id = $1 AND screener = 'pss'
      ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );

  return {
    recentMoodAvg: moodRow.mood === null || moodRow.mood === undefined
      ? null
      : Number(moodRow.mood),
    recentAnxietyAvg:
      moodRow.anxiety === null || moodRow.anxiety === undefined
        ? null
        : Number(moodRow.anxiety),
    recentSleepAvg:
      moodRow.sleep === null || moodRow.sleep === undefined
        ? null
        : Number(moodRow.sleep),
    lastPhq9: phqRes.rowCount && phqRes.rowCount > 0
      ? Number(phqRes.rows[0].score)
      : null,
    lastGad7: gadRes.rowCount && gadRes.rowCount > 0
      ? Number(gadRes.rows[0].score)
      : null,
    lastPss10: pssRes.rowCount && pssRes.rowCount > 0
      ? Number(pssRes.rows[0].score)
      : null,
  };
}

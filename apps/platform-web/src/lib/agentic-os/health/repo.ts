import 'server-only';
import { randomUUID } from 'node:crypto';
import { getHealthPool } from './session';
import type { ScreenerKey, Severity } from './screeners';

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
  return r.rows.map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    screener: row.screener as ScreenerKey,
    answers: row.answers ?? [],
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

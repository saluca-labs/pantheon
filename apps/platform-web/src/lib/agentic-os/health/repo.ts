import 'server-only';
import { randomUUID } from 'node:crypto';
import { getHealthPool } from './session';
import type { ScreenerKey, Severity } from './screeners';
import type {
  ConsentScope,
  MentalProfileInput,
} from './schemas';
import type { RiskFlagInput, RiskFlagSeverity } from '../_shared/types';

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

function rowToMentalProfile(row: any): MentalProfile {
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

function rowToConsent(row: any): ConsentRow {
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

function rowToRiskFlag(row: any): RiskFlagRow {
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

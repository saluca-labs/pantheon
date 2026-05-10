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

function rowToMoodEntry(row: any): MoodEntry {
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
  const params: any[] = [userId];
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

function rowToMoodTag(row: any): MoodTag {
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
  const ownedIds: string[] = owned.rows.map((row: any) => row.id);
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

function rowToJournalPrompt(row: any): JournalPrompt {
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
  const params: any[] = [];
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

function rowToJournalEntry(row: any): JournalEntry {
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
  const params: any[] = [userId];
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
  return r.rows.map((row: any) => {
    const entry = rowToJournalEntry(row);
    if (opts.withPrompt && row.prompt_id) {
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

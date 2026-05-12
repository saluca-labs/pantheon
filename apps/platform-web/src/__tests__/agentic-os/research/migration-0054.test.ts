/**
 * Research OS Phase 7 — migration 0054 smoke test.
 *
 * Asserts structural properties on the SQL text directly; doesn't run
 * Alembic in vitest. Mirrors the migration-0053 test shape with the
 * Phase 7 schema added.
 *
 * Covers:
 *   - Revision id + down_revision pinning (catches a copy-paste of the
 *     stale plan-doc 0047 anchor / 0046 down_revision).
 *   - agos_research_coach_sessions table shape (PK, NOT NULL, default
 *     expressions, mode CHECK).
 *   - experiment_id is NOT a FK (per the v0.1.30 platform contract).
 *   - 3 expected indexes with the correct WHERE clauses.
 *   - No FK rebind (Research doesn't have an analogous cross-table seam
 *     like Autobiographer's chapter_revisions.coach_session_id).
 *   - DOWNGRADE drops indexes in reverse order then the table.
 *   - Idempotent DDL throughout.
 *   - Zero `:<word>` bind-marker patterns in raw SQL bodies (footgun).
 *   - op.execute uses string constants (not text(...)).
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../../../packages/database/alembic/versions/0054_research_phase7.py',
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('migration 0054_research_phase7', () => {
  it('declares the correct revision identifier', () => {
    expect(sql).toMatch(/revision: str = "0054_research_phase7"/);
  });

  it('declares the correct down_revision (post-Phase-6 chain)', () => {
    expect(sql).toMatch(
      /down_revision: Union\[str, None\] = "0053_research_phase6"/,
    );
  });

  it('does NOT chain off the stale plan-doc revisions', () => {
    expect(sql).not.toMatch(/down_revision[^"]*"0046_research_phase6"/);
    expect(sql).not.toMatch(/revision: str = "0047_research_phase7"/);
  });

  // ─── New coach_sessions table ──────────────────────────────────────────

  it('creates agos_research_coach_sessions with IF NOT EXISTS', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_research_coach_sessions\s*\(/,
    );
  });

  it('declares the expected columns', () => {
    for (const col of [
      'id ',
      'user_id ',
      'experiment_id ',
      'mode ',
      'title ',
      'messages ',
      'metadata ',
      'created_at ',
      'updated_at ',
    ]) {
      expect(sql).toContain(col);
    }
  });

  it('id is the UUID primary key', () => {
    expect(sql).toMatch(/id\s+UUID\s+PRIMARY KEY/);
  });

  it('user_id is NOT NULL', () => {
    expect(sql).toMatch(/user_id\s+UUID\s+NOT NULL/);
  });

  it('experiment_id is nullable (per v0.1.30 contract — no FK)', () => {
    expect(sql).toMatch(/experiment_id\s+UUID\s+NULL[,\s]/);
    const line = sql.match(/experiment_id[^,]*,/);
    expect(line).toBeTruthy();
    expect(line![0]).not.toMatch(/REFERENCES/i);
  });

  it('mode CHECK constraint declares the 4 locked modes', () => {
    expect(sql).toMatch(/CONSTRAINT agos_research_coach_sessions_mode_chk/);
    expect(sql).toMatch(/CHECK \(mode IN \([^)]*'lit_reviewer'/);
    expect(sql).toMatch(/'hypothesis_critic'/);
    expect(sql).toMatch(/'methods_advisor'/);
    expect(sql).toMatch(/'general'/);
  });

  it('mode CHECK does NOT include any leftover Autobiographer mode values', () => {
    const chk = sql.match(/CHECK \(mode IN \([^)]+\)/);
    expect(chk).toBeTruthy();
    const inner = chk![0];
    for (const stray of [
      'interviewer',
      'chapter_drafter',
      'narrative_critic',
      'procurement_advisor',
      'build_planner',
      'shop_safety',
    ]) {
      expect(inner).not.toContain(`'${stray}'`);
    }
  });

  it('messages defaults to empty JSONB array', () => {
    expect(sql).toMatch(/messages\s+JSONB\s+NOT NULL DEFAULT '\[\]'::jsonb/);
  });

  it('metadata defaults to empty JSONB object', () => {
    expect(sql).toMatch(/metadata\s+JSONB\s+NOT NULL DEFAULT '\{\}'::jsonb/);
  });

  it('created_at defaults to now()', () => {
    expect(sql).toMatch(/created_at\s+TIMESTAMPTZ\s+NOT NULL DEFAULT now\(\)/);
  });

  it('updated_at defaults to now()', () => {
    expect(sql).toMatch(/updated_at\s+TIMESTAMPTZ\s+NOT NULL DEFAULT now\(\)/);
  });

  // ─── Indexes ───────────────────────────────────────────────────────────

  it('creates the recent-sessions index (user_id, updated_at DESC)', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_coach_sessions_user_updated_idx[\s\S]+\(user_id, updated_at DESC\)/,
    );
  });

  it('creates the per-experiment partial index', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_coach_sessions_experiment_updated_idx[\s\S]+\(experiment_id, updated_at DESC\)[\s\S]+WHERE experiment_id IS NOT NULL/,
    );
  });

  it('creates the mode-filtered list index (user_id, mode, updated_at DESC)', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_coach_sessions_user_mode_updated_idx[\s\S]+\(user_id, mode, updated_at DESC\)/,
    );
  });

  // ─── No FK rebind ──────────────────────────────────────────────────────

  it('does NOT add an FK on experiment_id', () => {
    expect(sql).not.toMatch(
      /agos_research_coach_sessions[\s\S]*FOREIGN KEY.*experiment_id/i,
    );
  });

  it('does NOT add an FK rebind on any existing research table', () => {
    // Autobiographer P7 rebinds chapter_revisions.coach_session_id; Research P7
    // has no analogous seam, so there should be ZERO ADD CONSTRAINT lines in
    // the upgrade.
    expect(sql).not.toMatch(/ADD CONSTRAINT[\s\S]+FOREIGN KEY/i);
  });

  // ─── DOWNGRADE ─────────────────────────────────────────────────────────

  it('downgrade drops indexes in reverse-create order before dropping the table', () => {
    const idxOrder = [
      'agos_research_coach_sessions_user_mode_updated_idx',
      'agos_research_coach_sessions_experiment_updated_idx',
      'agos_research_coach_sessions_user_updated_idx',
    ];
    let lastIdx = -1;
    for (const name of idxOrder) {
      const pos = sql.indexOf(`DROP INDEX IF EXISTS ${name}`);
      expect(pos).toBeGreaterThan(lastIdx);
      lastIdx = pos;
    }
    expect(sql).toMatch(/DROP TABLE IF EXISTS agos_research_coach_sessions/);
    expect(
      sql.indexOf('DROP TABLE IF EXISTS agos_research_coach_sessions'),
    ).toBeGreaterThan(lastIdx);
  });

  it('downgrade does NOT drop a coach_session_id column (none ever added)', () => {
    expect(sql).not.toMatch(/DROP COLUMN[^a-z]+coach_session_id/i);
  });

  // ─── Safety / hygiene ─────────────────────────────────────────────────

  it('uses op.execute() with plain string constants (no text() bind-marker risk)', () => {
    expect(sql).toMatch(/op\.execute\(_UPGRADE_SQL\)/);
    expect(sql).toMatch(/op\.execute\(_DOWNGRADE_SQL\)/);
    expect(sql).not.toMatch(/text\(/);
  });

  it('upgrade SQL contains no `:[A-Za-z]` bind-marker patterns', () => {
    // Inline-bind-marker footgun from prior phases — verify none are present.
    // The negative lookbehind excludes Postgres `::cast` syntax which is
    // double-colon, not a SQLAlchemy bind marker.
    const upgrade = sql.split('_UPGRADE_SQL = r"""')[1]?.split('"""')[0] ?? '';
    expect(upgrade.match(/(?<![:'a-zA-Z]):[A-Za-z][A-Za-z0-9_]*/)).toBeNull();
  });

  it('downgrade SQL contains no `:[A-Za-z]` bind-marker patterns', () => {
    const downgrade =
      sql.split('_DOWNGRADE_SQL = r"""')[1]?.split('"""')[0] ?? '';
    expect(downgrade.match(/(?<![:'a-zA-Z]):[A-Za-z][A-Za-z0-9_]*/)).toBeNull();
  });

  it('all CREATE INDEX statements use IF NOT EXISTS', () => {
    const idxLines = sql.match(/CREATE INDEX[^;]*;/g) ?? [];
    expect(idxLines.length).toBeGreaterThan(0);
    for (const line of idxLines) {
      expect(line).toMatch(/IF NOT EXISTS/i);
    }
  });
});

/**
 * Autobiographer OS — migration 0048 smoke test.
 *
 * Asserts structural properties on the SQL text directly; doesn't run
 * Alembic in vitest. Mirrors the migration-0047 test shape with the
 * Phase 7 schema added.
 *
 * Covers:
 *   - Revision id + down_revision pinning.
 *   - agos_autobiographer_coach_sessions table shape (PK, NOT NULL,
 *     default expressions, mode CHECK).
 *   - book_id is NOT a FK (per the v0.1.30 platform contract).
 *   - 3 expected indexes with the correct WHERE clauses.
 *   - The FK rebind on chapter_revisions.coach_session_id is wrapped
 *     in a DO-block guard (so the migration is idempotent — Postgres
 *     has no ADD CONSTRAINT IF NOT EXISTS).
 *   - DOWNGRADE drops the FK constraint and the table; chapter_revisions
 *     column survives the down with no FK (idempotent).
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../../../packages/database/alembic/versions/0048_autobiographer_phase7.py',
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('migration 0048_autobiographer_phase7', () => {
  it('declares the correct revision + down_revision', () => {
    expect(sql).toMatch(/revision: str = "0048_autobiographer_phase7"/);
    expect(sql).toMatch(
      /down_revision: Union\[str, None\] = "0047_autobiographer_phase6"/,
    );
  });

  // ─── New coach_sessions table ──────────────────────────────────────────

  it('creates agos_autobiographer_coach_sessions with IF NOT EXISTS', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_autobiographer_coach_sessions\s*\(/,
    );
  });

  it('declares the expected columns', () => {
    for (const col of [
      'id ',
      'user_id ',
      'book_id ',
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

  it('book_id is nullable (per v0.1.30 contract — no FK)', () => {
    expect(sql).toMatch(/book_id\s+UUID\s+NULL[,\s]/);
    // Ensure book_id does NOT have a REFERENCES clause.
    const bookIdLine = sql.match(/book_id[^,]*,/);
    expect(bookIdLine).toBeTruthy();
    expect(bookIdLine![0]).not.toMatch(/REFERENCES/i);
  });

  it('mode CHECK constraint declares the 4 locked modes', () => {
    expect(sql).toMatch(/CONSTRAINT agos_autobiographer_coach_sessions_mode_chk/);
    expect(sql).toMatch(/CHECK \(mode IN \([^)]*'interviewer'/);
    expect(sql).toMatch(/'chapter_drafter'/);
    expect(sql).toMatch(/'narrative_critic'/);
    expect(sql).toMatch(/'general'/);
  });

  it('messages defaults to empty JSONB array', () => {
    expect(sql).toMatch(/messages\s+JSONB\s+NOT NULL DEFAULT '\[\]'::jsonb/);
  });

  it('metadata defaults to empty JSONB object', () => {
    expect(sql).toMatch(/metadata\s+JSONB\s+NOT NULL DEFAULT '\{\}'::jsonb/);
  });

  // ─── Indexes ───────────────────────────────────────────────────────────

  it('creates the recent-sessions index (user_id, updated_at DESC)', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_autobiographer_coach_sessions_user_updated_idx[\s\S]+\(user_id, updated_at DESC\)/,
    );
  });

  it('creates the per-book partial index', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_autobiographer_coach_sessions_book_updated_idx[\s\S]+\(book_id, updated_at DESC\)[\s\S]+WHERE book_id IS NOT NULL/,
    );
  });

  it('creates the mode-filtered list index (user_id, mode, updated_at DESC)', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_autobiographer_coach_sessions_user_mode_updated_idx[\s\S]+\(user_id, mode, updated_at DESC\)/,
    );
  });

  // ─── FK rebind on chapter_revisions.coach_session_id ───────────────────

  it('rebinds chapter_revisions.coach_session_id FK with ON DELETE SET NULL', () => {
    expect(sql).toMatch(
      /ADD CONSTRAINT agos_autobiographer_chapter_revisions_coach_session_fk[\s\S]+REFERENCES agos_autobiographer_coach_sessions\(id\)[\s\S]+ON DELETE SET NULL/,
    );
  });

  it('FK add is wrapped in a DO-block guard (idempotent re-run)', () => {
    expect(sql).toMatch(/DO \$\$\s+BEGIN\s+IF NOT EXISTS \(/);
    expect(sql).toMatch(/FROM pg_constraint/);
    expect(sql).toMatch(/conname = 'agos_autobiographer_chapter_revisions_coach_session_fk'/);
  });

  // ─── DOWNGRADE ─────────────────────────────────────────────────────────

  it('downgrade drops the FK constraint first', () => {
    expect(sql).toMatch(
      /ALTER TABLE agos_autobiographer_chapter_revisions\s+DROP CONSTRAINT IF EXISTS agos_autobiographer_chapter_revisions_coach_session_fk/,
    );
  });

  it('downgrade drops indexes in reverse-create order before dropping the table', () => {
    const idxOrder = [
      'agos_autobiographer_coach_sessions_user_mode_updated_idx',
      'agos_autobiographer_coach_sessions_book_updated_idx',
      'agos_autobiographer_coach_sessions_user_updated_idx',
    ];
    let lastIdx = -1;
    for (const name of idxOrder) {
      const pos = sql.indexOf(`DROP INDEX IF EXISTS ${name}`);
      expect(pos).toBeGreaterThan(lastIdx);
      lastIdx = pos;
    }
    expect(sql).toMatch(/DROP TABLE IF EXISTS agos_autobiographer_coach_sessions/);
    expect(sql.indexOf('DROP TABLE IF EXISTS agos_autobiographer_coach_sessions')).toBeGreaterThan(
      lastIdx,
    );
  });

  it('downgrade does NOT drop the coach_session_id column (Phase 4 owns it)', () => {
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
    // The negative lookbehind excludes Postgres `::cast` syntax (`::jsonb`,
    // `::uuid`) which is double-colon, not a SQLAlchemy bind marker.
    const upgrade = sql.split('_UPGRADE_SQL = r"""')[1]?.split('"""')[0] ?? '';
    expect(upgrade.match(/(?<![:'a-zA-Z]):[A-Za-z][A-Za-z0-9_]*/)).toBeNull();
  });
});

/**
 * Autobiographer OS — migration 0043 smoke test.
 *
 * Reads the SQL text directly and asserts structural properties (we
 * don't run alembic in vitest). Matches the lightweight pattern used by
 * the Phase 1 migration test.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../../../packages/database/alembic/versions/0043_autobiographer_phase2.py',
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('migration 0043_autobiographer_phase2', () => {
  it('declares the correct revision + down_revision', () => {
    expect(sql).toMatch(/revision: str = "0043_autobiographer_phase2"/);
    expect(sql).toMatch(
      /down_revision: Union\[str, None\] = "0042_autobiographer_phase1"/,
    );
  });

  // ─── People table ────────────────────────────────────────────────────────

  it('creates agos_autobiographer_people with IF NOT EXISTS', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_autobiographer_people/,
    );
  });

  it('people table has the locked column set', () => {
    for (const col of [
      'id ',
      'user_id ',
      'canonical_name ',
      'aliases ',
      'relation ',
      'birth_year ',
      'death_year ',
      'consent_to_publish ',
      'consent_recorded_at ',
      'consent_recorded_by ',
      'notes ',
      'image_url ',
      'metadata ',
      'created_at ',
      'updated_at ',
    ]) {
      expect(sql).toContain(col);
    }
  });

  it('consent_to_publish defaults to pending + CHECK lists all 6 values', () => {
    expect(sql).toMatch(
      /consent_to_publish\s+TEXT\s+NOT NULL DEFAULT 'pending'/,
    );
    expect(sql).toMatch(/agos_autobiographer_people_consent_chk/);
    for (const v of [
      'granted',
      'pending',
      'withheld',
      'deceased',
      'public_figure',
      'not_applicable',
    ]) {
      expect(sql).toMatch(new RegExp(`'${v}'`));
    }
  });

  it('aliases defaults to empty TEXT[]', () => {
    expect(sql).toMatch(/aliases\s+TEXT\[\]\s+NOT NULL DEFAULT ARRAY\[\]::TEXT\[\]/);
  });

  it('functional UNIQUE on (user_id, lower(canonical_name)) is present', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_people_user_name_uq[\s\S]+user_id,\s*lower\(canonical_name\)/,
    );
  });

  it('composite index (user_id, consent_to_publish) is present', () => {
    expect(sql).toMatch(
      /agos_autobiographer_people_user_consent_idx[\s\S]+user_id,\s*consent_to_publish/,
    );
  });

  it('GIN index on aliases is present', () => {
    expect(sql).toMatch(
      /agos_autobiographer_people_aliases_gin_idx[\s\S]+USING GIN \(aliases\)/,
    );
  });

  it('image_url + aliases + consent_recorded_by carry column comments', () => {
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_autobiographer_people\.image_url/,
    );
    expect(sql).toMatch(/MCP-mediated storage transfer/);
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_autobiographer_people\.aliases/,
    );
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_autobiographer_people\.consent_recorded_by/,
    );
  });

  // ─── Memory_people join table ────────────────────────────────────────────

  it('creates agos_autobiographer_memory_people with IF NOT EXISTS', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_autobiographer_memory_people/,
    );
  });

  it('memory_people uses composite PK (memory_id, person_id)', () => {
    expect(sql).toMatch(/PRIMARY KEY \(memory_id, person_id\)/);
  });

  it('memory_id FK CASCADES on memory delete', () => {
    expect(sql).toMatch(
      /memory_id[\s\S]+REFERENCES agos_autobiographer_memories\(id\)[\s\S]+ON DELETE CASCADE/,
    );
  });

  it('person_id FK CASCADES on person delete', () => {
    expect(sql).toMatch(
      /person_id[\s\S]+REFERENCES agos_autobiographer_people\(id\)[\s\S]+ON DELETE CASCADE/,
    );
  });

  it('memory_people has an index on (person_id) for the reverse lookup', () => {
    expect(sql).toMatch(
      /agos_autobiographer_memory_people_person_idx[\s\S]+\(person_id\)/,
    );
  });

  it('memory_people.role + notes are TEXT NULL columns (free-form)', () => {
    expect(sql).toMatch(/role\s+TEXT\s+NULL/);
    expect(sql).toMatch(/notes\s+TEXT\s+NULL/);
  });

  // ─── Downgrade ───────────────────────────────────────────────────────────

  it('downgrade drops the join table BEFORE the people table', () => {
    const memPeopleDropIdx = sql.indexOf(
      'DROP TABLE IF EXISTS agos_autobiographer_memory_people',
    );
    const peopleDropIdx = sql.indexOf(
      'DROP TABLE IF EXISTS agos_autobiographer_people',
    );
    expect(memPeopleDropIdx).toBeGreaterThan(-1);
    expect(peopleDropIdx).toBeGreaterThan(-1);
    expect(memPeopleDropIdx).toBeLessThan(peopleDropIdx);
  });

  it('downgrade drops every named index IF EXISTS', () => {
    for (const idx of [
      'agos_autobiographer_memory_people_person_idx',
      'agos_autobiographer_people_aliases_gin_idx',
      'agos_autobiographer_people_user_consent_idx',
      'agos_autobiographer_people_user_name_uq',
    ]) {
      expect(sql).toMatch(new RegExp(`DROP INDEX IF EXISTS ${idx}`));
    }
  });

  // ─── Idempotency markers ────────────────────────────────────────────────

  it('every CREATE TABLE uses IF NOT EXISTS', () => {
    const sqlOnly = sql.split('_UPGRADE_SQL =')[1] ?? '';
    expect(sqlOnly.match(/CREATE TABLE\s+(?!IF NOT EXISTS)/g)).toBeNull();
  });

  it('every CREATE INDEX / CREATE UNIQUE INDEX uses IF NOT EXISTS', () => {
    const sqlOnly = sql.split('_UPGRADE_SQL =')[1] ?? '';
    expect(sqlOnly.match(/CREATE INDEX\s+(?!IF NOT EXISTS)/g)).toBeNull();
    expect(
      sqlOnly.match(/CREATE UNIQUE INDEX\s+(?!IF NOT EXISTS)/g),
    ).toBeNull();
  });

  // ─── Doesn't touch Phase 1 tables ────────────────────────────────────────

  it('does NOT drop or rename Phase 1 tables', () => {
    expect(sql).not.toMatch(/DROP TABLE[\s\S]+agos_autobiographer_books/);
    expect(sql).not.toMatch(/DROP TABLE[\s\S]+agos_autobiographer_memories/);
  });
});

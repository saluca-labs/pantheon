/**
 * Autobiographer OS — migration 0044 smoke test.
 *
 * Reads the SQL text directly and asserts structural properties (we don't
 * run alembic in vitest). Pattern mirrors the Phase 1 + Phase 2 migration
 * tests.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../../../packages/database/alembic/versions/0044_autobiographer_phase3.py',
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('migration 0044_autobiographer_phase3', () => {
  it('declares the correct revision + down_revision', () => {
    expect(sql).toMatch(/revision: str = "0044_autobiographer_phase3"/);
    expect(sql).toMatch(
      /down_revision: Union\[str, None\] = "0043_autobiographer_phase2"/,
    );
  });

  // ─── voice_samples ───────────────────────────────────────────────────────

  it('creates agos_autobiographer_voice_samples with IF NOT EXISTS', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_autobiographer_voice_samples/,
    );
  });

  it('voice_samples has the locked column set', () => {
    for (const col of [
      'id ',
      'user_id ',
      'memory_id ',
      'title ',
      'body_text ',
      'word_count ',
      'is_archived ',
      'metadata ',
      'created_at ',
      'updated_at ',
    ]) {
      expect(sql).toContain(col);
    }
  });

  it('memory_id is nullable + FK to agos_autobiographer_memories CASCADE', () => {
    expect(sql).toMatch(
      /memory_id\s+UUID\s+NULL[\s\S]+REFERENCES agos_autobiographer_memories\(id\)[\s\S]+ON DELETE CASCADE/,
    );
  });

  it('body_text + word_count are NOT NULL', () => {
    expect(sql).toMatch(/body_text\s+TEXT\s+NOT NULL/);
    expect(sql).toMatch(/word_count\s+INT\s+NOT NULL/);
  });

  it('is_archived defaults to false', () => {
    expect(sql).toMatch(
      /is_archived\s+BOOLEAN\s+NOT NULL DEFAULT false/,
    );
  });

  it('composite index (user_id, updated_at DESC) is present', () => {
    expect(sql).toMatch(
      /agos_autobiographer_voice_samples_user_updated_idx[\s\S]+user_id,\s*updated_at DESC/,
    );
  });

  it('partial index on (memory_id) WHERE memory_id IS NOT NULL is present', () => {
    expect(sql).toMatch(
      /agos_autobiographer_voice_samples_memory_idx[\s\S]+\(memory_id\)[\s\S]+WHERE memory_id IS NOT NULL/,
    );
  });

  it('memory_id + is_archived + word_count carry column comments', () => {
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_autobiographer_voice_samples\.memory_id/,
    );
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_autobiographer_voice_samples\.is_archived/,
    );
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_autobiographer_voice_samples\.word_count/,
    );
  });

  // ─── voice_profiles ──────────────────────────────────────────────────────

  it('creates agos_autobiographer_voice_profiles with IF NOT EXISTS', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_autobiographer_voice_profiles/,
    );
  });

  it('voice_profiles has the locked column set', () => {
    for (const col of [
      'id ',
      'user_id ',
      'version ',
      'is_active ',
      'style_summary ',
      'style_adjectives ',
      'style_rules ',
      'example_openings ',
      'sample_count ',
      'sample_word_count ',
      'built_at ',
      'builder ',
      'metadata ',
    ]) {
      expect(sql).toContain(col);
    }
  });

  it('version + sample_count + sample_word_count + style_summary are NOT NULL', () => {
    expect(sql).toMatch(/version\s+INT\s+NOT NULL/);
    expect(sql).toMatch(/sample_count\s+INT\s+NOT NULL/);
    expect(sql).toMatch(/sample_word_count\s+INT\s+NOT NULL/);
    expect(sql).toMatch(/style_summary\s+TEXT\s+NOT NULL/);
  });

  it('style_adjectives defaults to empty TEXT[]', () => {
    expect(sql).toMatch(
      /style_adjectives\s+TEXT\[\]\s+NOT NULL DEFAULT ARRAY\[\]::TEXT\[\]/,
    );
  });

  it('style_rules + example_openings default to empty JSONB array', () => {
    expect(sql).toMatch(/style_rules\s+JSONB\s+NOT NULL DEFAULT '\[\]'::jsonb/);
    expect(sql).toMatch(
      /example_openings\s+JSONB\s+NOT NULL DEFAULT '\[\]'::jsonb/,
    );
  });

  it("builder defaults to 'coach'", () => {
    expect(sql).toMatch(/builder\s+TEXT\s+NOT NULL DEFAULT 'coach'/);
  });

  it('is_active defaults to false', () => {
    expect(sql).toMatch(/is_active\s+BOOLEAN\s+NOT NULL DEFAULT false/);
  });

  it('partial UNIQUE on (user_id) WHERE is_active = true enforces single-active', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_voice_profiles_active_uq[\s\S]+\(user_id\)[\s\S]+WHERE is_active = true/,
    );
  });

  it('composite index (user_id, version DESC) is present', () => {
    expect(sql).toMatch(
      /agos_autobiographer_voice_profiles_user_version_idx[\s\S]+user_id,\s*version DESC/,
    );
  });

  it('style_summary + style_rules + example_openings + builder carry column comments', () => {
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_autobiographer_voice_profiles\.style_summary/,
    );
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_autobiographer_voice_profiles\.style_rules/,
    );
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_autobiographer_voice_profiles\.example_openings/,
    );
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_autobiographer_voice_profiles\.builder/,
    );
  });

  // ─── Downgrade ───────────────────────────────────────────────────────────

  it('downgrade drops profiles BEFORE samples (samples is FK target)', () => {
    const profilesDropIdx = sql.indexOf(
      'DROP TABLE IF EXISTS agos_autobiographer_voice_profiles',
    );
    const samplesDropIdx = sql.indexOf(
      'DROP TABLE IF EXISTS agos_autobiographer_voice_samples',
    );
    expect(profilesDropIdx).toBeGreaterThan(-1);
    expect(samplesDropIdx).toBeGreaterThan(-1);
    expect(profilesDropIdx).toBeLessThan(samplesDropIdx);
  });

  it('downgrade drops every named index IF EXISTS', () => {
    for (const idx of [
      'agos_autobiographer_voice_profiles_user_version_idx',
      'agos_autobiographer_voice_profiles_active_uq',
      'agos_autobiographer_voice_samples_memory_idx',
      'agos_autobiographer_voice_samples_user_updated_idx',
    ]) {
      expect(sql).toMatch(new RegExp(`DROP INDEX IF EXISTS ${idx}`));
    }
  });

  // ─── Idempotency markers ─────────────────────────────────────────────────

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

  // ─── Doesn't touch prior-phase tables ────────────────────────────────────

  it('does NOT drop or rename Phase 1+2 tables', () => {
    expect(sql).not.toMatch(/DROP TABLE[\s\S]+agos_autobiographer_books/);
    expect(sql).not.toMatch(/DROP TABLE[\s\S]+agos_autobiographer_memories[^_]/);
    expect(sql).not.toMatch(/DROP TABLE[\s\S]+agos_autobiographer_people/);
    expect(sql).not.toMatch(
      /DROP TABLE[\s\S]+agos_autobiographer_memory_people/,
    );
  });
});

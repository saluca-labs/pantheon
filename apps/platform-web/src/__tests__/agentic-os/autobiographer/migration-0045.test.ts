/**
 * Autobiographer OS — migration 0045 smoke test.
 *
 * Asserts structural properties on the SQL text directly; doesn't run
 * Alembic in vitest. Mirrors the migration-0044 test shape with the
 * Phase 4 schema added.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../../../packages/database/alembic/versions/0045_autobiographer_phase4.py',
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('migration 0045_autobiographer_phase4', () => {
  it('declares the correct revision + down_revision', () => {
    expect(sql).toMatch(/revision: str = "0045_autobiographer_phase4"/);
    expect(sql).toMatch(
      /down_revision: Union\[str, None\] = "0044_autobiographer_phase3"/,
    );
  });

  // ─── Legacy rename ──────────────────────────────────────────────────────

  it('renames legacy chapters table to _legacy', () => {
    expect(sql).toMatch(
      /ALTER TABLE agos_autobiographer_chapters\s+RENAME TO agos_autobiographer_chapters_legacy/,
    );
  });

  it('renames the legacy user index alongside the table', () => {
    expect(sql).toMatch(
      /ALTER INDEX agos_autobiographer_chapters_user_idx\s+RENAME TO agos_autobiographer_chapters_legacy_user_idx/,
    );
  });

  it('drops the legacy events FK before re-binding', () => {
    expect(sql).toMatch(/EXECUTE format/);
    expect(sql).toMatch(/DROP CONSTRAINT/);
  });

  // ─── New chapters table ─────────────────────────────────────────────────

  it('creates agos_autobiographer_chapters (new) with IF NOT EXISTS', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_autobiographer_chapters\b\s*\(/,
    );
  });

  it('chapters has the locked column set', () => {
    for (const col of [
      'id ',
      'user_id ',
      'book_id ',
      'title ',
      'slug ',
      'position ',
      'status ',
      'summary ',
      'target_word_count ',
      'metadata ',
      'created_at ',
      'updated_at ',
    ]) {
      expect(sql).toContain(col);
    }
  });

  it('chapters.book_id is NOT NULL + FK CASCADE → books', () => {
    expect(sql).toMatch(
      /book_id\s+UUID\s+NOT NULL[\s\S]+REFERENCES agos_autobiographer_books\(id\)[\s\S]+ON DELETE CASCADE/,
    );
  });

  it('chapters.status has a four-value CHECK', () => {
    expect(sql).toMatch(
      /CHECK \(status IN \('outline','drafting','revised','locked'\)\)/,
    );
  });

  it('UNIQUE (book_id, slug) is declared', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_chapters_book_slug_uq[\s\S]+\(book_id, slug\)/,
    );
  });

  it('UNIQUE (book_id, position) is DEFERRABLE INITIALLY DEFERRED', () => {
    expect(sql).toMatch(
      /agos_autobiographer_chapters_book_position_uq[\s\S]+DEFERRABLE INITIALLY DEFERRED/,
    );
  });

  it('chapters has (user_id, updated_at DESC) composite index', () => {
    expect(sql).toMatch(
      /agos_autobiographer_chapters_user_updated_idx[\s\S]+user_id,\s*updated_at DESC/,
    );
  });

  // ─── Chapter revisions ──────────────────────────────────────────────────

  it('creates agos_autobiographer_chapter_revisions with IF NOT EXISTS', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_autobiographer_chapter_revisions/,
    );
  });

  it('chapter_revisions has the locked column set', () => {
    for (const col of [
      'id ',
      'chapter_id ',
      'user_id ',
      'version ',
      'author ',
      'body_text ',
      'word_count ',
      'summary ',
      'citations ',
      'coach_session_id ',
      'metadata ',
      'created_at ',
    ]) {
      expect(sql).toContain(col);
    }
  });

  it('chapter_revisions.author CHECKs user/coach', () => {
    expect(sql).toMatch(/CHECK \(author IN \('user','coach'\)\)/);
  });

  it('chapter_revisions.version >= 1 CHECK', () => {
    expect(sql).toMatch(/CHECK \(version >= 1\)/);
  });

  it('UNIQUE (chapter_id, version) on revisions', () => {
    expect(sql).toMatch(
      /agos_autobiographer_chapter_revisions_chapter_version_uq[\s\S]+\(chapter_id, version\)/,
    );
  });

  it('revisions composite index (chapter_id, version DESC)', () => {
    expect(sql).toMatch(
      /agos_autobiographer_chapter_revisions_chapter_version_idx[\s\S]+chapter_id,\s*version DESC/,
    );
  });

  it('citations defaults to empty JSONB array', () => {
    expect(sql).toMatch(/citations\s+JSONB\s+NOT NULL DEFAULT '\[\]'::jsonb/);
  });

  it('coach_session_id is nullable + no FK', () => {
    expect(sql).toMatch(/coach_session_id\s+UUID\s+NULL/);
    // No REFERENCES on coach_session_id line
    const line = sql
      .split('\n')
      .find((l) => l.includes('coach_session_id') && l.includes('UUID'));
    expect(line).toBeTruthy();
    expect(line).not.toMatch(/REFERENCES/);
  });

  // ─── Chapter sources ────────────────────────────────────────────────────

  it('creates agos_autobiographer_chapter_sources with IF NOT EXISTS', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_autobiographer_chapter_sources/,
    );
  });

  it('chapter_sources has FK CASCADE on chapter_id and memory_id', () => {
    expect(sql).toMatch(
      /chapter_id\s+UUID\s+NOT NULL[\s\S]+REFERENCES agos_autobiographer_chapters\(id\)[\s\S]+ON DELETE CASCADE/,
    );
    expect(sql).toMatch(
      /memory_id\s+UUID\s+NOT NULL[\s\S]+REFERENCES agos_autobiographer_memories\(id\)[\s\S]+ON DELETE CASCADE/,
    );
  });

  it('chapter_sources has UNIQUE (chapter_id, memory_id)', () => {
    expect(sql).toMatch(
      /agos_autobiographer_chapter_sources_chapter_memory_uq[\s\S]+\(chapter_id, memory_id\)/,
    );
  });

  it('chapter_sources has weight REAL NOT NULL DEFAULT 1.0', () => {
    expect(sql).toMatch(/weight\s+REAL\s+NOT NULL DEFAULT 1\.0/);
  });

  it('chapter_sources has both chapter_id and memory_id single-column indexes', () => {
    expect(sql).toMatch(
      /agos_autobiographer_chapter_sources_chapter_idx[\s\S]+\(chapter_id\)/,
    );
    expect(sql).toMatch(
      /agos_autobiographer_chapter_sources_memory_idx[\s\S]+\(memory_id\)/,
    );
  });

  // ─── Data backfill ──────────────────────────────────────────────────────

  it('iterates legacy chapter rows in (user_id, created_at) order', () => {
    expect(sql).toMatch(
      /FROM agos_autobiographer_chapters_legacy[\s\S]+ORDER BY user_id,\s*created_at ASC/,
    );
  });

  it('auto-creates an "Untitled" book per user with no existing books', () => {
    expect(sql).toMatch(
      /INSERT INTO agos_autobiographer_books[\s\S]+'Untitled'/,
    );
  });

  it('maps legacy status draft->drafting / in_review->revised / final->locked', () => {
    expect(sql).toMatch(/'draft'\s+THEN 'drafting'/);
    expect(sql).toMatch(/'in_review' THEN 'revised'/);
    expect(sql).toMatch(/'final'\s+THEN 'locked'/);
  });

  it('inserts a v1 user-authored revision per legacy chapter', () => {
    expect(sql).toMatch(
      /INSERT INTO agos_autobiographer_chapter_revisions[\s\S]+version[\s\S]+author/,
    );
    expect(sql).toMatch(/1,\s+'user'/);
  });

  it('rebinds events.chapter_id to new chapter id', () => {
    expect(sql).toMatch(
      /UPDATE agos_autobiographer_events[\s\S]+SET chapter_id = new_chapter_id/,
    );
  });

  it('adds new events FK to new chapters table on CASCADE', () => {
    expect(sql).toMatch(
      /ALTER TABLE agos_autobiographer_events[\s\S]+ADD CONSTRAINT agos_autobiographer_events_chapter_fk[\s\S]+REFERENCES agos_autobiographer_chapters\(id\)[\s\S]+ON DELETE CASCADE/,
    );
  });

  // ─── Downgrade ──────────────────────────────────────────────────────────

  it('downgrade drops new tables in dependency order (sources before revisions before chapters)', () => {
    const sourcesDrop = sql.indexOf(
      'DROP TABLE IF EXISTS agos_autobiographer_chapter_sources',
    );
    const revisionsDrop = sql.indexOf(
      'DROP TABLE IF EXISTS agos_autobiographer_chapter_revisions',
    );
    const chaptersDrop = sql.indexOf(
      'DROP TABLE IF EXISTS agos_autobiographer_chapters\b',
    );
    expect(sourcesDrop).toBeGreaterThan(-1);
    expect(revisionsDrop).toBeGreaterThan(-1);
    expect(sourcesDrop).toBeLessThan(revisionsDrop);
    // chapters drop appears after revisions drop
    const chaptersIdx = sql.lastIndexOf('DROP TABLE IF EXISTS agos_autobiographer_chapters');
    expect(revisionsDrop).toBeLessThan(chaptersIdx);
  });

  it('downgrade restores the legacy chapters table name', () => {
    expect(sql).toMatch(
      /ALTER TABLE agos_autobiographer_chapters_legacy\s+RENAME TO agos_autobiographer_chapters/,
    );
  });

  it('downgrade restores the legacy events FK', () => {
    expect(sql).toMatch(
      /ALTER TABLE agos_autobiographer_events[\s\S]+ADD CONSTRAINT agos_autobiographer_events_chapter_id_fkey/,
    );
  });

  // ─── Idempotency markers ────────────────────────────────────────────────

  it('every CREATE TABLE uses IF NOT EXISTS in the upgrade block', () => {
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

  // ─── Doesn't touch prior-phase tables (except legacy chapters rename + events FK rebind) ─

  it('does NOT drop or rename Phase 1/2/3 tables', () => {
    expect(sql).not.toMatch(/DROP TABLE\s+(IF EXISTS\s+)?agos_autobiographer_books\b/);
    expect(sql).not.toMatch(
      /DROP TABLE\s+(IF EXISTS\s+)?agos_autobiographer_memories\b/,
    );
    expect(sql).not.toMatch(/DROP TABLE\s+(IF EXISTS\s+)?agos_autobiographer_people\b/);
    expect(sql).not.toMatch(
      /DROP TABLE\s+(IF EXISTS\s+)?agos_autobiographer_memory_people\b/,
    );
    expect(sql).not.toMatch(
      /DROP TABLE\s+(IF EXISTS\s+)?agos_autobiographer_voice_samples\b/,
    );
    expect(sql).not.toMatch(
      /DROP TABLE\s+(IF EXISTS\s+)?agos_autobiographer_voice_profiles\b/,
    );
  });

  it('legacy events table is preserved (only its FK is rebound)', () => {
    // The events table itself is never dropped — only the FK constraint
    // is replaced. Look for any literal DROP TABLE statement targeting
    // the events table directly.
    expect(sql).not.toMatch(/DROP TABLE\s+(IF EXISTS\s+)?agos_autobiographer_events\b/);
  });
});

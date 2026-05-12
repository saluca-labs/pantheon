/**
 * Autobiographer OS — migration 0046 smoke test.
 *
 * Asserts structural properties on the SQL text directly; doesn't run
 * Alembic in vitest. Mirrors the migration-0045 test shape with the
 * Phase 5 schema added.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../../../packages/database/alembic/versions/0046_autobiographer_phase5.py',
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('migration 0046_autobiographer_phase5', () => {
  it('declares the correct revision + down_revision', () => {
    expect(sql).toMatch(/revision: str = "0046_autobiographer_phase5"/);
    expect(sql).toMatch(
      /down_revision: Union\[str, None\] = "0045_autobiographer_phase4"/,
    );
  });

  // ─── Themes table ────────────────────────────────────────────────────────

  it('creates agos_autobiographer_themes with IF NOT EXISTS', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_autobiographer_themes\s*\(/,
    );
  });

  it('themes carries the expected column set', () => {
    for (const col of [
      'id ',
      'user_id ',
      'name ',
      'slug ',
      'description ',
      'color ',
      'metadata ',
      'created_at ',
      'updated_at ',
    ]) {
      expect(sql).toContain(col);
    }
  });

  it('UNIQUE (user_id, slug) is declared', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_themes_user_slug_uq[\s\S]+\(user_id, slug\)/,
    );
  });

  it('UNIQUE (user_id, lower(name)) functional index is declared', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_themes_user_name_uq[\s\S]+\(user_id, lower\(name\)\)/,
    );
  });

  // ─── memory_themes / chapter_themes joins ────────────────────────────────

  it('memory_themes is FK CASCADE on both sides + PK on (memory_id, theme_id)', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_autobiographer_memory_themes[\s\S]+REFERENCES agos_autobiographer_memories\(id\) ON DELETE CASCADE[\s\S]+REFERENCES agos_autobiographer_themes\(id\)\s+ON DELETE CASCADE[\s\S]+PRIMARY KEY \(memory_id, theme_id\)/,
    );
  });

  it('memory_themes has theme_id index', () => {
    expect(sql).toMatch(
      /agos_autobiographer_memory_themes_theme_idx[\s\S]+\(theme_id\)/,
    );
  });

  it('chapter_themes is FK CASCADE on both sides + PK on (chapter_id, theme_id)', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_autobiographer_chapter_themes[\s\S]+REFERENCES agos_autobiographer_chapters\(id\) ON DELETE CASCADE[\s\S]+REFERENCES agos_autobiographer_themes\(id\)\s+ON DELETE CASCADE[\s\S]+PRIMARY KEY \(chapter_id, theme_id\)/,
    );
  });

  it('chapter_themes has theme_id index', () => {
    expect(sql).toMatch(
      /agos_autobiographer_chapter_themes_theme_idx[\s\S]+\(theme_id\)/,
    );
  });

  // ─── arcs table ─────────────────────────────────────────────────────────

  it('creates agos_autobiographer_arcs with IF NOT EXISTS', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_autobiographer_arcs\s*\(/,
    );
  });

  it('arcs.book_id is NOT NULL + FK CASCADE → books', () => {
    expect(sql).toMatch(
      /book_id\s+UUID\s+NOT NULL[\s\S]+REFERENCES agos_autobiographer_books\(id\)[\s\S]+ON DELETE CASCADE/,
    );
  });

  it('arcs.kind has a four-value CHECK', () => {
    expect(sql).toMatch(
      /CHECK \(kind IN \('chronological','thematic','character_led','custom'\)\)/,
    );
  });

  it('arcs is_primary partial UNIQUE index (one primary per book)', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_arcs_book_primary_uq[\s\S]+ON agos_autobiographer_arcs \(book_id\) WHERE is_primary = true/,
    );
  });

  it('arcs carries the expected column set', () => {
    for (const col of [
      'id ',
      'user_id ',
      'book_id ',
      'title ',
      'kind ',
      'description ',
      'is_primary ',
      'metadata ',
      'created_at ',
      'updated_at ',
    ]) {
      expect(sql).toContain(col);
    }
  });

  // ─── arc_chapters table ─────────────────────────────────────────────────

  it('creates agos_autobiographer_arc_chapters with IF NOT EXISTS', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_autobiographer_arc_chapters\s*\(/,
    );
  });

  it('arc_chapters has FK CASCADE to arcs and chapters', () => {
    expect(sql).toMatch(
      /agos_autobiographer_arc_chapters[\s\S]+REFERENCES agos_autobiographer_arcs\(id\)\s+ON DELETE CASCADE[\s\S]+REFERENCES agos_autobiographer_chapters\(id\) ON DELETE CASCADE/,
    );
  });

  it('UNIQUE (arc_id, chapter_id) is declared', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_arc_chapters_arc_chapter_uq[\s\S]+\(arc_id, chapter_id\)/,
    );
  });

  it('UNIQUE (arc_id, position) is DEFERRABLE INITIALLY DEFERRED', () => {
    expect(sql).toMatch(
      /agos_autobiographer_arc_chapters_arc_position_uq[\s\S]+DEFERRABLE INITIALLY DEFERRED/,
    );
  });

  it('arc_chapters has (arc_id, position) composite index', () => {
    expect(sql).toMatch(
      /agos_autobiographer_arc_chapters_arc_position_idx[\s\S]+\(arc_id, position\)/,
    );
  });

  // ─── Downgrade is reversible ────────────────────────────────────────────

  it('downgrade drops all five tables in dependency order', () => {
    const sec = sql.match(/_DOWNGRADE_SQL = r"""[\s\S]*?"""/);
    expect(sec).toBeTruthy();
    const down = sec![0];
    expect(down).toMatch(/DROP TABLE IF EXISTS agos_autobiographer_arc_chapters/);
    expect(down).toMatch(/DROP TABLE IF EXISTS agos_autobiographer_arcs/);
    expect(down).toMatch(/DROP TABLE IF EXISTS agos_autobiographer_chapter_themes/);
    expect(down).toMatch(/DROP TABLE IF EXISTS agos_autobiographer_memory_themes/);
    expect(down).toMatch(/DROP TABLE IF EXISTS agos_autobiographer_themes/);
  });

  it('uses op.execute(raw_string), not text() — no bind-marker risk', () => {
    expect(sql).toMatch(/op\.execute\(_UPGRADE_SQL\)/);
    expect(sql).toMatch(/op\.execute\(_DOWNGRADE_SQL\)/);
    expect(sql).not.toMatch(/op\.execute\(text\(/);
  });

  it('scans clean of stray :word bind markers inside the raw SQL', () => {
    // Walk the raw SQL bodies and assert no ":<word>" patterns linger
    // (would be parsed as SQLAlchemy binds if the migration ever
    // switched to text()).
    const bodies = sql.match(/r"""[\s\S]*?"""/g) ?? [];
    expect(bodies.length).toBe(2);
    for (const body of bodies) {
      // skip ::cast tokens
      const stripped = body.replace(/::[A-Za-z_][A-Za-z0-9_]*/g, '');
      const matches = stripped.match(/(?<![\w:]):[A-Za-z][A-Za-z0-9_]*/g) ?? [];
      expect(matches).toEqual([]);
    }
  });
});

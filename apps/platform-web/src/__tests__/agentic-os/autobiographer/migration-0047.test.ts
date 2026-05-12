/**
 * Autobiographer OS — migration 0047 smoke test.
 *
 * Asserts structural properties on the SQL text directly; doesn't run
 * Alembic in vitest. Mirrors the migration-0046 test shape with the
 * Phase 6 schema added.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../../../packages/database/alembic/versions/0047_autobiographer_phase6.py',
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('migration 0047_autobiographer_phase6', () => {
  it('declares the correct revision + down_revision', () => {
    expect(sql).toMatch(/revision: str = "0047_autobiographer_phase6"/);
    expect(sql).toMatch(
      /down_revision: Union\[str, None\] = "0046_autobiographer_phase5"/,
    );
  });

  // ─── ALTER memories + chapter_revisions ────────────────────────────────

  it('adds sensitive_kinds TEXT[] to memories with IF NOT EXISTS', () => {
    expect(sql).toMatch(
      /ALTER TABLE agos_autobiographer_memories\s+ADD COLUMN IF NOT EXISTS sensitive_kinds TEXT\[\] NOT NULL DEFAULT '\{\}'/,
    );
  });

  it('adds sensitive_kinds TEXT[] to chapter_revisions with IF NOT EXISTS', () => {
    expect(sql).toMatch(
      /ALTER TABLE agos_autobiographer_chapter_revisions\s+ADD COLUMN IF NOT EXISTS sensitive_kinds TEXT\[\] NOT NULL DEFAULT '\{\}'/,
    );
  });

  it('creates GIN indexes on sensitive_kinds for both tables', () => {
    expect(sql).toMatch(
      /agos_autobiographer_memories_sensitive_kinds_gin[\s\S]+USING GIN \(sensitive_kinds\)/,
    );
    expect(sql).toMatch(
      /agos_autobiographer_chapter_revisions_sensitive_kinds_gin[\s\S]+USING GIN \(sensitive_kinds\)/,
    );
  });

  // ─── Pseudonyms table ──────────────────────────────────────────────────

  it('creates agos_autobiographer_pseudonyms with IF NOT EXISTS', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_autobiographer_pseudonyms\s*\(/,
    );
  });

  it('pseudonyms has book_id FK CASCADE → books', () => {
    expect(sql).toMatch(
      /book_id\s+UUID\s+NOT NULL[\s\S]+REFERENCES agos_autobiographer_books\(id\)[\s\S]+ON DELETE CASCADE/,
    );
  });

  it('pseudonyms has person_id FK CASCADE → people', () => {
    expect(sql).toMatch(
      /person_id\s+UUID\s+NOT NULL[\s\S]+REFERENCES agos_autobiographer_people\(id\)[\s\S]+ON DELETE CASCADE/,
    );
  });

  it('pseudonyms carries the expected column set', () => {
    for (const col of [
      'id ',
      'book_id ',
      'user_id ',
      'person_id ',
      'pseudonym ',
      'notes ',
      'applied ',
      'created_at ',
      'updated_at ',
    ]) {
      expect(sql).toContain(col);
    }
  });

  it('pseudonyms applied defaults to false', () => {
    expect(sql).toMatch(/applied\s+BOOLEAN\s+NOT NULL DEFAULT false/);
  });

  it('UNIQUE (book_id, person_id) is declared on pseudonyms', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_pseudonyms_book_person_uq[\s\S]+\(book_id, person_id\)/,
    );
  });

  // ─── Review-checks table ───────────────────────────────────────────────

  it('creates agos_autobiographer_review_checks with IF NOT EXISTS', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_autobiographer_review_checks\s*\(/,
    );
  });

  it('review_checks book_id FK CASCADE → books, chapter_id nullable FK CASCADE → chapters', () => {
    expect(sql).toMatch(
      /book_id\s+UUID\s+NOT NULL[\s\S]+REFERENCES agos_autobiographer_books\(id\)[\s\S]+ON DELETE CASCADE/,
    );
    expect(sql).toMatch(
      /chapter_id\s+UUID\s+NULL[\s\S]+REFERENCES agos_autobiographer_chapters\(id\)[\s\S]+ON DELETE CASCADE/,
    );
  });

  it('review_checks kind has a six-value CHECK', () => {
    expect(sql).toMatch(
      /CHECK \(kind IN \(\s*'consent_collected',\s*'sensitive_flagged',\s*'attribution_verified',\s*'redaction_applied',\s*'third_party_disclaimer',\s*'legal_reviewed'\s*\)\)/,
    );
  });

  it('review_checks status has a four-value CHECK with pending default', () => {
    expect(sql).toMatch(
      /status\s+TEXT\s+NOT NULL DEFAULT 'pending'/,
    );
    expect(sql).toMatch(
      /CHECK \(status IN \('pending','passed','waived','failed'\)\)/,
    );
  });

  it('review_checks partial UNIQUE (chapter_id, kind) WHERE chapter_id IS NOT NULL', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_review_checks_chapter_kind_uq[\s\S]+\(chapter_id, kind\)\s+WHERE chapter_id IS NOT NULL/,
    );
  });

  it('review_checks partial UNIQUE (book_id, kind) WHERE chapter_id IS NULL', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_review_checks_book_kind_uq[\s\S]+\(book_id, kind\)\s+WHERE chapter_id IS NULL/,
    );
  });

  // ─── Downgrade is reversible ───────────────────────────────────────────

  it('downgrade drops review_checks first, then pseudonyms, then sensitive_kinds columns', () => {
    const sec = sql.match(/_DOWNGRADE_SQL = r"""[\s\S]*?"""/);
    expect(sec).toBeTruthy();
    const down = sec![0];
    expect(down).toMatch(/DROP TABLE IF EXISTS agos_autobiographer_review_checks/);
    expect(down).toMatch(/DROP TABLE IF EXISTS agos_autobiographer_pseudonyms/);
    expect(down).toMatch(
      /ALTER TABLE agos_autobiographer_chapter_revisions\s+DROP COLUMN IF EXISTS sensitive_kinds/,
    );
    expect(down).toMatch(
      /ALTER TABLE agos_autobiographer_memories\s+DROP COLUMN IF EXISTS sensitive_kinds/,
    );
  });

  it('uses op.execute(raw_string), not text() — no bind-marker risk', () => {
    expect(sql).toMatch(/op\.execute\(_UPGRADE_SQL\)/);
    expect(sql).toMatch(/op\.execute\(_DOWNGRADE_SQL\)/);
    expect(sql).not.toMatch(/op\.execute\(text\(/);
  });

  it('scans clean of stray :word bind markers inside the raw SQL', () => {
    const bodies = sql.match(/r"""[\s\S]*?"""/g) ?? [];
    expect(bodies.length).toBe(2);
    for (const body of bodies) {
      const stripped = body.replace(/::[A-Za-z_][A-Za-z0-9_]*/g, '');
      const matches = stripped.match(/(?<![\w:]):[A-Za-z][A-Za-z0-9_]*/g) ?? [];
      expect(matches).toEqual([]);
    }
  });

  it('NO Postgres CHECK on sensitive_kinds array values (app-side per spec)', () => {
    // The spec explicitly defers array-element CHECK constraints.
    // Sanity guard: scan each line in the raw SQL bodies. A CHECK
    // clause sits on a single line in the migration template; if any
    // line contains both "CHECK" and "sensitive_kinds", the spec was
    // violated.
    const bodies = sql.match(/r"""[\s\S]*?"""/g) ?? [];
    for (const body of bodies) {
      for (const line of body.split('\n')) {
        if (/sensitive_kinds/.test(line) && /\bCHECK\b/.test(line)) {
          throw new Error(
            `unexpected CHECK on sensitive_kinds: ${line.trim()}`,
          );
        }
      }
    }
  });
});

/**
 * Autobiographer OS — migration 0041 smoke test.
 *
 * Reads the SQL text directly and asserts structural properties (we don't
 * run alembic in vitest). Matches the lightweight pattern used by Maker
 * 0033/0035 migration tests.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../../../packages/database/alembic/versions/0041_autobiographer_phase1.py',
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('migration 0041_autobiographer_phase1', () => {
  it('declares the correct revision + down_revision', () => {
    expect(sql).toMatch(/revision: str = "0041_autobiographer_phase1"/);
    expect(sql).toMatch(
      /down_revision: Union\[str, None\] = "0040_maker_phase7"/,
    );
  });

  // ─── Books table ─────────────────────────────────────────────────────────

  it('creates agos_autobiographer_books with IF NOT EXISTS', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_autobiographer_books/,
    );
  });

  it('books table has the locked column set', () => {
    for (const col of [
      'id ',
      'user_id ',
      'title ',
      'subtitle ',
      'cover_image_url ',
      'description ',
      'status ',
      'target_completion_date ',
      'target_audience ',
      'tags ',
      'phase_progress ',
      'metadata ',
      'created_at ',
      'updated_at ',
    ]) {
      expect(sql).toContain(col);
    }
  });

  it('books status default is drafting + CHECK lists all 5 values', () => {
    expect(sql).toMatch(/status\s+TEXT\s+NOT NULL DEFAULT 'drafting'/);
    expect(sql).toMatch(/agos_autobiographer_books_status_chk/);
    for (const v of ['drafting', 'revising', 'done', 'paused', 'archived']) {
      expect(sql).toMatch(new RegExp(`'${v}'`));
    }
  });

  it('books composite index (user_id, status, updated_at DESC)', () => {
    expect(sql).toMatch(
      /agos_autobiographer_books_user_status_idx[\s\S]+user_id,\s*status,\s*updated_at DESC/,
    );
  });

  it('books has a GIN index on tags', () => {
    expect(sql).toMatch(
      /agos_autobiographer_books_tags_gin_idx[\s\S]+USING GIN \(tags\)/,
    );
  });

  it('books.cover_image_url has the MCP storage-transfer column comment', () => {
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_autobiographer_books\.cover_image_url/,
    );
    expect(sql).toMatch(/MCP-mediated storage transfer/);
  });

  // ─── Memories table ──────────────────────────────────────────────────────

  it('creates agos_autobiographer_memories with IF NOT EXISTS', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_autobiographer_memories/,
    );
  });

  it('memories table has the locked column set', () => {
    for (const col of [
      'id ',
      'user_id ',
      'book_id ',
      'title ',
      'body_markdown ',
      'transcript ',
      'audio_url ',
      'photo_urls ',
      'when_in_life ',
      'era_date_estimate ',
      'location ',
      'emotion_tags ',
      'content_tags ',
      'is_sensitive ',
      'source ',
      'metadata ',
    ]) {
      expect(sql).toContain(col);
    }
  });

  it('memories.book_id is FK with ON DELETE SET NULL', () => {
    expect(sql).toMatch(
      /book_id\s+UUID\s+NULL[\s\S]+REFERENCES agos_autobiographer_books\(id\)[\s\S]+ON DELETE SET NULL/,
    );
  });

  it('memories source default is text + CHECK lists all 4 values', () => {
    expect(sql).toMatch(/source\s+TEXT\s+NOT NULL DEFAULT 'text'/);
    expect(sql).toMatch(/agos_autobiographer_memories_source_chk/);
    for (const v of ['text', 'audio_transcript', 'photo_caption', 'import']) {
      expect(sql).toMatch(new RegExp(`'${v}'`));
    }
  });

  it('memories.is_sensitive defaults to false', () => {
    expect(sql).toMatch(/is_sensitive\s+BOOLEAN\s+NOT NULL DEFAULT false/);
  });

  it('memories has user_idx on (user_id, updated_at DESC)', () => {
    expect(sql).toMatch(
      /agos_autobiographer_memories_user_idx[\s\S]+user_id,\s*updated_at DESC/,
    );
  });

  it('memories book_idx is partial WHERE book_id IS NOT NULL', () => {
    expect(sql).toMatch(
      /agos_autobiographer_memories_book_idx[\s\S]+book_id,\s*updated_at DESC[\s\S]+WHERE book_id IS NOT NULL/,
    );
  });

  it('memories has GIN indexes on both tag arrays', () => {
    expect(sql).toMatch(
      /agos_autobiographer_memories_content_tags_gin_idx[\s\S]+USING GIN \(content_tags\)/,
    );
    expect(sql).toMatch(
      /agos_autobiographer_memories_emotion_tags_gin_idx[\s\S]+USING GIN \(emotion_tags\)/,
    );
  });

  it('memories era_idx is partial on era_date_estimate', () => {
    expect(sql).toMatch(
      /agos_autobiographer_memories_era_idx[\s\S]+era_date_estimate[\s\S]+WHERE era_date_estimate IS NOT NULL/,
    );
  });

  it('memories.audio_url + photo_urls + transcript carry MCP column comments', () => {
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_autobiographer_memories\.audio_url/,
    );
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_autobiographer_memories\.photo_urls/,
    );
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_autobiographer_memories\.transcript/,
    );
  });

  // ─── Legacy handling ─────────────────────────────────────────────────────

  it('does NOT drop or rename the legacy agos_autobiographer_chapters table', () => {
    // The legacy table from migration 0009 must survive Phase 1 unchanged.
    expect(sql).not.toMatch(
      /DROP TABLE[\s\S]+agos_autobiographer_chapters/,
    );
    expect(sql).not.toMatch(
      /RENAME TABLE\s+agos_autobiographer_chapters/i,
    );
    expect(sql).not.toMatch(
      /ALTER TABLE agos_autobiographer_chapters\s+RENAME/i,
    );
  });

  // ─── Downgrade ───────────────────────────────────────────────────────────

  it('downgrade drops both tables and their indexes', () => {
    expect(sql).toMatch(/DROP TABLE IF EXISTS agos_autobiographer_memories/);
    expect(sql).toMatch(/DROP TABLE IF EXISTS agos_autobiographer_books/);
    // Drop in dependency order — memories first (FK into books).
    const memDropIdx = sql.indexOf(
      'DROP TABLE IF EXISTS agos_autobiographer_memories',
    );
    const bookDropIdx = sql.indexOf(
      'DROP TABLE IF EXISTS agos_autobiographer_books',
    );
    expect(memDropIdx).toBeLessThan(bookDropIdx);
  });

  it('downgrade also drops indexes IF EXISTS', () => {
    for (const idx of [
      'agos_autobiographer_memories_era_idx',
      'agos_autobiographer_memories_emotion_tags_gin_idx',
      'agos_autobiographer_memories_content_tags_gin_idx',
      'agos_autobiographer_memories_book_idx',
      'agos_autobiographer_memories_user_idx',
      'agos_autobiographer_books_tags_gin_idx',
      'agos_autobiographer_books_user_status_idx',
    ]) {
      expect(sql).toMatch(new RegExp(`DROP INDEX IF EXISTS ${idx}`));
    }
  });

  // ─── Idempotency markers ────────────────────────────────────────────────

  it('every CREATE TABLE uses IF NOT EXISTS', () => {
    // Scan only inside the upgrade/downgrade SQL strings, not the docstring.
    const sqlOnly = sql.split('_UPGRADE_SQL =')[1] ?? '';
    const createTableMatches = sqlOnly.match(
      /CREATE TABLE\s+(?!IF NOT EXISTS)/g,
    );
    expect(createTableMatches).toBeNull();
  });

  it('every CREATE INDEX uses IF NOT EXISTS', () => {
    const sqlOnly = sql.split('_UPGRADE_SQL =')[1] ?? '';
    const createIndexMatches = sqlOnly.match(
      /CREATE INDEX\s+(?!IF NOT EXISTS)/g,
    );
    expect(createIndexMatches).toBeNull();
  });
});

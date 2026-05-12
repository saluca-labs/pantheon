/**
 * Research OS Phase 5 — migration 0052 smoke test.
 *
 * Asserts structural properties of the datasets + protocols + version-
 * pinning join migration:
 *   - Revision identifier + down_revision wired correctly (catches a
 *     copy-paste of the stale plan-doc 0045 anchor / 0044 down_revision).
 *   - 3 new tables (datasets, protocols, experiment_protocols)
 *     created with the documented column set + CHECKs.
 *   - Idempotent DDL (CREATE TABLE / INDEX / UNIQUE INDEX IF NOT EXISTS).
 *   - NO FK on experiment_id (v0.1.30 contract).
 *   - NO FK on parent_protocol_id (soft tree-walks).
 *   - UNIQUE (experiment_id, protocol_id, pinned_version) on join.
 *   - Partial index on parent_protocol_id WHERE NOT NULL.
 *   - GIN index on datasets.tags + protocols.tags.
 *   - (user_id, archived) index on datasets.
 *   - Downgrade drops tables in reverse order.
 *   - Zero `:<word>` bind-marker patterns in raw SQL bodies (footgun).
 *   - op.execute uses string constants (not text(...)).
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../../../packages/database/alembic/versions/0052_research_phase5.py',
);
const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('migration 0052_research_phase5', () => {
  it('declares the correct revision identifier', () => {
    expect(sql).toMatch(/revision: str = "0052_research_phase5"/);
  });

  it('declares the correct down_revision (post-Phase-4 chain)', () => {
    expect(sql).toMatch(
      /down_revision: Union\[str, None\] = "0051_research_phase4"/,
    );
  });

  it('does NOT chain off the stale plan-doc revision 0044', () => {
    expect(sql).not.toMatch(/down_revision[^"]*"0044_research_phase4"/);
    expect(sql).not.toMatch(/revision: str = "0045_research_phase5"/);
  });

  // ─── agos_research_datasets ───────────────────────────────────────────

  it('creates agos_research_datasets idempotently', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS agos_research_datasets/);
  });

  it('datasets table carries the full column set', () => {
    const required = [
      'id              UUID PRIMARY KEY',
      'user_id         UUID NOT NULL',
      'experiment_id   UUID NOT NULL',
      'name            TEXT NOT NULL',
      "kind            TEXT NOT NULL DEFAULT 'tabular'",
      'url             TEXT NOT NULL',
      'version         TEXT,',
      'size_bytes      BIGINT,',
      'checksum        TEXT,',
      'archived        BOOLEAN NOT NULL DEFAULT false',
      'published_doi   TEXT,',
      'notes_md        TEXT,',
      "tags            TEXT[] NOT NULL DEFAULT '{}'",
      'metadata        JSONB',
    ];
    for (const col of required) expect(sql).toContain(col);
  });

  it('datasets kind CHECK covers all 6 values', () => {
    expect(sql).toMatch(
      /CHECK \(kind IN \('tabular','image','timeseries','sequence','sim','other'\)\)/,
    );
  });

  it('datasets has experiment_id index', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_datasets_experiment_idx[\s\S]*?\(experiment_id\)/,
    );
  });

  it('datasets has (user_id, archived) index', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_datasets_user_archived_idx[\s\S]*?\(user_id, archived\)/,
    );
  });

  it('datasets has GIN index on tags', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_datasets_tags_gin_idx[\s\S]*?USING gin \(tags\)/,
    );
  });

  it('datasets carries NO FK on experiment_id (v0.1.30 contract)', () => {
    // Slice out just the datasets CREATE TABLE body and ensure no
    // REFERENCES clause appears for experiment_id.
    const m = sql.match(
      /CREATE TABLE IF NOT EXISTS agos_research_datasets[\s\S]*?\);/,
    );
    expect(m).not.toBeNull();
    const body = m![0];
    expect(body).not.toMatch(/experiment_id[^,]*REFERENCES/i);
  });

  // ─── agos_research_protocols ──────────────────────────────────────────

  it('creates agos_research_protocols idempotently', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS agos_research_protocols/);
  });

  it('protocols table carries the full column set', () => {
    const required = [
      'id                    UUID PRIMARY KEY',
      'user_id               UUID NOT NULL',
      'title                 TEXT NOT NULL',
      "version               TEXT NOT NULL DEFAULT '1.0'",
      "body_md               TEXT NOT NULL DEFAULT ''",
      "kind                  TEXT NOT NULL DEFAULT 'method'",
      "attached_urls         TEXT[] NOT NULL DEFAULT '{}'",
      "tags                  TEXT[] NOT NULL DEFAULT '{}'",
      'parent_protocol_id    UUID,',
      'metadata              JSONB',
    ];
    for (const col of required) expect(sql).toContain(col);
  });

  it('protocols kind CHECK covers all 5 values', () => {
    expect(sql).toMatch(
      /CHECK \(kind IN \('method','sop','analysis','code_pipeline','other'\)\)/,
    );
  });

  it('protocols has (user_id, kind) index', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_protocols_user_kind_idx[\s\S]*?\(user_id, kind\)/,
    );
  });

  it('protocols has partial index on parent_protocol_id WHERE NOT NULL', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_protocols_parent_partial_idx[\s\S]*?\(parent_protocol_id\)[\s\S]*?WHERE parent_protocol_id IS NOT NULL/,
    );
  });

  it('protocols has GIN index on tags', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_protocols_tags_gin_idx[\s\S]*?USING gin \(tags\)/,
    );
  });

  it('protocols carries NO FK on parent_protocol_id (soft tree-walks)', () => {
    const m = sql.match(
      /CREATE TABLE IF NOT EXISTS agos_research_protocols[\s\S]*?\);/,
    );
    expect(m).not.toBeNull();
    const body = m![0];
    expect(body).not.toMatch(/parent_protocol_id[^,]*REFERENCES/i);
  });

  // ─── agos_research_experiment_protocols ───────────────────────────────

  it('creates agos_research_experiment_protocols idempotently', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_research_experiment_protocols/,
    );
  });

  it('join table carries the full column set', () => {
    const required = [
      'id               UUID PRIMARY KEY',
      'experiment_id    UUID NOT NULL',
      'protocol_id      UUID NOT NULL REFERENCES agos_research_protocols(id) ON DELETE CASCADE',
      'pinned_version   TEXT NOT NULL',
      'notes            TEXT,',
    ];
    for (const col of required) expect(sql).toContain(col);
  });

  it('join carries UNIQUE (experiment_id, protocol_id, pinned_version)', () => {
    expect(sql).toMatch(
      /UNIQUE \(experiment_id, protocol_id, pinned_version\)/,
    );
  });

  it('join has experiment_id + protocol_id indexes', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_experiment_protocols_experiment_idx[\s\S]*?\(experiment_id\)/,
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_experiment_protocols_protocol_idx[\s\S]*?\(protocol_id\)/,
    );
  });

  it('join carries NO FK on experiment_id (v0.1.30 contract)', () => {
    const m = sql.match(
      /CREATE TABLE IF NOT EXISTS agos_research_experiment_protocols[\s\S]*?\);/,
    );
    expect(m).not.toBeNull();
    const body = m![0];
    expect(body).not.toMatch(/experiment_id[^,]*REFERENCES/i);
  });

  it('join carries FK CASCADE on protocol_id', () => {
    expect(sql).toMatch(
      /protocol_id[^,]*REFERENCES agos_research_protocols\(id\) ON DELETE CASCADE/,
    );
  });

  // ─── Downgrade ─────────────────────────────────────────────────────────

  it('downgrade drops the 3 tables in reverse order', () => {
    const dropMatches = Array.from(
      sql.matchAll(/DROP TABLE IF EXISTS (\w+);/g),
    ).map((m) => m[1]);
    expect(dropMatches).toEqual([
      'agos_research_experiment_protocols',
      'agos_research_protocols',
      'agos_research_datasets',
    ]);
  });

  // ─── Footgun guards ────────────────────────────────────────────────────

  it('uses op.execute with raw string constant (no text() wrap)', () => {
    expect(sql).toMatch(/op\.execute\(_UPGRADE_SQL\)/);
    expect(sql).toMatch(/op\.execute\(_DOWNGRADE_SQL\)/);
    // Scope the no-text() guard to the function bodies, not the
    // docstring (which references the footgun in prose).
    const upgradeFn = sql.match(/def upgrade\(\) -> None:([\s\S]*?)def downgrade/);
    const downgradeFn = sql.match(/def downgrade\(\) -> None:([\s\S]*)/);
    expect(upgradeFn?.[1] ?? '').not.toMatch(/op\.execute\(text\(/);
    expect(downgradeFn?.[1] ?? '').not.toMatch(/op\.execute\(text\(/);
  });

  it('zero :<word> bind-marker patterns inside the SQL bodies', () => {
    // Strip ::cast first, then exclude URLs; only bare ":word" patterns
    // count as bind-markers (the SQLAlchemy text() footgun).
    const bodies = sql.match(/r"""[\s\S]*?"""/g) ?? [];
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      const noCasts = body.replace(/::[A-Za-z_][A-Za-z0-9_]*/g, '');
      const matches = noCasts.match(
        /(?<![A-Za-z0-9:])[A-Za-z_]?:[A-Za-z_][A-Za-z0-9_]*/g,
      );
      const real = (matches ?? []).filter(
        (m) => !/^https?:/i.test(m) && !/^[a-z]+:\/\//i.test(m),
      );
      expect(real).toEqual([]);
    }
  });

  it('idempotent DDL — every CREATE in the SQL bodies uses IF NOT EXISTS', () => {
    const bodies = sql.match(/r"""[\s\S]*?"""/g) ?? [];
    for (const body of bodies) {
      const creates = body.match(/CREATE (TABLE|UNIQUE INDEX|INDEX)[^;]*/g) ?? [];
      for (const c of creates) {
        expect(c).toMatch(/IF NOT EXISTS/);
      }
    }
  });
});

/**
 * Business OS Phase 1 — migration 0055 smoke tests.
 *
 * Asserts structural properties of the foundation migration without
 * running it against a real Postgres.  Covers:
 *   - Revision identifier + down_revision wired correctly
 *   - 3 ALTERs on agos_business_{orgs|people|interactions}
 *   - JSONB→TEXT[] tags column-type migration is well-formed
 *   - org_type / interaction_type CHECKs are added defensively (drift
 *     remap → ADD CONSTRAINT)
 *   - New agos_business_settings table with the documented column set
 *   - Idempotent guards (IF NOT EXISTS / pg_constraint lookup)
 *   - Footgun guard: zero `:<word>` bind markers in raw SQL
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../../../packages/database/alembic/versions/0055_business_phase1.py',
);
// Normalize line endings: the migration is authored LF, but on Windows with
// `core.autocrlf=true` (Git's default on Windows) the file checks out with
// CRLF. The assertions below use literal "\n" inside multi-line patterns —
// without normalization they'd fail on Windows. Repo also declares
// `*.py text eol=lf` in .gitattributes so fresh clones will be LF-canonical,
// but this normalization is the defense-in-depth so the test stays portable
// to any worktree.
const sql = readFileSync(MIGRATION_PATH, 'utf8').replace(/\r\n/g, '\n');

describe('migration 0055_business_phase1', () => {
  it('declares the correct revision identifier', () => {
    expect(sql).toMatch(/revision: str = "0055_business_phase1"/);
  });

  it('declares down_revision = 0054_research_phase7', () => {
    expect(sql).toMatch(
      /down_revision: Union\[str, None\] = "0054_research_phase7"/,
    );
  });

  it('does NOT chain off any stale revision', () => {
    expect(sql).not.toMatch(/down_revision[^"]*"0011/);
    expect(sql).not.toMatch(/revision: str = "0011_business/);
  });

  // ─── orgs ALTER ────────────────────────────────────────────────────────

  it('adds description_md to orgs', () => {
    expect(sql).toMatch(
      /ALTER TABLE agos_business_orgs[\s\S]*?ADD COLUMN IF NOT EXISTS description_md TEXT NOT NULL DEFAULT ''/,
    );
  });

  it('adds address to orgs', () => {
    expect(sql).toMatch(
      /ALTER TABLE agos_business_orgs[\s\S]*?ADD COLUMN IF NOT EXISTS address TEXT;/,
    );
  });

  it("adds tags TEXT[] to orgs with default '{}'", () => {
    expect(sql).toMatch(
      /ALTER TABLE agos_business_orgs[\s\S]*?ADD COLUMN IF NOT EXISTS tags TEXT\[\] NOT NULL DEFAULT '\{\}'/,
    );
  });

  it('adds archived_at to orgs (nullable)', () => {
    expect(sql).toMatch(
      /ALTER TABLE agos_business_orgs[\s\S]*?ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ/,
    );
  });

  it("adds metadata JSONB to orgs with default '{}'", () => {
    expect(sql).toMatch(
      /ALTER TABLE agos_business_orgs[\s\S]*?ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '\{\}'::jsonb/,
    );
  });

  it('defensive remaps org_type drift to "other" before adding the CHECK', () => {
    const remap = sql.indexOf("UPDATE agos_business_orgs\n   SET org_type = 'other'");
    const check = sql.indexOf('ADD CONSTRAINT agos_business_orgs_org_type_check');
    expect(remap).toBeGreaterThan(0);
    expect(check).toBeGreaterThan(remap);
  });

  it('adds CHECK on orgs.org_type covering the 6 canonical values', () => {
    expect(sql).toMatch(
      /agos_business_orgs_org_type_check[\s\S]*?CHECK \(org_type IN \('company','non_profit','government','sole_trader','partnership','other'\)\)/,
    );
  });

  it('guards CHECK constraint add with pg_constraint lookup (idempotent)', () => {
    expect(sql).toMatch(
      /IF NOT EXISTS \([\s\S]*?SELECT 1 FROM pg_constraint[\s\S]*?conname = 'agos_business_orgs_org_type_check'/,
    );
  });

  it('creates GIN index on orgs.tags', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_business_orgs_tags_gin_idx[\s\S]*?USING gin \(tags\)/,
    );
  });

  it('creates partial active-only index on orgs', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_business_orgs_user_active_idx[\s\S]*?\(user_id\)[\s\S]*?WHERE archived_at IS NULL/,
    );
  });

  // ─── people ALTER + tags JSONB→TEXT[] ──────────────────────────────────

  it('adds description_md to people', () => {
    expect(sql).toMatch(
      /ALTER TABLE agos_business_people[\s\S]*?ADD COLUMN IF NOT EXISTS description_md TEXT NOT NULL DEFAULT ''/,
    );
  });

  it('adds address to people', () => {
    expect(sql).toMatch(
      /ALTER TABLE agos_business_people[\s\S]*?ADD COLUMN IF NOT EXISTS address TEXT;/,
    );
  });

  it('adds archived_at to people', () => {
    expect(sql).toMatch(
      /ALTER TABLE agos_business_people[\s\S]*?ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ/,
    );
  });

  it('adds metadata JSONB to people', () => {
    expect(sql).toMatch(
      /ALTER TABLE agos_business_people[\s\S]*?ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '\{\}'::jsonb/,
    );
  });

  it('adds tags_new TEXT[] (intermediate) on people', () => {
    expect(sql).toMatch(
      /ADD COLUMN tags_new TEXT\[\] NOT NULL DEFAULT '\{\}'/,
    );
  });

  it('backfills tags_new from JSONB array elements', () => {
    expect(sql).toMatch(/jsonb_array_elements_text\(tags\)/);
  });

  it('backfill guards against non-array JSONB via jsonb_typeof check', () => {
    expect(sql).toMatch(/jsonb_typeof\(tags\) = 'array'/);
  });

  it('backfill COALESCEs to empty TEXT[] when JSONB is null/empty', () => {
    expect(sql).toMatch(/COALESCE[\s\S]*?'\{\}'::TEXT\[\]/);
  });

  it('drops the old JSONB tags column when present', () => {
    expect(sql).toMatch(
      /information_schema\.columns[\s\S]*?column_name = 'tags'[\s\S]*?data_type = 'jsonb'[\s\S]*?ALTER TABLE agos_business_people DROP COLUMN tags;/,
    );
  });

  it('renames tags_new to tags after drop', () => {
    expect(sql).toMatch(
      /ALTER TABLE agos_business_people RENAME COLUMN tags_new TO tags/,
    );
  });

  it('rename guarded so partial re-runs do not break', () => {
    // Renames only if tags_new exists AND tags does not.
    expect(sql).toMatch(
      /IF EXISTS \([\s\S]*?column_name = 'tags_new'[\s\S]*?\) AND NOT EXISTS \([\s\S]*?column_name = 'tags'/,
    );
  });

  it('creates GIN index on people.tags', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_business_people_tags_gin_idx[\s\S]*?USING gin \(tags\)/,
    );
  });

  it('creates partial active-only index on people', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_business_people_user_active_idx[\s\S]*?WHERE archived_at IS NULL/,
    );
  });

  it('does NOT add a CHECK constraint on people.stage', () => {
    // Per the locked decision; the column stays free-form for Phase 2 to
    // decommission.
    expect(sql).not.toMatch(/agos_business_people_stage_check/);
    expect(sql).not.toMatch(/CHECK \(stage IN/);
  });

  it('comments stage column to document free-form decision', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN agos_business_people\.stage/);
    expect(sql).toMatch(/Free-form contact-tier label/);
  });

  // ─── interactions ALTER ────────────────────────────────────────────────

  it('defensive remaps interaction_type drift to "note" before CHECK', () => {
    const remap = sql.indexOf(
      "UPDATE agos_business_interactions\n   SET interaction_type = 'note'",
    );
    const check = sql.indexOf(
      'ADD CONSTRAINT agos_business_interactions_interaction_type_check',
    );
    expect(remap).toBeGreaterThan(0);
    expect(check).toBeGreaterThan(remap);
  });

  it('adds CHECK on interactions.interaction_type covering the 9 canonical values', () => {
    expect(sql).toMatch(
      /agos_business_interactions_interaction_type_check[\s\S]*?CHECK \(interaction_type IN \('call','email','meeting','demo','proposal','follow_up','note','linkedin','other'\)\)/,
    );
  });

  // ─── settings new table ────────────────────────────────────────────────

  it('creates agos_business_settings idempotently', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS agos_business_settings/);
  });

  it('settings has UNIQUE(user_id)', () => {
    expect(sql).toMatch(/user_id\s+UUID NOT NULL UNIQUE/);
  });

  it('settings carries the full Phase-1 column set', () => {
    const required = [
      "business_name               TEXT NOT NULL DEFAULT ''",
      'logo_url                    TEXT,',
      "address                     TEXT NOT NULL DEFAULT ''",
      'tax_id                      TEXT,',
      "default_currency            TEXT NOT NULL DEFAULT 'USD'",
      "invoice_number_prefix       TEXT NOT NULL DEFAULT 'INV'",
      "quote_number_prefix         TEXT NOT NULL DEFAULT 'Q'",
      "default_payment_terms       TEXT NOT NULL DEFAULT 'net_30'",
      'default_hourly_rate_cents   BIGINT,',
      "accent_color                TEXT NOT NULL DEFAULT 'teal'",
      "metadata                    JSONB NOT NULL DEFAULT '{}'::jsonb",
    ];
    for (const col of required) expect(sql).toContain(col);
  });

  it('settings logo_url comment documents the URL-only contract', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN agos_business_settings\.logo_url/);
    expect(sql).toMatch(/MCP storage-transfer contract/);
  });

  it('settings tax_id comment documents free-form rationale', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN agos_business_settings\.tax_id/);
    expect(sql).toMatch(/Free-form tax identifier/);
  });

  it('settings has (user_id) index', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_business_settings_user_idx[\s\S]*?\(user_id\)/,
    );
  });

  it('settings does NOT declare a FK on user_id (v0.1.30 contract)', () => {
    const block = sql.match(
      /CREATE TABLE IF NOT EXISTS agos_business_settings \(([\s\S]*?)\);/,
    );
    expect(block?.[1]).toBeTruthy();
    expect(block?.[1]).not.toMatch(/user_id[^,]*REFERENCES/);
  });

  // ─── Downgrade ─────────────────────────────────────────────────────────

  it('downgrade drops settings table', () => {
    expect(sql).toMatch(/DROP TABLE IF EXISTS agos_business_settings/);
  });

  it('downgrade drops interaction_type CHECK', () => {
    expect(sql).toMatch(
      /DROP CONSTRAINT IF EXISTS agos_business_interactions_interaction_type_check/,
    );
  });

  it('downgrade drops org_type CHECK', () => {
    expect(sql).toMatch(
      /DROP CONSTRAINT IF EXISTS agos_business_orgs_org_type_check/,
    );
  });

  it('downgrade drops every added column on people', () => {
    expect(sql).toMatch(/agos_business_people\s*\n\s*DROP COLUMN IF EXISTS metadata/);
    expect(sql).toMatch(/agos_business_people\s*\n\s*DROP COLUMN IF EXISTS archived_at/);
    expect(sql).toMatch(/agos_business_people\s*\n\s*DROP COLUMN IF EXISTS address/);
    expect(sql).toMatch(/agos_business_people\s*\n\s*DROP COLUMN IF EXISTS description_md/);
  });

  it('downgrade drops every added column on orgs', () => {
    expect(sql).toMatch(/agos_business_orgs\s*\n\s*DROP COLUMN IF EXISTS metadata/);
    expect(sql).toMatch(/agos_business_orgs\s*\n\s*DROP COLUMN IF EXISTS archived_at/);
    expect(sql).toMatch(/agos_business_orgs\s*\n\s*DROP COLUMN IF EXISTS tags/);
    expect(sql).toMatch(/agos_business_orgs\s*\n\s*DROP COLUMN IF EXISTS address/);
    expect(sql).toMatch(/agos_business_orgs\s*\n\s*DROP COLUMN IF EXISTS description_md/);
  });

  it('downgrade documents the one-way nature of the tags migration', () => {
    expect(sql).toMatch(/one-way/i);
  });

  // ─── Footgun guards ────────────────────────────────────────────────────

  it('uses op.execute with the raw SQL constants (no text() bind risk)', () => {
    expect(sql).toMatch(/op\.execute\(_UPGRADE_SQL\)/);
    expect(sql).toMatch(/op\.execute\(_DOWNGRADE_SQL\)/);
  });

  it('does NOT wrap raw SQL in sqlalchemy.text()', () => {
    const upgradeFn = sql.match(/def upgrade\(\) -> None:([\s\S]*?)def downgrade/);
    const downgradeFn = sql.match(/def downgrade\(\) -> None:([\s\S]*)/);
    expect(upgradeFn?.[1] ?? '').not.toMatch(/op\.execute\(text\(/);
    expect(downgradeFn?.[1] ?? '').not.toMatch(/op\.execute\(text\(/);
  });

  it('zero :<word> bind-marker patterns inside the SQL bodies', () => {
    const bodies = sql.match(/r"""[\s\S]*?"""/g) ?? [];
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      const noCasts = body.replace(/::[A-Za-z_][A-Za-z0-9_]*/g, '');
      const matches = noCasts.match(/(?<![A-Za-z0-9:])[A-Za-z_]?:[A-Za-z_][A-Za-z0-9_]*/g);
      const real = (matches ?? []).filter(
        (m) => !/^https?:/i.test(m) && !/^[a-z]+:\/\//i.test(m),
      );
      expect(real).toEqual([]);
    }
  });

  it('module-level revision metadata wired (alembic discovery)', () => {
    expect(sql).toMatch(/from alembic import op/);
    expect(sql).toMatch(/branch_labels: Union\[str, Sequence\[str\], None\] = None/);
    expect(sql).toMatch(/depends_on: Union\[str, Sequence\[str\], None\] = None/);
  });

  it('docstring documents the JSONB→TEXT[] migration plan', () => {
    expect(sql).toMatch(/JSONB→TEXT\[\]/);
    expect(sql).toMatch(/Defense-in-depth/i);
  });

  it('docstring documents the no-FK contract on settings', () => {
    expect(sql).toMatch(/v0\.1\.30 cross-OS contract/);
  });

  it('docstring documents the stage free-form decision', () => {
    expect(sql).toMatch(/Phase 2's[\s\S]*?agos_business_deals/);
  });
});

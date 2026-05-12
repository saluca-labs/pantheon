/**
 * Research OS Phase 6 — migration 0053 smoke test.
 *
 * Asserts structural properties of the milestones + dependencies +
 * reproducibility checks migration:
 *   - Revision identifier + down_revision wired correctly (catches a
 *     copy-paste of the stale plan-doc 0046 anchor / 0045 down_revision).
 *   - 3 new tables created with the documented column set + CHECKs.
 *   - Milestones table: 6-status CHECK, 4-priority CHECK, completed_at,
 *     is_blocker, blocked_reason, notes_md, JSONB metadata.
 *   - Dependencies: 4-kind CHECK (feeds/blocks/informs/replicates),
 *     2-status CHECK, no-self-loop CHECK, UNIQUE (from, to, kind) edge,
 *     NO FK on from_/to_ endpoints.
 *   - Reproducibility checks: 5-state CHECK, UNIQUE (experiment_id, item_key),
 *     NO CHECK on item_key value, NO FK on experiment_id.
 *   - Idempotent DDL (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
 *   - Indexes mirror Maker P6: milestone risk-tier partial index, blocker
 *     partial index, dependency open partial index.
 *   - Downgrade drops tables in reverse order.
 *   - Zero `:<word>` bind-marker patterns in raw SQL bodies (footgun).
 *   - op.execute uses string constants (not text(...)).
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../../../packages/database/alembic/versions/0053_research_phase6.py',
);
const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('migration 0053_research_phase6', () => {
  it('declares the correct revision identifier', () => {
    expect(sql).toMatch(/revision: str = "0053_research_phase6"/);
  });

  it('declares the correct down_revision (post-Phase-5 chain)', () => {
    expect(sql).toMatch(
      /down_revision: Union\[str, None\] = "0052_research_phase5"/,
    );
  });

  it('does NOT chain off the stale plan-doc revisions', () => {
    expect(sql).not.toMatch(/down_revision[^"]*"0045_research_phase5"/);
    expect(sql).not.toMatch(/revision: str = "0046_research_phase6"/);
  });

  // ─── agos_research_experiment_milestones ──────────────────────────────

  it('creates agos_research_experiment_milestones idempotently', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_research_experiment_milestones/,
    );
  });

  it('milestones table carries the full column set', () => {
    const required = [
      'id              UUID PRIMARY KEY',
      'experiment_id   UUID NOT NULL',
      'user_id         UUID NOT NULL',
      'title           TEXT NOT NULL',
      'due_at          DATE',
      "status          TEXT NOT NULL DEFAULT 'pending'",
      "priority        TEXT NOT NULL DEFAULT 'medium'",
      'is_blocker      BOOLEAN NOT NULL DEFAULT false',
      'blocked_reason  TEXT',
      'notes_md        TEXT',
      'completed_at    TIMESTAMPTZ',
      'metadata        JSONB',
    ];
    for (const col of required) expect(sql).toContain(col);
  });

  it('milestones status CHECK covers all 6 values', () => {
    expect(sql).toMatch(
      /CHECK \(status IN \('pending','at_risk','blocked','on_track','done','missed'\)\)/,
    );
  });

  it('milestones priority CHECK covers all 4 values', () => {
    expect(sql).toMatch(
      /CHECK \(priority IN \('low','medium','high','critical'\)\)/,
    );
  });

  it('milestones carries NO FK on experiment_id (v0.1.30 contract)', () => {
    const m = sql.match(
      /CREATE TABLE IF NOT EXISTS agos_research_experiment_milestones[\s\S]*?\);/,
    );
    expect(m).not.toBeNull();
    expect(m![0]).not.toMatch(/experiment_id[^,]*REFERENCES/i);
  });

  it('milestones has (experiment_id, due_at) partial index for deadline view', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_experiment_milestones_due_at_idx[\s\S]*?\(experiment_id, due_at\)[\s\S]*?WHERE due_at IS NOT NULL/,
    );
  });

  it('milestones has is_blocker partial index', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_experiment_milestones_blocker_idx[\s\S]*?\(is_blocker\)[\s\S]*?WHERE is_blocker = true/,
    );
  });

  it('milestones has risk-tier partial index (experiment_id, status)', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_experiment_milestones_risk_idx[\s\S]*?\(experiment_id, status\)[\s\S]*?WHERE status IN \('at_risk','blocked','missed'\)/,
    );
  });

  // ─── agos_research_experiment_dependencies ────────────────────────────

  it('creates agos_research_experiment_dependencies idempotently', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_research_experiment_dependencies/,
    );
  });

  it('dependencies carries the full column set', () => {
    const required = [
      'id                  UUID PRIMARY KEY',
      'user_id             UUID NOT NULL',
      'from_experiment_id  UUID NOT NULL',
      'to_experiment_id    UUID NOT NULL',
      "kind                TEXT NOT NULL DEFAULT 'feeds'",
      "status              TEXT NOT NULL DEFAULT 'open'",
      'notes               TEXT',
      'metadata            JSONB',
    ];
    for (const col of required) expect(sql).toContain(col);
  });

  it('dependencies kind CHECK covers all 4 values (feeds/blocks/informs/replicates)', () => {
    expect(sql).toMatch(
      /CHECK \(kind IN \('feeds','blocks','informs','replicates'\)\)/,
    );
  });

  it('dependencies status CHECK covers open + cleared', () => {
    expect(sql).toMatch(/CHECK \(status IN \('open','cleared'\)\)/);
  });

  it('dependencies has no-self-loop CHECK', () => {
    expect(sql).toMatch(
      /CHECK \(from_experiment_id != to_experiment_id\)/,
    );
  });

  it('dependencies has UNIQUE (from, to, kind) edge constraint', () => {
    expect(sql).toMatch(
      /UNIQUE \(from_experiment_id, to_experiment_id, kind\)/,
    );
  });

  it('dependencies carries NO FK on either endpoint (v0.1.30 contract)', () => {
    const m = sql.match(
      /CREATE TABLE IF NOT EXISTS agos_research_experiment_dependencies[\s\S]*?\);/,
    );
    expect(m).not.toBeNull();
    const body = m![0];
    expect(body).not.toMatch(/from_experiment_id[^,]*REFERENCES/i);
    expect(body).not.toMatch(/to_experiment_id[^,]*REFERENCES/i);
  });

  it('dependencies has (user_id, status) index', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_experiment_dependencies_user_status_idx[\s\S]*?\(user_id, status\)/,
    );
  });

  it('dependencies has partial open-edge index for Top Blockers', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_experiment_dependencies_open_idx[\s\S]*?\(user_id\)[\s\S]*?WHERE status = 'open'/,
    );
  });

  it('dependencies has from + to side indexes', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_experiment_dependencies_from_idx[\s\S]*?\(from_experiment_id\)/,
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_experiment_dependencies_to_idx[\s\S]*?\(to_experiment_id\)/,
    );
  });

  // ─── agos_research_reproducibility_checks ─────────────────────────────

  it('creates agos_research_reproducibility_checks idempotently', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_research_reproducibility_checks/,
    );
  });

  it('repro checks table carries the full column set', () => {
    const required = [
      'id              UUID PRIMARY KEY',
      'experiment_id   UUID NOT NULL',
      'user_id         UUID NOT NULL',
      'item_key        TEXT NOT NULL',
      "state           TEXT NOT NULL DEFAULT 'pending'",
      'evidence_url    TEXT',
      'notes           TEXT',
      'completed_at    TIMESTAMPTZ',
      'metadata        JSONB',
    ];
    for (const col of required) expect(sql).toContain(col);
  });

  it('repro state CHECK covers all 5 values', () => {
    expect(sql).toMatch(
      /CHECK \(state IN \('pending','in_progress','done','not_applicable','waived'\)\)/,
    );
  });

  it('repro carries UNIQUE (experiment_id, item_key)', () => {
    expect(sql).toMatch(/UNIQUE \(experiment_id, item_key\)/);
  });

  it('repro carries NO Postgres CHECK on item_key value (user-extensible)', () => {
    // Body of the repro table: ensure there is no CHECK clause that references
    // item_key against a fixed set.
    const m = sql.match(
      /CREATE TABLE IF NOT EXISTS agos_research_reproducibility_checks[\s\S]*?\);/,
    );
    expect(m).not.toBeNull();
    // Allow item_key in UNIQUE; just check no `CHECK ( item_key IN ... )` clause
    expect(m![0]).not.toMatch(/CHECK\s*\(\s*item_key\s+IN/i);
  });

  it('repro carries NO FK on experiment_id (v0.1.30 contract)', () => {
    const m = sql.match(
      /CREATE TABLE IF NOT EXISTS agos_research_reproducibility_checks[\s\S]*?\);/,
    );
    expect(m).not.toBeNull();
    expect(m![0]).not.toMatch(/experiment_id[^,]*REFERENCES/i);
  });

  it('repro has (experiment_id, state) index for state-bucketed listing', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_reproducibility_checks_experiment_state_idx[\s\S]*?\(experiment_id, state\)/,
    );
  });

  // ─── Downgrade ─────────────────────────────────────────────────────────

  it('downgrade drops the 3 tables in reverse order', () => {
    const dropMatches = Array.from(
      sql.matchAll(/DROP TABLE IF EXISTS (\w+);/g),
    ).map((m) => m[1]);
    expect(dropMatches).toEqual([
      'agos_research_reproducibility_checks',
      'agos_research_experiment_dependencies',
      'agos_research_experiment_milestones',
    ]);
  });

  // ─── Comment / documentation guards ────────────────────────────────────

  it('docstring documents the derived reproducibility_score rollup formula', () => {
    expect(sql).toMatch(/reproducibility_score\s*=\s*done\s*\/\s*\(pending\s*\+\s*in_progress\s*\+\s*done\)/);
    expect(sql).toMatch(/not_applicable[\s\S]*?waived[\s\S]*?EXCLUDED/i);
  });

  // ─── Footgun guards ────────────────────────────────────────────────────

  it('uses op.execute with raw string constant (no text() wrap)', () => {
    expect(sql).toMatch(/op\.execute\(_UPGRADE_SQL\)/);
    expect(sql).toMatch(/op\.execute\(_DOWNGRADE_SQL\)/);
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

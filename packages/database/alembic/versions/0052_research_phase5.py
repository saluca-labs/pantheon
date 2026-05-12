"""Research OS Phase 5 — Datasets + Protocols + PDF Export.

Revision ID: 0052_research_phase5
Revises: 0051_research_phase4
Create Date: 2026-05-12

Phase 5 of Research OS adds the per-experiment datasets table, the
workshop-global protocols library with version-history self-reference,
and the experiment-to-protocol join with version pinning. Three new
tables, all under ``agos_research_*``:

  1. ``agos_research_datasets`` — per-experiment. ``user_id NOT NULL``,
       ``experiment_id NOT NULL`` (NO FK per platform v0.1.30 contract),
       ``name NOT NULL``, ``kind`` CHECK in
       ``(tabular, image, timeseries, sequence, sim, other)`` DEFAULT
       ``tabular``, ``url NOT NULL`` (URL-only per MCP storage-transfer
       contract; no binary), optional ``version`` / ``size_bytes`` /
       ``checksum``, ``archived BOOLEAN NOT NULL DEFAULT false`` (was
       raw data archived externally — feeds reproducibility checklist
       in Phase 6), ``published_doi TEXT``, ``notes_md TEXT``,
       ``tags TEXT[] NOT NULL DEFAULT '{}'``, ``metadata JSONB``.
       Indexes: ``(experiment_id)``, ``(user_id, archived)``, GIN on
       ``tags``.

  2. ``agos_research_protocols`` — workshop-global. ``user_id NOT NULL``,
       ``title NOT NULL``, ``version TEXT NOT NULL DEFAULT '1.0'``,
       ``body_md NOT NULL DEFAULT ''``, ``kind`` CHECK in
       ``(method, sop, analysis, code_pipeline, other)`` DEFAULT
       ``method``, ``attached_urls TEXT[] NOT NULL DEFAULT '{}'``,
       ``tags TEXT[] NOT NULL DEFAULT '{}'``, ``parent_protocol_id``
       nullable self-reference (NO FK to allow soft tree-walks),
       ``metadata JSONB``. Indexes: ``(user_id, kind)``, partial
       ``(parent_protocol_id) WHERE parent_protocol_id IS NOT NULL``,
       GIN on ``tags``.

  3. ``agos_research_experiment_protocols`` — join with version pinning.
       ``experiment_id NOT NULL`` (NO FK — platform contract),
       ``protocol_id`` FK CASCADE → protocols, ``pinned_version NOT NULL``
       (the version string at link time — reproducibility anchor),
       ``notes TEXT``. UNIQUE
       ``(experiment_id, protocol_id, pinned_version)`` — same pair can
       pin different versions. Indexes ``(experiment_id)``,
       ``(protocol_id)``.

Locked design decisions
-----------------------
- **Datasets are per-experiment.** No workshop-global data catalogue —
  that's a future Data OS.
- **Protocols pin by string, not FK.** ``pinned_version='1.2.0'`` makes
  the experiment reproducible against the methods doc even when
  ``body_md`` evolves. Loading a pinned protocol: search the parent-
  protocol tree (via ``parent_protocol_id`` walk) for an exact
  ``version`` match; fall back to the root's content if no match.
- **No FK on ``experiment_id``** in datasets or experiment_protocols —
  platform v0.1.30 contract.
- **No FK on ``parent_protocol_id``** so soft tree-walks survive a
  delete of an intermediate node; the route layer never hard-deletes
  the root anyway, but the constraint shape keeps the option open.

Idempotency
-----------
All DDL is idempotent: ``CREATE TABLE IF NOT EXISTS`` /
``CREATE INDEX IF NOT EXISTS`` / ``CREATE UNIQUE INDEX IF NOT EXISTS``.
Safe to re-run on a partially-applied database.

Bind-marker safety
------------------
Per prior-phase footgun: SQLAlchemy's ``text()`` parses ``:word``
patterns as bind markers. This module uses ``op.execute`` with a raw
string constant (NOT ``op.execute(text(...))``); the SQL bodies carry
zero ``:<word>`` patterns (the test guard asserts this).

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0052_research_phase5"
down_revision: Union[str, None] = "0051_research_phase4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- 1. agos_research_datasets -----------------------------------------------
CREATE TABLE IF NOT EXISTS agos_research_datasets (
    id              UUID PRIMARY KEY,
    user_id         UUID NOT NULL,
    experiment_id   UUID NOT NULL,
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL DEFAULT 'tabular',
    url             TEXT NOT NULL,
    version         TEXT,
    size_bytes      BIGINT,
    checksum        TEXT,
    archived        BOOLEAN NOT NULL DEFAULT false,
    published_doi   TEXT,
    notes_md        TEXT,
    tags            TEXT[] NOT NULL DEFAULT '{}',
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_research_datasets_kind_chk
        CHECK (kind IN ('tabular','image','timeseries','sequence','sim','other'))
);

COMMENT ON TABLE agos_research_datasets IS
  'Per-experiment dataset pointers. URL-only per the MCP storage-transfer contract; binary content is governed by that contract. archived flag captures whether raw data was archived externally — feeds the Phase 6 reproducibility checklist.';

COMMENT ON COLUMN agos_research_datasets.experiment_id IS
  'Soft pointer to agos_research_experiments(id). No FK per platform v0.1.30 contract; the BFF route layer enforces ownership via JOIN.';

COMMENT ON COLUMN agos_research_datasets.url IS
  'External URL to the hosted dataset bytes or landing page. Binary content is governed by the MCP storage-transfer contract (docs/architecture/mcp-storage-transfer.md); this column never stores binary.';

COMMENT ON COLUMN agos_research_datasets.archived IS
  'Was the raw data archived externally (e.g. Zenodo, institutional repo) — semantic flag for reproducibility, NOT a soft-delete marker.';

CREATE INDEX IF NOT EXISTS agos_research_datasets_experiment_idx
    ON agos_research_datasets (experiment_id);

CREATE INDEX IF NOT EXISTS agos_research_datasets_user_archived_idx
    ON agos_research_datasets (user_id, archived);

CREATE INDEX IF NOT EXISTS agos_research_datasets_tags_gin_idx
    ON agos_research_datasets USING gin (tags);

-- 2. agos_research_protocols ----------------------------------------------
CREATE TABLE IF NOT EXISTS agos_research_protocols (
    id                    UUID PRIMARY KEY,
    user_id               UUID NOT NULL,
    title                 TEXT NOT NULL,
    version               TEXT NOT NULL DEFAULT '1.0',
    body_md               TEXT NOT NULL DEFAULT '',
    kind                  TEXT NOT NULL DEFAULT 'method',
    attached_urls         TEXT[] NOT NULL DEFAULT '{}',
    tags                  TEXT[] NOT NULL DEFAULT '{}',
    parent_protocol_id    UUID,
    metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_research_protocols_kind_chk
        CHECK (kind IN ('method','sop','analysis','code_pipeline','other'))
);

COMMENT ON TABLE agos_research_protocols IS
  'Workshop-global protocols library with version-history self-reference. parent_protocol_id walks the tree; the root has parent_protocol_id IS NULL. NO FK on parent_protocol_id so soft tree-walks survive a delete of an intermediate node.';

COMMENT ON COLUMN agos_research_protocols.parent_protocol_id IS
  'Soft self-reference to the previous-version row. NULL on the root. NO FK so tree-walks survive deletes of intermediate nodes.';

COMMENT ON COLUMN agos_research_protocols.version IS
  'Free-form version string (e.g. 1.0, 1.2.0, 2024-05-12). When experiments pin a protocol they record this string at link time.';

CREATE INDEX IF NOT EXISTS agos_research_protocols_user_kind_idx
    ON agos_research_protocols (user_id, kind);

-- Partial index — only rows that are children carry the parent pointer.
CREATE INDEX IF NOT EXISTS agos_research_protocols_parent_partial_idx
    ON agos_research_protocols (parent_protocol_id)
    WHERE parent_protocol_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS agos_research_protocols_tags_gin_idx
    ON agos_research_protocols USING gin (tags);

-- 3. agos_research_experiment_protocols (join with version pinning) -------
CREATE TABLE IF NOT EXISTS agos_research_experiment_protocols (
    id               UUID PRIMARY KEY,
    experiment_id    UUID NOT NULL,
    protocol_id      UUID NOT NULL REFERENCES agos_research_protocols(id) ON DELETE CASCADE,
    pinned_version   TEXT NOT NULL,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_research_experiment_protocols_unique_pin
        UNIQUE (experiment_id, protocol_id, pinned_version)
);

COMMENT ON TABLE agos_research_experiment_protocols IS
  'Many-to-many between experiments and protocols, with version pinning. Same (experiment, protocol) pair can pin different versions — the UNIQUE triple keeps each pin distinct. pinned_version is a frozen string at link time; loading walks parent_protocol_id for an exact match and falls back to the root.';

COMMENT ON COLUMN agos_research_experiment_protocols.experiment_id IS
  'Soft pointer to agos_research_experiments(id). No FK per platform v0.1.30 contract; the BFF route layer enforces ownership via JOIN.';

COMMENT ON COLUMN agos_research_experiment_protocols.pinned_version IS
  'Frozen version string at link time. Reproducibility anchor — the experiment is reproducible against this exact methods version even when the protocol body_md evolves later.';

CREATE INDEX IF NOT EXISTS agos_research_experiment_protocols_experiment_idx
    ON agos_research_experiment_protocols (experiment_id);

CREATE INDEX IF NOT EXISTS agos_research_experiment_protocols_protocol_idx
    ON agos_research_experiment_protocols (protocol_id);
"""


_DOWNGRADE_SQL = r"""
-- Reverse order vs upgrade.
DROP INDEX IF EXISTS agos_research_experiment_protocols_protocol_idx;
DROP INDEX IF EXISTS agos_research_experiment_protocols_experiment_idx;
DROP TABLE IF EXISTS agos_research_experiment_protocols;

DROP INDEX IF EXISTS agos_research_protocols_tags_gin_idx;
DROP INDEX IF EXISTS agos_research_protocols_parent_partial_idx;
DROP INDEX IF EXISTS agos_research_protocols_user_kind_idx;
DROP TABLE IF EXISTS agos_research_protocols;

DROP INDEX IF EXISTS agos_research_datasets_tags_gin_idx;
DROP INDEX IF EXISTS agos_research_datasets_user_archived_idx;
DROP INDEX IF EXISTS agos_research_datasets_experiment_idx;
DROP TABLE IF EXISTS agos_research_datasets;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)

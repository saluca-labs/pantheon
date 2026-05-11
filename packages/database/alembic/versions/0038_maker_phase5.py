"""Maker OS Phase 5 — spec sheets + references library + project-references join.

Revision ID: 0038_maker_phase5
Revises: 0037_maker_phase4
Create Date: 2026-05-11

Phase 5 adds three new tables that turn Maker projects into self-contained
build packets you can hand to a teammate (or a future-you) and have all the
context. Spec sheets are datasheets / drawings / certificates polymorphically
attached to one of part / tool / project; references are a generic library
of papers / tutorials / standards that can be linked to many projects via a
join table.

The shape is locked by ``apps/platform-web/content/agentic-os/maker.md``
(Phase 5 section at the top of the file) and the per-task spec in the
v0.1.34 build prompt.

New tables (all under ``agos_maker_*``)::

    agos_maker_spec_sheets         -- polymorphic datasheets / drawings
    agos_maker_references          -- per-user generic reference library
    agos_maker_project_references  -- N:M project <-> reference join

Polymorphic attachment
----------------------
``agos_maker_spec_sheets`` attaches to exactly one of three owners — a
catalog part, a workshop tool, or a project. The three nullable FK columns
(``part_id``, ``tool_id``, ``project_id``) are gated by a CHECK constraint
that requires exactly one to be non-NULL. ``project_id`` carries no FK —
that matches the v0.1.30 platform contract where per-OS project UUIDs are
NOT enforced as FKs from ``agos_audit`` and related cross-cutting tables.

URL columns
-----------
``url`` on both ``agos_maker_spec_sheets`` and ``agos_maker_references`` is
a free-form URL only. Column comments reference
``docs/architecture/mcp-storage-transfer.md`` for the MCP-mediated storage
workstream — matches the Phase 1-4 convention.

All DDL is idempotent (``CREATE TABLE IF NOT EXISTS``, ``CREATE INDEX IF
NOT EXISTS``). The downgrade drops indexes + tables in reverse FK order:
``agos_maker_project_references`` first (depends on references), then
``agos_maker_references`` and ``agos_maker_spec_sheets`` (independent).

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0038_maker_phase5"
down_revision: Union[str, None] = "0037_maker_phase4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- 1. agos_maker_spec_sheets ------------------------------------------------

CREATE TABLE IF NOT EXISTS agos_maker_spec_sheets (
    id           UUID        PRIMARY KEY,
    user_id      UUID        NOT NULL,
    title        TEXT        NOT NULL,
    kind         TEXT        NOT NULL DEFAULT 'datasheet',
    url          TEXT        NOT NULL,
    notes        TEXT        NULL,
    revision     TEXT        NULL,
    issued_at    DATE        NULL,
    part_id      UUID        NULL
                             REFERENCES agos_maker_part_catalog(id)
                             ON DELETE CASCADE,
    tool_id      UUID        NULL
                             REFERENCES agos_maker_tools(id)
                             ON DELETE CASCADE,
    project_id   UUID        NULL,
    tags         TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    metadata     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_maker_spec_sheets_kind_chk
        CHECK (kind IN ('datasheet','spec','manual','drawing',
                        'certificate','other')),
    CONSTRAINT agos_maker_spec_sheets_attachment_chk
        CHECK (
          (CASE WHEN part_id    IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN tool_id    IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN project_id IS NOT NULL THEN 1 ELSE 0 END) = 1
        )
);

CREATE INDEX IF NOT EXISTS agos_maker_spec_sheets_user_kind_idx
    ON agos_maker_spec_sheets (user_id, kind);

CREATE INDEX IF NOT EXISTS agos_maker_spec_sheets_part_idx
    ON agos_maker_spec_sheets (part_id)
    WHERE part_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS agos_maker_spec_sheets_tool_idx
    ON agos_maker_spec_sheets (tool_id)
    WHERE tool_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS agos_maker_spec_sheets_project_idx
    ON agos_maker_spec_sheets (project_id)
    WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS agos_maker_spec_sheets_tags_gin_idx
    ON agos_maker_spec_sheets USING GIN (tags);

COMMENT ON COLUMN agos_maker_spec_sheets.url IS
  'External URL. Asset upload via MCP-mediated storage transfer is a future workstream; see docs/architecture/mcp-storage-transfer.md.';

COMMENT ON COLUMN agos_maker_spec_sheets.project_id IS
  'Per-OS project UUID; NOT a FK by design. Matches the v0.1.30 platform contract where agos_audit.project_id (and analogous cross-cutting columns) carry per-OS UUIDs without referential integrity to a single project table.';

COMMENT ON COLUMN agos_maker_spec_sheets.kind IS
  'Document taxonomy: datasheet (vendor electrical/mechanical spec), spec (internal requirements), manual (operator handbook), drawing (mechanical/electrical schematic), certificate (compliance/test report), other.';

COMMENT ON COLUMN agos_maker_spec_sheets.revision IS
  'Free-form revision tag (e.g. "Rev B", "v1.2", "2026-04 issue"). Stored as text so the UI can range across vendor conventions without a migration.';

-- 2. agos_maker_references --------------------------------------------------

CREATE TABLE IF NOT EXISTS agos_maker_references (
    id            UUID        PRIMARY KEY,
    user_id       UUID        NOT NULL,
    title         TEXT        NOT NULL,
    kind          TEXT        NOT NULL DEFAULT 'link',
    url           TEXT        NOT NULL,
    authors       TEXT        NULL,
    publisher     TEXT        NULL,
    published_at  DATE        NULL,
    notes         TEXT        NULL,
    tags          TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_maker_references_kind_chk
        CHECK (kind IN ('paper','tutorial','standard','article',
                        'video','book','link','other'))
);

CREATE INDEX IF NOT EXISTS agos_maker_references_user_kind_idx
    ON agos_maker_references (user_id, kind);

CREATE INDEX IF NOT EXISTS agos_maker_references_tags_gin_idx
    ON agos_maker_references USING GIN (tags);

COMMENT ON COLUMN agos_maker_references.url IS
  'External URL. Asset upload via MCP-mediated storage transfer is a future workstream; see docs/architecture/mcp-storage-transfer.md.';

COMMENT ON COLUMN agos_maker_references.kind IS
  'Reference taxonomy: paper (peer-reviewed / preprint), tutorial (how-to), standard (IEEE/ISO/etc), article (blog/news), video (talk/lecture), book, link (generic), other.';

-- 3. agos_maker_project_references -----------------------------------------

CREATE TABLE IF NOT EXISTS agos_maker_project_references (
    id            UUID        PRIMARY KEY,
    project_id    UUID        NOT NULL,
    reference_id  UUID        NOT NULL
                              REFERENCES agos_maker_references(id)
                              ON DELETE CASCADE,
    notes         TEXT        NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_maker_project_references_project_reference_unique
        UNIQUE (project_id, reference_id)
);

CREATE INDEX IF NOT EXISTS agos_maker_project_references_project_idx
    ON agos_maker_project_references (project_id);

COMMENT ON COLUMN agos_maker_project_references.project_id IS
  'Per-OS project UUID; NOT a FK by design. Matches the v0.1.30 platform contract for cross-cutting per-OS columns.';
"""


_DOWNGRADE_SQL = r"""
-- Reverse FK order: project_references first (depends on references), then
-- references and spec_sheets (independent of each other).

DROP INDEX IF EXISTS agos_maker_project_references_project_idx;
DROP INDEX IF EXISTS agos_maker_references_tags_gin_idx;
DROP INDEX IF EXISTS agos_maker_references_user_kind_idx;
DROP INDEX IF EXISTS agos_maker_spec_sheets_tags_gin_idx;
DROP INDEX IF EXISTS agos_maker_spec_sheets_project_idx;
DROP INDEX IF EXISTS agos_maker_spec_sheets_tool_idx;
DROP INDEX IF EXISTS agos_maker_spec_sheets_part_idx;
DROP INDEX IF EXISTS agos_maker_spec_sheets_user_kind_idx;

DROP TABLE IF EXISTS agos_maker_project_references;
DROP TABLE IF EXISTS agos_maker_references;
DROP TABLE IF EXISTS agos_maker_spec_sheets;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)

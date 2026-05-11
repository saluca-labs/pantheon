"""Maker OS Phase 4 — tools + consumables + maintenance + project-tools join.

Revision ID: 0037_maker_phase4
Revises: 0036_maker_phase3
Create Date: 2026-05-11

Phase 4 adds the workshop-tools surface to Maker OS. The unit is the tool —
workshop-global, NOT project-scoped — with consumables that wear out (bits,
blades, filters), a maintenance event log per tool, and a join table linking
tools to the projects that need them.

The shape is locked by ``apps/platform-web/content/agentic-os/maker.md``
(Phase 4 section) and the per-task spec in the v0.1.33 build prompt.

New tables (all under ``agos_maker_*``)::

    agos_maker_tools              -- workshop-global tools (user-scoped)
    agos_maker_tool_consumables   -- per-tool wearables (bits, blades, filters)
    agos_maker_tool_maintenance   -- per-tool maintenance event log
    agos_maker_project_tools      -- N:M join (project <-> tool)

URL columns
-----------
``image_url``, ``datasheet_url``, and ``manual_url`` are free-form URLs only.
Column comments reference ``docs/architecture/mcp-storage-transfer.md`` for the
eventual MCP-mediated storage pathway — matches Phase 1/2/3 convention.

All DDL is idempotent (``CREATE TABLE IF NOT EXISTS``, ``CREATE INDEX IF NOT
EXISTS``). The downgrade drops indexes + tables in dependency order:
``agos_maker_project_tools`` first (depends on both tools + projects), then
``agos_maker_tool_maintenance`` and ``agos_maker_tool_consumables`` (both
cascade from tools), then ``agos_maker_tools`` last.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0037_maker_phase4"
down_revision: Union[str, None] = "0036_maker_phase3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- 1. agos_maker_tools ------------------------------------------------------

CREATE TABLE IF NOT EXISTS agos_maker_tools (
    id             UUID        PRIMARY KEY,
    user_id        UUID        NOT NULL,
    name           TEXT        NOT NULL,
    kind           TEXT        NOT NULL,
    manufacturer   TEXT        NULL,
    model          TEXT        NULL,
    serial         TEXT        NULL,
    location       TEXT        NULL,
    status         TEXT        NOT NULL DEFAULT 'active',
    purchased_at   DATE        NULL,
    image_url      TEXT        NULL,
    datasheet_url  TEXT        NULL,
    manual_url     TEXT        NULL,
    notes          TEXT        NULL,
    tags           TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    metadata       JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_maker_tools_kind_chk
        CHECK (kind IN ('cnc','3d_printer','laser','soldering',
                        'oscilloscope','multimeter','handtool',
                        'powertool','other')),
    CONSTRAINT agos_maker_tools_status_chk
        CHECK (status IN ('active','down','retired'))
);

CREATE INDEX IF NOT EXISTS agos_maker_tools_user_status_idx
    ON agos_maker_tools (user_id, status);

CREATE INDEX IF NOT EXISTS agos_maker_tools_tags_gin_idx
    ON agos_maker_tools USING GIN (tags);

COMMENT ON COLUMN agos_maker_tools.image_url IS
  'External URL. Asset upload via MCP-mediated storage transfer is a future workstream; see docs/architecture/mcp-storage-transfer.md.';

COMMENT ON COLUMN agos_maker_tools.datasheet_url IS
  'External URL. Asset upload via MCP-mediated storage transfer is a future workstream; see docs/architecture/mcp-storage-transfer.md.';

COMMENT ON COLUMN agos_maker_tools.manual_url IS
  'External URL. Asset upload via MCP-mediated storage transfer is a future workstream; see docs/architecture/mcp-storage-transfer.md.';

COMMENT ON COLUMN agos_maker_tools.status IS
  'Lifecycle pill: active = in service; down = broken/needs repair; retired = removed from workshop but kept for history.';

-- 2. agos_maker_tool_consumables -------------------------------------------

CREATE TABLE IF NOT EXISTS agos_maker_tool_consumables (
    id                UUID        PRIMARY KEY,
    tool_id           UUID        NOT NULL
                                  REFERENCES agos_maker_tools(id)
                                  ON DELETE CASCADE,
    name              TEXT        NOT NULL,
    kind              TEXT        NULL,
    hours_remaining   NUMERIC     NULL,
    max_hours         NUMERIC     NULL,
    last_replaced_at  TIMESTAMPTZ NULL,
    notes             TEXT        NULL,
    metadata          JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agos_maker_tool_consumables_tool_idx
    ON agos_maker_tool_consumables (tool_id);

COMMENT ON COLUMN agos_maker_tool_consumables.kind IS
  'Free-form taxonomy hint (bit/blade/filter/nozzle/endmill/other). Stored as text so the UI can extend the picker without a migration.';

COMMENT ON COLUMN agos_maker_tool_consumables.hours_remaining IS
  'Remaining runtime, in hours, before this consumable needs replacement. NULL when not tracked. The UI surfaces a percent-remaining bar when both hours_remaining and max_hours are set.';

-- 3. agos_maker_tool_maintenance -------------------------------------------

CREATE TABLE IF NOT EXISTS agos_maker_tool_maintenance (
    id            UUID        PRIMARY KEY,
    tool_id       UUID        NOT NULL
                              REFERENCES agos_maker_tools(id)
                              ON DELETE CASCADE,
    event_kind    TEXT        NOT NULL,
    performed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    cost_cents    INT         NULL,
    currency      TEXT        NOT NULL DEFAULT 'USD',
    vendor        TEXT        NULL,
    notes         TEXT        NULL,
    next_due_at   TIMESTAMPTZ NULL,
    metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_maker_tool_maintenance_event_kind_chk
        CHECK (event_kind IN ('cleaned','serviced','calibrated',
                              'repaired','inspected'))
);

CREATE INDEX IF NOT EXISTS agos_maker_tool_maintenance_tool_performed_idx
    ON agos_maker_tool_maintenance (tool_id, performed_at DESC);

COMMENT ON COLUMN agos_maker_tool_maintenance.next_due_at IS
  'When the next maintenance of this kind is expected. NULL when undated; the UI surfaces a days-until-next badge when set.';

COMMENT ON COLUMN agos_maker_tool_maintenance.cost_cents IS
  'Out-of-pocket cost in integer cents. NULL when free / unknown. Currency stored alongside (default USD).';

-- 4. agos_maker_project_tools ----------------------------------------------

CREATE TABLE IF NOT EXISTS agos_maker_project_tools (
    id          UUID        PRIMARY KEY,
    project_id  UUID        NOT NULL
                            REFERENCES agos_maker_projects(id)
                            ON DELETE CASCADE,
    tool_id     UUID        NOT NULL
                            REFERENCES agos_maker_tools(id)
                            ON DELETE CASCADE,
    required    BOOLEAN     NOT NULL DEFAULT true,
    notes       TEXT        NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_maker_project_tools_project_tool_unique
        UNIQUE (project_id, tool_id)
);

CREATE INDEX IF NOT EXISTS agos_maker_project_tools_project_idx
    ON agos_maker_project_tools (project_id);

COMMENT ON COLUMN agos_maker_project_tools.required IS
  'true = this build cannot proceed without this tool; false = nice-to-have. UI shows a red dot vs a grey dot.';
"""


_DOWNGRADE_SQL = r"""
-- Reverse dependency order: project_tools first (cross-FK between projects and
-- tools), then tool_maintenance and tool_consumables (both cascade from
-- tools), then tools last.

DROP INDEX IF EXISTS agos_maker_project_tools_project_idx;
DROP INDEX IF EXISTS agos_maker_tool_maintenance_tool_performed_idx;
DROP INDEX IF EXISTS agos_maker_tool_consumables_tool_idx;
DROP INDEX IF EXISTS agos_maker_tools_tags_gin_idx;
DROP INDEX IF EXISTS agos_maker_tools_user_status_idx;

DROP TABLE IF EXISTS agos_maker_project_tools;
DROP TABLE IF EXISTS agos_maker_tool_maintenance;
DROP TABLE IF EXISTS agos_maker_tool_consumables;
DROP TABLE IF EXISTS agos_maker_tools;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)

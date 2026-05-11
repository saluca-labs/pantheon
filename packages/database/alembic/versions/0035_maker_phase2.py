"""Maker OS Phase 2 — BOM + parts catalog + suppliers.

Revision ID: 0035_maker_phase2
Revises: 0034_agos_audit_drop_project_fk
Create Date: 2026-05-11

Phase 2 replaces the per-project flat ``agos_maker_parts`` list (Phase 0) with
a workshop-global parts catalog, supplier directory, and per-project BOM. The
shape is locked by ``apps/platform-web/content/agentic-os/maker.md`` (Phase 2
section).

New tables (all under ``agos_maker_*``)::

    agos_maker_part_catalog       -- user-scoped logical SKU rows
    agos_maker_suppliers          -- supplier directory
    agos_maker_part_supplier_links  -- N:M catalog <-> supplier
    agos_maker_part_variants      -- optional variants (size/colour) per catalog row
    agos_maker_bom_lines          -- per-project BOM lines

Data migration (break-and-rebuild)
----------------------------------
The legacy ``agos_maker_parts`` table is one-shot copied into the new schema
and then DROPPED. Cristian is the only user; the BuildsManager parts UI is
dark for the one-PR window between this migration shipping and the Phase 2 UI
landing on top of it.

Copy rules:

* One ``agos_maker_part_catalog`` row per distinct
  ``(user_id, name, category, unit)`` tuple, where ``user_id`` is resolved
  via the project that owns each legacy part row.
* ``quantity_on_hand`` aggregates the legacy ``quantity`` for rows that had
  ``in_stock = true``; rows with ``in_stock = false`` contribute 0 to the
  catalog on-hand count but still produce a BOM line so the demand is
  preserved.
* One ``agos_maker_bom_lines`` row per legacy ``agos_maker_parts`` row,
  pointing at the matching catalog row, carrying the original quantity into
  ``quantity_needed`` and the original ``notes`` straight through.

After the copy, ``agos_maker_parts`` is DROPPED. The downgrade re-creates the
legacy table from the new schema; data does not fully round-trip (variants and
supplier-link enrichment are dropped, ``in_stock`` is reconstructed from a
deficit comparison rather than the original boolean).

URL columns
-----------
``datasheet_url`` and ``image_url`` are free-form URLs only. The MCP-mediated
storage transfer workstream owns the upload pathway; column comments reference
``docs/architecture/mcp-storage-transfer.md`` to match the Phase 1 pattern.

All DDL is idempotent (``CREATE TABLE IF NOT EXISTS``, ``CREATE INDEX IF NOT
EXISTS``); the data-migration ``INSERT … SELECT`` blocks no-op once the legacy
table is gone.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0035_maker_phase2"
down_revision: Union[str, None] = "0034_agos_audit_drop_project_fk"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- 1. agos_maker_suppliers --------------------------------------------------

CREATE TABLE IF NOT EXISTS agos_maker_suppliers (
    id            UUID        PRIMARY KEY,
    user_id       UUID        NOT NULL,
    name          TEXT        NOT NULL,
    homepage_url  TEXT        NULL,
    notes         TEXT        NULL,
    metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agos_maker_suppliers_user_idx
    ON agos_maker_suppliers (user_id, name);

COMMENT ON COLUMN agos_maker_suppliers.homepage_url IS
  'External URL. Asset upload via MCP-mediated storage transfer is a future workstream; see docs/architecture/mcp-storage-transfer.md.';

-- 2. agos_maker_part_catalog -----------------------------------------------

CREATE TABLE IF NOT EXISTS agos_maker_part_catalog (
    id                     UUID        PRIMARY KEY,
    user_id                UUID        NOT NULL,
    name                   TEXT        NOT NULL,
    category               TEXT        NOT NULL DEFAULT 'other',
    manufacturer           TEXT        NULL,
    mfg_part_number        TEXT        NULL,
    unit                   TEXT        NOT NULL DEFAULT 'pcs',
    parent_part_catalog_id UUID        NULL
                                       REFERENCES agos_maker_part_catalog(id)
                                       ON DELETE SET NULL,
    quantity_on_hand       NUMERIC     NOT NULL DEFAULT 0,
    default_supplier_id    UUID        NULL
                                       REFERENCES agos_maker_suppliers(id)
                                       ON DELETE SET NULL,
    datasheet_url          TEXT        NULL,
    image_url              TEXT        NULL,
    tags                   TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    metadata               JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_maker_part_catalog_category_chk
        CHECK (category IN ('electronic','mechanical','fastener','material',
                            'tool','consumable','other'))
);

CREATE INDEX IF NOT EXISTS agos_maker_part_catalog_user_cat_idx
    ON agos_maker_part_catalog (user_id, category);

CREATE INDEX IF NOT EXISTS agos_maker_part_catalog_tags_gin_idx
    ON agos_maker_part_catalog USING GIN (tags);

CREATE INDEX IF NOT EXISTS agos_maker_part_catalog_parent_idx
    ON agos_maker_part_catalog (parent_part_catalog_id)
    WHERE parent_part_catalog_id IS NOT NULL;

COMMENT ON COLUMN agos_maker_part_catalog.datasheet_url IS
  'External URL. Asset upload via MCP-mediated storage transfer is a future workstream; see docs/architecture/mcp-storage-transfer.md.';

COMMENT ON COLUMN agos_maker_part_catalog.image_url IS
  'External URL. Asset upload via MCP-mediated storage transfer is a future workstream; see docs/architecture/mcp-storage-transfer.md.';

COMMENT ON COLUMN agos_maker_part_catalog.parent_part_catalog_id IS
  'Self-FK for sub-assemblies (catalog row composed of other catalog rows). NOT a recursive tree — one level of nesting only. SET NULL on delete.';

-- 3. agos_maker_part_supplier_links ----------------------------------------

CREATE TABLE IF NOT EXISTS agos_maker_part_supplier_links (
    id                   UUID        PRIMARY KEY,
    part_catalog_id      UUID        NOT NULL
                                     REFERENCES agos_maker_part_catalog(id)
                                     ON DELETE CASCADE,
    supplier_id          UUID        NOT NULL
                                     REFERENCES agos_maker_suppliers(id)
                                     ON DELETE CASCADE,
    supplier_part_number TEXT        NULL,
    unit_price_cents     INTEGER     NULL,
    currency             TEXT        NOT NULL DEFAULT 'USD',
    lead_time_days       INTEGER     NULL,
    url                  TEXT        NULL,
    last_priced_at       TIMESTAMPTZ NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agos_maker_part_supplier_links_part_idx
    ON agos_maker_part_supplier_links (part_catalog_id);

CREATE INDEX IF NOT EXISTS agos_maker_part_supplier_links_supplier_idx
    ON agos_maker_part_supplier_links (supplier_id);

COMMENT ON COLUMN agos_maker_part_supplier_links.url IS
  'External URL. Asset upload via MCP-mediated storage transfer is a future workstream; see docs/architecture/mcp-storage-transfer.md.';

-- 4. agos_maker_part_variants ----------------------------------------------

CREATE TABLE IF NOT EXISTS agos_maker_part_variants (
    id               UUID        PRIMARY KEY,
    part_catalog_id  UUID        NOT NULL
                                 REFERENCES agos_maker_part_catalog(id)
                                 ON DELETE CASCADE,
    variant_label    TEXT        NOT NULL,
    quantity_on_hand NUMERIC     NOT NULL DEFAULT 0,
    metadata         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agos_maker_part_variants_part_idx
    ON agos_maker_part_variants (part_catalog_id);

-- 5. agos_maker_bom_lines --------------------------------------------------

CREATE TABLE IF NOT EXISTS agos_maker_bom_lines (
    id               UUID        PRIMARY KEY,
    project_id       UUID        NOT NULL
                                 REFERENCES agos_maker_projects(id)
                                 ON DELETE CASCADE,
    part_catalog_id  UUID        NOT NULL
                                 REFERENCES agos_maker_part_catalog(id)
                                 ON DELETE CASCADE,
    variant_id       UUID        NULL
                                 REFERENCES agos_maker_part_variants(id)
                                 ON DELETE SET NULL,
    quantity_needed  NUMERIC     NOT NULL DEFAULT 1,
    notes            TEXT        NULL,
    priority         TEXT        NOT NULL DEFAULT 'normal',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_maker_bom_lines_priority_chk
        CHECK (priority IN ('low','normal','critical'))
);

CREATE INDEX IF NOT EXISTS agos_maker_bom_lines_project_idx
    ON agos_maker_bom_lines (project_id);

CREATE INDEX IF NOT EXISTS agos_maker_bom_lines_part_idx
    ON agos_maker_bom_lines (part_catalog_id);

-- 6. One-shot data migration from legacy agos_maker_parts ------------------
--
-- The block is wrapped in a pg_tables existence check so re-running the
-- migration (against a DB where the legacy table is already gone) is a no-op
-- rather than a hard error.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables
         WHERE schemaname = 'public' AND tablename = 'agos_maker_parts'
    ) THEN
        -- Step A: create a catalog row per distinct legacy (user_id, name,
        -- category, unit) tuple. user_id is resolved through the parent
        -- project (agos_maker_parts.build_id -> agos_maker_projects.id).
        --
        -- quantity_on_hand sums legacy `quantity` where in_stock = true so
        -- the new catalog count reflects the workshop's "what's actually
        -- on the shelf right now" view.
        INSERT INTO agos_maker_part_catalog
            (id, user_id, name, category, unit, quantity_on_hand, metadata)
        SELECT
            gen_random_uuid(),
            proj.user_id,
            p.name,
            p.category,
            p.unit,
            COALESCE(SUM(CASE WHEN p.in_stock THEN p.quantity ELSE 0 END), 0),
            jsonb_build_object(
                'migrated_from', 'agos_maker_parts',
                'migrated_at', now()::text
            )
        FROM agos_maker_parts p
        JOIN agos_maker_projects proj ON proj.id = p.build_id
        GROUP BY proj.user_id, p.name, p.category, p.unit;

        -- Step B: one BOM line per legacy parts row, mapped to the catalog
        -- row created in Step A. The catalog match is by the same
        -- (user_id, name, category, unit) tuple.
        INSERT INTO agos_maker_bom_lines
            (id, project_id, part_catalog_id, quantity_needed, notes)
        SELECT
            gen_random_uuid(),
            p.build_id,
            c.id,
            p.quantity,
            p.notes
        FROM agos_maker_parts p
        JOIN agos_maker_projects proj ON proj.id = p.build_id
        JOIN agos_maker_part_catalog c
          ON c.user_id  = proj.user_id
         AND c.name     = p.name
         AND c.category = p.category
         AND c.unit     = p.unit;

        -- Step C: DROP the legacy table. break-and-rebuild — the route +
        -- UI for the legacy parts path go away in the same PR. The
        -- supporting index was already dropped by the downgrade pair in
        -- 0004; the table-level DROP is enough here.
        DROP TABLE agos_maker_parts;
    END IF;
END $$;
"""


_DOWNGRADE_SQL = r"""
-- Reverse-build a best-effort legacy ``agos_maker_parts`` table. Data does
-- not fully round-trip (variants/supplier-link metadata are lost; in_stock is
-- reconstructed as "needed <= on_hand"); this matches the break-and-rebuild
-- contract documented in the upgrade docstring.

CREATE TABLE IF NOT EXISTS agos_maker_parts (
    id          UUID PRIMARY KEY,
    build_id    UUID NOT NULL REFERENCES agos_maker_projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'other',
    quantity    INT  NOT NULL DEFAULT 1,
    unit        TEXT NOT NULL DEFAULT 'pcs',
    notes       TEXT,
    source_url  TEXT,
    in_stock    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_maker_parts_build_idx
    ON agos_maker_parts (build_id, category, name);

-- Backfill legacy rows from bom_lines + catalog. Aggregate quantity_needed
-- per (project, catalog row); pick the first variant's url for source_url.
INSERT INTO agos_maker_parts
    (id, build_id, name, category, quantity, unit, notes, source_url, in_stock)
SELECT
    gen_random_uuid(),
    b.project_id,
    c.name,
    c.category,
    GREATEST(1, CAST(b.quantity_needed AS INT)),
    c.unit,
    b.notes,
    c.datasheet_url,
    (c.quantity_on_hand >= b.quantity_needed)
FROM agos_maker_bom_lines b
JOIN agos_maker_part_catalog c ON c.id = b.part_catalog_id;

-- Drop the new tables in dependency order.
DROP TABLE IF EXISTS agos_maker_bom_lines;
DROP TABLE IF EXISTS agos_maker_part_variants;
DROP TABLE IF EXISTS agos_maker_part_supplier_links;
DROP TABLE IF EXISTS agos_maker_part_catalog;
DROP TABLE IF EXISTS agos_maker_suppliers;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)

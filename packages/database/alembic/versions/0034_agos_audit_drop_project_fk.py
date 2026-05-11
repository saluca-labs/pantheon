"""Drop the agos_audit.project_id FK to agos_projects.

Revision ID: 0034_agos_audit_drop_project_fk
Revises: 0033_maker_phase1
Create Date: 2026-05-11

Phase 0 (0003_agentic_os.py) created ``agos_audit.project_id`` as a FK pointing
at ``agos_projects.id`` — a generic per-OS-agnostic projects table that NO
shipped Agentic OS actually writes to. Every OS keeps its own ``agos_<slug>_*``
tables and passes the per-OS project UUID into ``agos_audit.project_id``,
which fails the FK and crashes the write handler with HTTP 500.

The Maker E2E smoke (Phase 1, v0.1.29) was the first probe that exercised
the OS write path — that surfaced this latent bug. Filmmaker / Health /
Cyber routes all have the same call-site shape but their CI smoke probes
have no write block, so the bug never fired in CI.

This migration:

1. Drops the FK constraint on ``agos_audit.project_id`` (auto-named by
   Postgres at creation — looked up dynamically so the drop is name-safe).
2. Keeps the column itself NULLABLE so callers may pass NULL or a per-OS
   project UUID without referential integrity enforcement.
3. Keeps the supporting index ``agos_audit_project_created_idx`` so per-OS
   project filtering remains fast.

All DDL is idempotent. The downgrade re-adds the FK (defensive — note that
existing rows pointing at non-existent agos_projects.id values will block
the re-add; the downgrade therefore NULLs any orphaned project_ids first).

@license MIT — Tiresias platform (internal).
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0034_agos_audit_drop_project_fk"
down_revision: Union[str, None] = "0033_maker_phase1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- Drop the FK on agos_audit.project_id by discovering its auto-generated
-- constraint name at runtime. Idempotent — no-op if the FK is already gone.
DO $$
DECLARE
    fk_name TEXT;
BEGIN
    SELECT conname INTO fk_name
      FROM pg_constraint c
      JOIN pg_class t       ON t.oid = c.conrelid
      JOIN pg_namespace n   ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'agos_audit'
       AND c.contype = 'f'
       AND EXISTS (
           SELECT 1 FROM pg_attribute a
            WHERE a.attrelid = c.conrelid
              AND a.attnum = ANY(c.conkey)
              AND a.attname = 'project_id'
       );
    IF fk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE agos_audit DROP CONSTRAINT %I', fk_name);
    END IF;
END $$;

COMMENT ON COLUMN agos_audit.project_id IS
  'Per-OS project UUID. NOT a FK — each OS uses its own agos_<slug>_* table for project storage (agos_projects is unused). NULL is allowed for OS-agnostic actions.';
"""


_DOWNGRADE_SQL = r"""
-- Re-add the FK. Defensive: NULL any orphaned project_ids first so the
-- constraint re-add doesn't fail. This loses the per-OS UUID for orphans
-- but matches the original 0003 semantics (ON DELETE SET NULL).
UPDATE agos_audit
   SET project_id = NULL
 WHERE project_id IS NOT NULL
   AND project_id NOT IN (SELECT id FROM agos_projects);

-- Re-add with the original semantics. The constraint name will be
-- auto-generated again (we don't pin it).
ALTER TABLE agos_audit
    ADD CONSTRAINT agos_audit_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES agos_projects(id) ON DELETE SET NULL;

COMMENT ON COLUMN agos_audit.project_id IS NULL;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)

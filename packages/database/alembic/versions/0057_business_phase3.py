"""Business OS Phase 3 — Projects, Tasks, and Time Tracking.

Revision ID: 0057_business_phase3
Revises: 0056_business_phase2
Create Date: 2026-05-12

Phase 3 introduces the project-delivery stack: **projects** group billable work
into durable containers (optionally linked to a contact and/or deal), **tasks**
form the atomic work-unit tree within each project with priority and positional
ordering, and **time entries** capture start/end (or manual-minute) records that
roll up to unbilled-invoice feeds.

Schema delta
------------

1. ``agos_business_projects`` (NEW — billable-work containers)
     - ``id UUID PK DEFAULT gen_random_uuid()``
     - ``user_id UUID NOT NULL`` (no FK — cross-OS contract)
     - ``contact_id UUID`` nullable FK SET NULL → agos_business_people
     - ``deal_id UUID`` nullable (no FK — per-OS UUID reference)
     - ``title TEXT NOT NULL``, ``slug TEXT NOT NULL``, ``description_md TEXT``
     - ``status TEXT NOT NULL DEFAULT 'active'`` CHECK 6 canonical states
     - ``billing_model TEXT NOT NULL DEFAULT 'hourly'`` CHECK 5 models
     - ``default_rate_cents BIGINT`` nullable (fallback rate for tasks)
     - ``budget_cents BIGINT`` nullable (hard cap, advisory)
     - ``currency TEXT NOT NULL DEFAULT 'USD'``
     - ``start_date DATE``, ``target_completion_date DATE``
     - ``cover_image_url TEXT`` nullable
     - ``tags TEXT[] NOT NULL DEFAULT '{}'``, ``metadata JSONB``
     - ``archived_at TIMESTAMPTZ`` nullable (soft-delete gate)
     - ``created_at``, ``updated_at``
     - UNIQUE (user_id, slug)
     - 4 indexes: main list feed, non-archived feed, contact lookup, GIN on tags

2. ``agos_business_tasks`` (NEW — work-unit tree)
     - ``id UUID PK DEFAULT gen_random_uuid()``
     - ``user_id UUID NOT NULL``, ``project_id UUID NOT NULL`` FK CASCADE
     - ``title TEXT NOT NULL``, ``description_md TEXT``
     - ``status TEXT NOT NULL DEFAULT 'todo'`` CHECK 5 states
     - ``priority TEXT NOT NULL DEFAULT 'medium'`` CHECK 4 levels
     - ``assignee_text TEXT`` nullable (free-form name — no FK to users)
     - ``due_on DATE``, ``completed_at TIMESTAMPTZ``
     - ``billing_rate_cents BIGINT`` nullable (per-task override)
     - ``is_billable BOOLEAN NOT NULL DEFAULT true``
     - ``position INT NOT NULL DEFAULT 0`` (drag-to-reorder)
     - ``tags TEXT[] NOT NULL DEFAULT '{}'``, ``metadata JSONB``
     - ``created_at``, ``updated_at``
     - 4 indexes: position ordering, status filter, due-soon feed, GIN on tags

3. ``agos_business_time_entries`` (NEW — time-tracking records)
     - ``id UUID PK DEFAULT gen_random_uuid()``
     - ``user_id UUID NOT NULL``, ``task_id UUID NOT NULL`` FK CASCADE
     - ``project_id UUID NOT NULL`` (denormalized for billing feed performance)
     - ``description TEXT NOT NULL DEFAULT ''``
     - ``started_at TIMESTAMPTZ NOT NULL``, ``ended_at TIMESTAMPTZ`` nullable
     - ``duration_minutes INT`` nullable (manual entry fallback)
     - ``is_billable BOOLEAN NOT NULL DEFAULT true``
     - ``billing_rate_cents BIGINT`` nullable (snapshot at entry time)
     - ``billed_at TIMESTAMPTZ`` nullable, ``invoice_id UUID`` nullable
     - ``metadata JSONB NOT NULL DEFAULT '{}'``
     - CHECK: ended_at >= started_at when ended_at is set
     - 5 indexes: per-user timeline, per-task timeline, per-project timeline,
       running-timer feed (where ended_at IS NULL),
       unbilled rollup (where is_billable AND billed_at IS NULL)

Locked design decisions
-----------------------
- **No FK on user_id anywhere.** Mirrors v0.1.30 cross-OS contract. Ownership
  enforced at the BFF route layer.
- **contact_id FK uses ON DELETE SET NULL** — deleting a contact unlinks but
  preserves the project record.
- **deal_id has NO FK.** Deals are per-OS UUID references. No cross-table
  integrity enforcement — the BFF resolves display names on read.
- **project_id on time_entries is denormalized.** Avoids a join through tasks
  for the unbilled-invoice feed. Written once at insert, never updated.
- **duration_minutes is nullable** and independent of started_at/ended_at.
  Manual entry (duration_minutes with no start/end) and timer entry
  (started_at + ended_at → duration derived) are both valid. The BFF computes
  display duration as COALESCE(duration_minutes, EXTRACT(epoch FROM
  ended_at - started_at) / 60).
- **billing_rate_cents on time_entries is a snapshot** taken at entry creation
  from the task or project rate. Immutable after insert so rate changes don't
  retroactively alter historical records.
- **Position is an integer slot, not a float.** Reordering is handled by the
  BFF with gap-rebalancing on collision, same as Cyber OS.
- **Tags use GIN index** for fast array-contains queries. No trigram or full-text
  search — tags are short labels.

Idempotency
-----------
CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS (for non-partial
indexes), and DO $$ guard on pg_indexes (for partial indexes). Safe to re-run
on a partially-applied database.

Bind-marker safety
------------------
Per prior-phase footgun: SQLAlchemy's ``text()`` parses ``:word`` patterns
as bind markers. This module uses ``op.execute`` with raw string constants
(NOT ``op.execute(text(...))``); the SQL bodies carry zero ``:<word>``
patterns. The dollar-quoted ``DO $$`` blocks are PG-only and Alembic passes
the string through to the driver verbatim.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0057_business_phase3"
down_revision: Union[str, None] = "0056_business_phase2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- ═══ 1. agos_business_projects (NEW) ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agos_business_projects (
    id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID         NOT NULL,
    contact_id             UUID         NULL
                                        REFERENCES agos_business_people(id)
                                        ON DELETE SET NULL,
    deal_id                UUID         NULL,
    title                  TEXT         NOT NULL,
    slug                   TEXT         NOT NULL,
    description_md         TEXT         NOT NULL DEFAULT '',
    status                 TEXT         NOT NULL DEFAULT 'active',
    billing_model          TEXT         NOT NULL DEFAULT 'hourly',
    default_rate_cents     BIGINT       NULL,
    budget_cents           BIGINT       NULL,
    currency               TEXT         NOT NULL DEFAULT 'USD',
    start_date             DATE         NULL,
    target_completion_date DATE         NULL,
    cover_image_url        TEXT         NULL,
    tags                   TEXT[]       NOT NULL DEFAULT '{}',
    metadata               JSONB        NOT NULL DEFAULT '{}'::jsonb,
    archived_at            TIMESTAMPTZ  NULL,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT agos_business_projects_user_slug_unique
        UNIQUE (user_id, slug),

    CONSTRAINT agos_business_projects_status_check
        CHECK (status IN ('proposed','active','on_hold','completed','cancelled','archived')),

    CONSTRAINT agos_business_projects_billing_model_check
        CHECK (billing_model IN ('hourly','fixed','retainer','milestone','free'))
);

COMMENT ON TABLE agos_business_projects IS
  'Billable-work containers. Each project groups tasks and time entries, optionally linked to a contact (via FK) and/or a deal (via free-form UUID). Projects support six lifecycle states, five billing models, and a soft-delete gate via archived_at.';

COMMENT ON COLUMN agos_business_projects.user_id IS
  'Owning user. No FK — ownership is enforced at the BFF route layer per the v0.1.30 cross-OS contract.';

COMMENT ON COLUMN agos_business_projects.contact_id IS
  'Primary client contact. FK SET NULL on contact delete so the project record survives.';

COMMENT ON COLUMN agos_business_projects.deal_id IS
  'Optional link to a deal. No FK — deals are per-OS UUID references resolved at the BFF layer.';

COMMENT ON COLUMN agos_business_projects.slug IS
  'URL-safe project identifier. Unique per user. Derived from title at creation, user-editable afterward.';

COMMENT ON COLUMN agos_business_projects.status IS
  'Project lifecycle state. CHECK-constrained: proposed (not yet started) → active → on_hold / completed / cancelled / archived. Archived is a soft-delete gate (archived_at is set); the UI hides archived projects by default.';

COMMENT ON COLUMN agos_business_projects.billing_model IS
  'How the project is billed. CHECK-constrained: hourly (time-and-materials), fixed (flat fee), retainer (recurring), milestone (per-deliverable), free (pro bono / internal).';

COMMENT ON COLUMN agos_business_projects.default_rate_cents IS
  'Default hourly/rate in minor currency units. Used as a fallback when tasks lack an explicit billing_rate_cents. Nullable — projects can exist without a rate (e.g. fixed-fee projects).';

COMMENT ON COLUMN agos_business_projects.budget_cents IS
  'Hard budget cap in minor currency units. Advisory — the BFF may surface a warning when unbilled total nears or exceeds this value but does not block time entry. Nullable.';

COMMENT ON COLUMN agos_business_projects.archived_at IS
  'Soft-delete timestamp. When set, the project is considered archived and hidden from default feeds. Setting archived_at does NOT change status — the two are independent.';

-- Indexes

-- Main list feed: user's projects sorted by recent activity within each status
CREATE INDEX IF NOT EXISTS agos_business_projects_user_status_updated_idx
    ON agos_business_projects (user_id, status, updated_at DESC);

-- Non-archived feed: all active projects for a user (excludes soft-deleted)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_projects_user_active_partial_idx'
    ) THEN
        CREATE INDEX agos_business_projects_user_active_partial_idx
            ON agos_business_projects (user_id)
            WHERE archived_at IS NULL;
    END IF;
END$$;

-- Lookup by contact (only for projects that have a contact assigned)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_projects_contact_partial_idx'
    ) THEN
        CREATE INDEX agos_business_projects_contact_partial_idx
            ON agos_business_projects (contact_id)
            WHERE contact_id IS NOT NULL;
    END IF;
END$$;

-- Tag search
CREATE INDEX IF NOT EXISTS agos_business_projects_tags_gin_idx
    ON agos_business_projects USING gin (tags);

-- ═══ 2. agos_business_tasks (NEW) ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agos_business_tasks (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID         NOT NULL,
    project_id         UUID         NOT NULL
                                    REFERENCES agos_business_projects(id)
                                    ON DELETE CASCADE,
    title              TEXT         NOT NULL,
    description_md     TEXT         NOT NULL DEFAULT '',
    status             TEXT         NOT NULL DEFAULT 'todo',
    priority           TEXT         NOT NULL DEFAULT 'medium',
    assignee_text      TEXT         NULL,
    due_on             DATE         NULL,
    completed_at       TIMESTAMPTZ  NULL,
    billing_rate_cents BIGINT       NULL,
    is_billable        BOOLEAN      NOT NULL DEFAULT true,
    position           INT          NOT NULL DEFAULT 0,
    tags               TEXT[]       NOT NULL DEFAULT '{}',
    metadata           JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT agos_business_tasks_status_check
        CHECK (status IN ('todo','in_progress','blocked','done','cancelled')),

    CONSTRAINT agos_business_tasks_priority_check
        CHECK (priority IN ('low','medium','high','urgent'))
);

COMMENT ON TABLE agos_business_tasks IS
  'Atomic work units within a project. Tasks support positional ordering (drag-to-reorder), five lifecycle states, four priority levels, and per-task billing-rate overrides. Deleting a project cascade-deletes all its tasks.';

COMMENT ON COLUMN agos_business_tasks.user_id IS
  'Owning user. No FK per cross-OS contract. Must match the parent project''s user_id (enforced at the BFF layer).';

COMMENT ON COLUMN agos_business_tasks.project_id IS
  'Parent project. FK CASCADE — deleting a project deletes all its tasks and their time entries transitively.';

COMMENT ON COLUMN agos_business_tasks.status IS
  'Task lifecycle state. CHECK-constrained: todo → in_progress / blocked → done / cancelled. completed_at is set automatically when status transitions to done (via the BFF), cleared if the task is reopened.';

COMMENT ON COLUMN agos_business_tasks.priority IS
  'Task urgency. CHECK-constrained: low / medium / high / urgent. Used for sorting and visual emphasis. Does NOT imply a due date — priority and due_on are independent axes.';

COMMENT ON COLUMN agos_business_tasks.assignee_text IS
  'Free-form assignee name. No FK to a users table — solo founders may assign to themselves, contractors, or external collaborators by name. Nullable.';

COMMENT ON COLUMN agos_business_tasks.billing_rate_cents IS
  'Per-task billing rate override in minor currency units. When set, time entries for this task snapshot this rate. When NULL, the time entry falls back to the project''s default_rate_cents.';

COMMENT ON COLUMN agos_business_tasks.position IS
  'Integer slot for manual ordering within a project. Lower = earlier. The BFF handles gap-rebalancing on collision (same pattern as Cyber OS drag-to-reorder). Default 0 places new tasks at the top.';

-- Indexes

-- Ordered by position within a project (kanban / list view)
CREATE INDEX IF NOT EXISTS agos_business_tasks_project_position_idx
    ON agos_business_tasks (project_id, position);

-- Filter by status within a project (board columns)
CREATE INDEX IF NOT EXISTS agos_business_tasks_project_status_idx
    ON agos_business_tasks (project_id, status);

-- Due-soon feed: tasks with a due date that are not yet done or cancelled
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_tasks_due_soon_partial_idx'
    ) THEN
        CREATE INDEX agos_business_tasks_due_soon_partial_idx
            ON agos_business_tasks (due_on)
            WHERE due_on IS NOT NULL
              AND status NOT IN ('done', 'cancelled');
    END IF;
END$$;

-- Tag search
CREATE INDEX IF NOT EXISTS agos_business_tasks_tags_gin_idx
    ON agos_business_tasks USING gin (tags);

-- ═══ 3. agos_business_time_entries (NEW) ════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agos_business_time_entries (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID         NOT NULL,
    task_id            UUID         NOT NULL
                                    REFERENCES agos_business_tasks(id)
                                    ON DELETE CASCADE,
    project_id         UUID         NOT NULL,
    description        TEXT         NOT NULL DEFAULT '',
    started_at         TIMESTAMPTZ  NOT NULL,
    ended_at           TIMESTAMPTZ  NULL,
    duration_minutes   INT          NULL,
    is_billable        BOOLEAN      NOT NULL DEFAULT true,
    billing_rate_cents BIGINT       NULL,
    billed_at          TIMESTAMPTZ  NULL,
    invoice_id         UUID         NULL,
    metadata           JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT agos_business_time_entries_ended_check
        CHECK ((ended_at IS NULL) OR (ended_at >= started_at))
);

COMMENT ON TABLE agos_business_time_entries IS
  'Time-tracking records. Each entry captures a start/end interval (timer mode) or a manual duration in minutes. Denormalized project_id enables billing-feed queries without joining through tasks. Rate is snapshotted at entry creation and immutable thereafter.';

COMMENT ON COLUMN agos_business_time_entries.user_id IS
  'Owning user. No FK per cross-OS contract. Must match the parent task''s user_id (enforced at the BFF layer).';

COMMENT ON COLUMN agos_business_time_entries.task_id IS
  'Parent task. FK CASCADE — deleting a task deletes all its time entries.';

COMMENT ON COLUMN agos_business_time_entries.project_id IS
  'Denormalized project reference. Set once at insert (from the parent task''s project_id) and never updated. Avoids a join through tasks for the unbilled-invoice feed and per-project time rollups.';

COMMENT ON COLUMN agos_business_time_entries.started_at IS
  'When the timer started or the work period began. Always required — even for manual entries this anchors the entry on a timeline.';

COMMENT ON COLUMN agos_business_time_entries.ended_at IS
  'When the timer stopped. NULL means the timer is still running. The CHECK constraint ensures ended_at >= started_at when set.';

COMMENT ON COLUMN agos_business_time_entries.duration_minutes IS
  'Manually entered duration in minutes. Independent of started_at/ended_at — supports entries where the user enters "2 hours" without tracking real time. The BFF computes display duration as COALESCE(duration_minutes, EXTRACT(epoch FROM ended_at - started_at) / 60).';

COMMENT ON COLUMN agos_business_time_entries.billing_rate_cents IS
  'Rate snapshotted at entry creation from the task or project. Immutable after insert so rate changes do not retroactively alter historical billing records.';

COMMENT ON COLUMN agos_business_time_entries.billed_at IS
  'When this entry was included on an invoice. NULL = not yet billed. Set by the invoicing flow (future phase).';

COMMENT ON COLUMN agos_business_time_entries.invoice_id IS
  'The invoice that billed this entry. NULL = not yet invoiced. No FK — invoices are a future phase.';

-- Indexes

-- Per-user timeline (global time-log view)
CREATE INDEX IF NOT EXISTS agos_business_time_entries_user_started_idx
    ON agos_business_time_entries (user_id, started_at DESC);

-- Per-task timeline (task detail time log)
CREATE INDEX IF NOT EXISTS agos_business_time_entries_task_started_idx
    ON agos_business_time_entries (task_id, started_at DESC);

-- Per-project timeline (project detail time log, billing rollup)
CREATE INDEX IF NOT EXISTS agos_business_time_entries_project_started_idx
    ON agos_business_time_entries (project_id, started_at DESC);

-- Running-timer feed: entries where the timer is still active
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_time_entries_running_timer_partial_idx'
    ) THEN
        CREATE INDEX agos_business_time_entries_running_timer_partial_idx
            ON agos_business_time_entries (user_id)
            WHERE ended_at IS NULL;
    END IF;
END$$;

-- Unbilled rollup: billable entries not yet on an invoice
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_time_entries_unbilled_partial_idx'
    ) THEN
        CREATE INDEX agos_business_time_entries_unbilled_partial_idx
            ON agos_business_time_entries (project_id)
            WHERE is_billable = true
              AND billed_at IS NULL;
    END IF;
END$$;
"""


_DOWNGRADE_SQL = r"""
-- Reverse dependency order: time_entries depends on tasks depends on projects.

DROP TABLE IF EXISTS agos_business_time_entries;
DROP TABLE IF EXISTS agos_business_tasks;
DROP TABLE IF EXISTS agos_business_projects;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)

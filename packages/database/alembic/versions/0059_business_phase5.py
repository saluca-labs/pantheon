"""Business OS Phase 5 — Expenses, P&L Snapshots.

Revision ID: 0059_business_phase5
Revises: 0058_business_phase4
Create Date: 2026-05-12

Phase 5 introduces the expense ledger and profit-and-loss layer on top of
Phase 4's billing surface: **expenses** track outgoing cash with category
classification, receipt uploads, and reimbursable flags; **P&L snapshots**
capture revenue/expense/margin summaries at a point in time for financial
reporting and export.

Schema delta
------------

1. ``agos_business_expenses`` (NEW — expense ledger)
     - ``id UUID PK DEFAULT gen_random_uuid()``
     - ``user_id UUID NOT NULL`` (no FK — cross-OS contract)
     - ``project_id UUID NULL`` (per-OS UUID, no FK)
     - ``category TEXT NOT NULL DEFAULT 'general'`` CHECK 14 categories
     - ``vendor TEXT NULL``
     - ``description TEXT NOT NULL DEFAULT ''``
     - ``amount_cents BIGINT NOT NULL``
     - ``currency TEXT NOT NULL DEFAULT 'USD'``
     - ``incurred_on DATE NOT NULL``
     - ``paid_on DATE NULL``
     - ``receipt_url TEXT NULL``
     - ``is_reimbursable BOOLEAN NOT NULL DEFAULT false``
     - ``reimbursed_at TIMESTAMPTZ NULL``
     - ``tags TEXT[] NOT NULL DEFAULT '{}'``
     - ``metadata JSONB NOT NULL DEFAULT '{}'``
     - ``created_at``, ``updated_at``
     - 5 indexes: list feed, partial project, category, GIN tags, partial reimbursable

2. ``agos_business_pnl_snapshots`` (NEW — P&L summaries)
     - ``id UUID PK DEFAULT gen_random_uuid()``
     - ``user_id UUID NOT NULL`` (no FK)
     - ``period_kind TEXT NOT NULL DEFAULT 'month'`` CHECK 4 kinds
     - ``period_start DATE NOT NULL``
     - ``period_end DATE NOT NULL``
     - ``revenue_cents BIGINT NOT NULL``
     - ``expense_cents BIGINT NOT NULL``
     - ``margin_cents BIGINT NOT NULL``
     - ``currency TEXT NOT NULL``
     - ``is_locked BOOLEAN NOT NULL DEFAULT false``
     - ``notes TEXT NULL``
     - ``created_at TIMESTAMPTZ NOT NULL DEFAULT now()``
     - UNIQUE (user_id, period_kind, period_start)
     - 1 index: (user_id, period_start DESC)

Locked design decisions
-----------------------
- **No FK on user_id or project_id anywhere.** Mirrors v0.1.30 cross-OS contract.
  Ownership enforced at the BFF route layer.
- **Cash-basis accounting.** Expense dates use COALESCE(paid_on, incurred_on) for
  P&L computation. Revenue uses payments.received_on joined to invoices.
- **Category CHECK constraint** enforces the canonical 14 categories at the DB
  level. The TypeScript EXPENSE_CATEGORIES array mirrors this list.
- **P&L snapshots are point-in-time captures.** Locking a snapshot (is_locked=true)
  prevents further edits. Snapshots are computed by the repo, not triggers.
- **UNIQUE constraint on (user_id, period_kind, period_start)** prevents
  duplicate snapshots for the same period. The repo catches 23505 and returns
  `{ kind: 'duplicate', existing }`.
- **Reimbursable tracking** uses a boolean flag + nullable timestamp. The
  partial index on (user_id) WHERE is_reimbursable AND reimbursed_at IS NULL
  enables fast queries for pending reimbursements.
- **GIN index on tags** supports @> containment queries via the repo's tag
  filter.

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


revision: str = "0059_business_phase5"
down_revision: Union[str, None] = "0058_business_phase4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- ═══ 1. agos_business_expenses (NEW) ═════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agos_business_expenses (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID         NOT NULL,
    project_id       UUID         NULL,
    category         TEXT         NOT NULL DEFAULT 'general',
    vendor           TEXT         NULL,
    description      TEXT         NOT NULL DEFAULT '',
    amount_cents     BIGINT       NOT NULL,
    currency         TEXT         NOT NULL DEFAULT 'USD',
    incurred_on      DATE         NOT NULL,
    paid_on          DATE         NULL,
    receipt_url      TEXT         NULL,
    is_reimbursable  BOOLEAN      NOT NULL DEFAULT false,
    reimbursed_at    TIMESTAMPTZ  NULL,
    tags             TEXT[]       NOT NULL DEFAULT '{}',
    metadata         JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT agos_business_expenses_category_check
        CHECK (category IN ('general','software','hardware','travel','meals',
              'marketing','contractor','office','utilities','insurance',
              'professional_services','education','taxes','other'))
);

COMMENT ON TABLE agos_business_expenses IS
  'Expense ledger. Tracks outgoing cash with category classification, vendor info, receipt uploads, and reimbursable tracking. Cash-basis: P&L computation uses COALESCE(paid_on, incurred_on) as the effective date.';

COMMENT ON COLUMN agos_business_expenses.user_id IS
  'Owning user. No FK — ownership is enforced at the BFF route layer per the v0.1.30 cross-OS contract.';

COMMENT ON COLUMN agos_business_expenses.project_id IS
  'Optional link to a project. No FK — projects are per-OS UUID references resolved at the BFF layer.';

COMMENT ON COLUMN agos_business_expenses.category IS
  'Expense category. CHECK-constrained to 14 canonical values: general, software, hardware, travel, meals, marketing, contractor, office, utilities, insurance, professional_services, education, taxes, other.';

COMMENT ON COLUMN agos_business_expenses.vendor IS
  'Vendor or payee name (e.g. "AWS", "WeWork"). Nullable for miscellaneous or personal expenses.';

COMMENT ON COLUMN agos_business_expenses.description IS
  'Human-readable description of the expense (e.g. "March EC2 bill").';

COMMENT ON COLUMN agos_business_expenses.amount_cents IS
  'Expense amount in minor currency units (cents). Always positive — refunds or credits should be recorded as separate entries.';

COMMENT ON COLUMN agos_business_expenses.currency IS
  'ISO 4217 currency code. Defaults to USD.';

COMMENT ON COLUMN agos_business_expenses.incurred_on IS
  'Date the expense was incurred (e.g. invoice date from the vendor). Used for accrual purposes.';

COMMENT ON COLUMN agos_business_expenses.paid_on IS
  'Date the expense was actually paid. Nullable. P&L computation uses COALESCE(paid_on, incurred_on) for cash-basis reporting.';

COMMENT ON COLUMN agos_business_expenses.receipt_url IS
  'URL to the uploaded receipt image or document. Nullable until a receipt is attached.';

COMMENT ON COLUMN agos_business_expenses.is_reimbursable IS
  'Whether this expense is eligible for reimbursement (e.g. employee out-of-pocket purchases). Defaults to false.';

COMMENT ON COLUMN agos_business_expenses.reimbursed_at IS
  'Timestamp when the reimbursement was processed. NULL if not yet reimbursed. Partial index supports fast "pending reimbursement" queries.';

COMMENT ON COLUMN agos_business_expenses.tags IS
  'Free-form tag array for filtering and grouping. GIN-indexed for efficient containment queries.';

-- Indexes

-- Main list feed: user's expenses sorted by incurred date descending
CREATE INDEX IF NOT EXISTS agos_business_expenses_user_incurred_idx
    ON agos_business_expenses (user_id, incurred_on DESC);

-- Lookup by project (only for expenses linked to a project)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_expenses_project_partial_idx'
    ) THEN
        CREATE INDEX agos_business_expenses_project_partial_idx
            ON agos_business_expenses (project_id, incurred_on DESC)
            WHERE project_id IS NOT NULL;
    END IF;
END$$;

-- Category-scoped feed
CREATE INDEX IF NOT EXISTS agos_business_expenses_user_category_incurred_idx
    ON agos_business_expenses (user_id, category, incurred_on DESC);

-- GIN on tags for containment queries
CREATE INDEX IF NOT EXISTS agos_business_expenses_tags_gin_idx
    ON agos_business_expenses USING gin (tags);

-- Pending reimbursements
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_expenses_reimbursable_partial_idx'
    ) THEN
        CREATE INDEX agos_business_expenses_reimbursable_partial_idx
            ON agos_business_expenses (user_id)
            WHERE is_reimbursable = true AND reimbursed_at IS NULL;
    END IF;
END$$;

-- ═══ 2. agos_business_pnl_snapshots (NEW) ═════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agos_business_pnl_snapshots (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID         NOT NULL,
    period_kind    TEXT         NOT NULL DEFAULT 'month',
    period_start   DATE         NOT NULL,
    period_end     DATE         NOT NULL,
    revenue_cents  BIGINT       NOT NULL,
    expense_cents  BIGINT       NOT NULL,
    margin_cents   BIGINT       NOT NULL,
    currency       TEXT         NOT NULL,
    is_locked      BOOLEAN      NOT NULL DEFAULT false,
    notes          TEXT         NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT agos_business_pnl_snapshots_user_period_unique
        UNIQUE (user_id, period_kind, period_start),

    CONSTRAINT agos_business_pnl_snapshots_period_kind_check
        CHECK (period_kind IN ('month','quarter','year','custom'))
);

COMMENT ON TABLE agos_business_pnl_snapshots IS
  'P&L snapshots capturing revenue, expense, and margin totals for a given period. Point-in-time captures used for financial reporting and PDF export. Locked snapshots (is_locked=true) cannot be edited.';

COMMENT ON COLUMN agos_business_pnl_snapshots.user_id IS
  'Owning user. No FK — ownership is enforced at the BFF route layer.';

COMMENT ON COLUMN agos_business_pnl_snapshots.period_kind IS
  'Period granularity. CHECK-constrained: month, quarter, year, or custom date range.';

COMMENT ON COLUMN agos_business_pnl_snapshots.period_start IS
  'First day of the reporting period (inclusive).';

COMMENT ON COLUMN agos_business_pnl_snapshots.period_end IS
  'Last day of the reporting period (inclusive).';

COMMENT ON COLUMN agos_business_pnl_snapshots.revenue_cents IS
  'Total revenue for the period in minor currency units (cents). Computed from payments.received_on within the period range.';

COMMENT ON COLUMN agos_business_pnl_snapshots.expense_cents IS
  'Total expenses for the period in minor currency units (cents). Computed from expenses using COALESCE(paid_on, incurred_on) within the period range.';

COMMENT ON COLUMN agos_business_pnl_snapshots.margin_cents IS
  'Net profit/loss: revenue_cents - expense_cents. May be negative.';

COMMENT ON COLUMN agos_business_pnl_snapshots.currency IS
  'ISO 4217 currency code for the monetary columns. All amounts in this snapshot are in the same currency.';

COMMENT ON COLUMN agos_business_pnl_snapshots.is_locked IS
  'When true, the snapshot is immutable. Locked snapshots cannot be edited or deleted through the BFF.';

COMMENT ON COLUMN agos_business_pnl_snapshots.notes IS
  'Free-form notes about the snapshot (e.g. "Q1 2026 final"). Nullable.';

-- Indexes

-- Per-user feed sorted by period start descending
CREATE INDEX IF NOT EXISTS agos_business_pnl_snapshots_user_period_idx
    ON agos_business_pnl_snapshots (user_id, period_start DESC);
"""


_DOWNGRADE_SQL = r"""
DROP TABLE IF EXISTS agos_business_pnl_snapshots;
DROP TABLE IF EXISTS agos_business_expenses;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)

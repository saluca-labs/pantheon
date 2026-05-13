"""Business OS Phase 4 — Quotes, Invoices, Line Items, and Payments.

Revision ID: 0058_business_phase4
Revises: 0057_business_phase3
Create Date: 2026-05-12

Phase 4 introduces the billing surface: **quotes** generate proposal documents
(optionally linked to a contact, deal, and/or project), **invoices** track
billable totals with payment reconciliation, **line items** form the atomic
charge rows on both quotes and invoices (XOR parent pattern), and **payments**
record received funds against invoices.

Schema delta
------------

1. ``agos_business_quotes`` (NEW — proposal documents)
     - ``id UUID PK DEFAULT gen_random_uuid()``
     - ``user_id UUID NOT NULL`` (no FK — cross-OS contract)
     - ``deal_id UUID`` nullable (no FK — per-OS UUID reference)
     - ``contact_id UUID`` nullable FK SET NULL → agos_business_people
     - ``project_id UUID`` nullable (no FK — per-OS UUID reference)
     - ``quote_number TEXT NOT NULL``, ``title TEXT NOT NULL``
     - ``description_md TEXT NOT NULL DEFAULT ''``
     - ``status TEXT NOT NULL DEFAULT 'draft'`` CHECK 6 canonical states
     - ``quote_date DATE NOT NULL DEFAULT CURRENT_DATE``
     - ``expires_on DATE`` nullable
     - ``subtotal_cents BIGINT NOT NULL DEFAULT 0``
     - ``tax_cents BIGINT NOT NULL DEFAULT 0``
     - ``total_cents BIGINT NOT NULL DEFAULT 0``
     - ``currency TEXT NOT NULL DEFAULT 'USD'``
     - ``converted_invoice_id UUID`` nullable (set on convert)
     - ``metadata JSONB NOT NULL DEFAULT '{}'``
     - ``archived_at TIMESTAMPTZ`` nullable (soft-delete gate)
     - ``created_at``, ``updated_at``
     - UNIQUE (user_id, quote_number)
     - 4 indexes: list feed, non-archived feed, partial deal_id, partial contact_id

2. ``agos_business_invoices`` (NEW — billing documents)
     - ``id UUID PK DEFAULT gen_random_uuid()``
     - ``user_id UUID NOT NULL`` (no FK — cross-OS contract)
     - ``deal_id UUID`` nullable (no FK — per-OS UUID reference)
     - ``contact_id UUID`` nullable FK SET NULL → agos_business_people
     - ``project_id UUID`` nullable (no FK — per-OS UUID reference)
     - ``quote_id UUID`` nullable (source quote, no FK — cross-table only)
     - ``invoice_number TEXT NOT NULL``, ``title TEXT NOT NULL``
     - ``description_md TEXT NOT NULL DEFAULT ''``
     - ``status TEXT NOT NULL DEFAULT 'draft'`` CHECK 6 states
     - ``invoice_date DATE NOT NULL DEFAULT CURRENT_DATE``
     - ``due_on DATE NOT NULL``
     - ``terms TEXT NOT NULL DEFAULT ''``
     - ``subtotal_cents BIGINT NOT NULL DEFAULT 0``
     - ``tax_cents BIGINT NOT NULL DEFAULT 0``
     - ``total_cents BIGINT NOT NULL DEFAULT 0``
     - ``paid_cents BIGINT NOT NULL DEFAULT 0``
     - ``currency TEXT NOT NULL DEFAULT 'USD'``
     - ``pdf_url TEXT`` nullable
     - ``metadata JSONB NOT NULL DEFAULT '{}'``
     - ``created_at``, ``updated_at``
     - UNIQUE (user_id, invoice_number)
     - 4 indexes: list feed, partial deal_id, partial contact_id, partial outstanding

3. ``agos_business_line_items`` (NEW — charge rows for quotes AND invoices)
     - ``id UUID PK DEFAULT gen_random_uuid()``
     - ``quote_id UUID`` nullable FK CASCADE → agos_business_quotes
     - ``invoice_id UUID`` nullable FK CASCADE → agos_business_invoices
     - ``user_id UUID NOT NULL`` (denormalized from parent for ownership checks)
     - ``position INT NOT NULL DEFAULT 0``
     - ``description TEXT NOT NULL DEFAULT ''``
     - ``quantity NUMERIC(12,3) NOT NULL DEFAULT 1``
     - ``unit_label TEXT NOT NULL DEFAULT ''``
     - ``unit_price_cents BIGINT NOT NULL DEFAULT 0``
     - ``line_total_cents BIGINT NOT NULL DEFAULT 0``
     - ``tax_rate_bp INT NOT NULL DEFAULT 0`` (basis points)
     - ``line_tax_cents BIGINT NOT NULL DEFAULT 0``
     - ``time_entry_ids UUID[] NOT NULL DEFAULT '{}'``
     - ``metadata JSONB NOT NULL DEFAULT '{}'``, ``created_at``
     - XOR CHECK: exactly one parent must be non-null
     - FK CASCADE on both parents
     - 2 partial indexes: (quote_id, position), (invoice_id, position)
     - GIN index on time_entry_ids

4. ``agos_business_payments`` (NEW — received-fund records)
     - ``id UUID PK DEFAULT gen_random_uuid()``
     - ``invoice_id UUID NOT NULL`` FK CASCADE → agos_business_invoices
     - ``user_id UUID NOT NULL`` (denormalized from invoice)
     - ``amount_cents BIGINT NOT NULL``
     - ``currency TEXT NOT NULL DEFAULT 'USD'``
     - ``method TEXT NOT NULL DEFAULT 'bank_transfer'`` CHECK 8 methods
     - ``received_on DATE NOT NULL DEFAULT CURRENT_DATE``
     - ``reference TEXT`` nullable, ``notes TEXT`` nullable
     - ``metadata JSONB NOT NULL DEFAULT '{}'``, ``created_at``
     - 2 indexes: (invoice_id, received_on), (user_id, received_on)

Locked design decisions
-----------------------
- **No FK on user_id anywhere.** Mirrors v0.1.30 cross-OS contract. Ownership
  enforced at the BFF route layer.
- **contact_id FK uses ON DELETE SET NULL** so deleting a contact unlinks the
  document but preserves the billing record.
- **deal_id, project_id, quote_id on foreign tables have NO FK.** These are
  per-OS UUID references. No cross-table integrity enforcement — the BFF
  resolves display names on read.
- **invoice_id on payments has FK CASCADE** — deleting an invoice removes its
  payment history. This is intentional: only draft invoices can be deleted
  (the delete function enforces status = 'draft'), so cascade-delete payment
  rows only applies when a user deletes a draft invoice that somehow has test
  payments attached.
- **quote_id + invoice_id on line_items use FK CASCADE** — deleting a quote or
  invoice cascade-deletes its line items. Consistent with the "only draft
  documents can be deleted" guard.
- **XOR CHECK on line_items** enforces exactly-one-parent at the DB level.
  The TypeScript layer carries both fields as nullable but route validators
  and the repo layer enforce the XOR invariant.
- **subtotal/tax/total are derived columns on quotes and invoices.** Updated
  by the repo's `updateXxxTotals()` functions after every line-item mutation.
  There is no trigger — the repo layer is the single writer.
- **paid_cents on invoices is derived from payments.** Updated by
  `reconcilePaidCents()` after every payment mutation. Status auto-transitions
  to 'paid' when paid_cents >= total_cents AND current status is sent/partial.
- **Archived is soft** (sets archived_at = now()). The delete functions are
  hard deletes (DELETE FROM) gated on status = 'draft' — only unsubmitted
  documents can be permanently removed.
- **Position is an integer slot** for manual ordering. Auto-positioning
  computes MAX(position)+1. The BFF handles gap-rebalancing on collision.
- **Tax rate in basis points** (1 bp = 0.01%). 10000 bp = 100%. Keeps tax
  calculations in integer arithmetic — no floating-point drift in the DB.
- **time_entry_ids is a UUID[] array** on line items. Enables linking line
  items back to time entries for "bill from time log" workflows. GIN-indexed
  for efficient reverse lookups.

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


revision: str = "0058_business_phase4"
down_revision: Union[str, None] = "0057_business_phase3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- ═══ 1. agos_business_quotes (NEW) ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agos_business_quotes (
    id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID         NOT NULL,
    deal_id              UUID         NULL,
    contact_id           UUID         NULL
                                      REFERENCES agos_business_people(id)
                                      ON DELETE SET NULL,
    project_id           UUID         NULL,
    quote_number         TEXT         NOT NULL,
    title                TEXT         NOT NULL,
    description_md       TEXT         NOT NULL DEFAULT '',
    status               TEXT         NOT NULL DEFAULT 'draft',
    quote_date           DATE         NOT NULL DEFAULT CURRENT_DATE,
    expires_on           DATE         NULL,
    subtotal_cents       BIGINT       NOT NULL DEFAULT 0,
    tax_cents            BIGINT       NOT NULL DEFAULT 0,
    total_cents          BIGINT       NOT NULL DEFAULT 0,
    currency             TEXT         NOT NULL DEFAULT 'USD',
    converted_invoice_id UUID         NULL,
    metadata             JSONB        NOT NULL DEFAULT '{}'::jsonb,
    archived_at          TIMESTAMPTZ  NULL,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT agos_business_quotes_user_number_unique
        UNIQUE (user_id, quote_number),

    CONSTRAINT agos_business_quotes_status_check
        CHECK (status IN ('draft','sent','accepted','rejected','expired','converted'))
);

COMMENT ON TABLE agos_business_quotes IS
  'Proposal documents. Quotes propose a price for goods or services — optionally linked to a contact (FK), deal (free-form UUID), or project (free-form UUID). Six-lifecycle status with derived subtotal/tax/total from line items. Soft-delete via archived_at. Converted quotes set converted_invoice_id and transition to status converted.';

COMMENT ON COLUMN agos_business_quotes.user_id IS
  'Owning user. No FK — ownership is enforced at the BFF route layer per the v0.1.30 cross-OS contract.';

COMMENT ON COLUMN agos_business_quotes.deal_id IS
  'Optional link to a deal. No FK — deals are per-OS UUID references resolved at the BFF layer.';

COMMENT ON COLUMN agos_business_quotes.contact_id IS
  'Primary client contact. FK SET NULL on contact delete so the quote record survives.';

COMMENT ON COLUMN agos_business_quotes.project_id IS
  'Optional link to a project. No FK — projects are per-OS UUID references resolved at the BFF layer.';

COMMENT ON COLUMN agos_business_quotes.quote_number IS
  'User-facing quote number (e.g. "Q-2026-001"). Unique per user. The default prefix is set in business settings but the full number is user-editable.';

COMMENT ON COLUMN agos_business_quotes.status IS
  'Quote lifecycle state. CHECK-constrained: draft (being prepared) → sent (delivered to client) → accepted / rejected / expired / converted (to an invoice).';

COMMENT ON COLUMN agos_business_quotes.subtotal_cents IS
  'Sum of line_total_cents from line items. Derived column — updated by updateQuoteTotals() after every line-item mutation. Not settable via UpdateQuoteInput.';

COMMENT ON COLUMN agos_business_quotes.tax_cents IS
  'Sum of line_tax_cents from line items. Derived column — updated by updateQuoteTotals().';

COMMENT ON COLUMN agos_business_quotes.total_cents IS
  'subtotal_cents + tax_cents. Derived column.';

COMMENT ON COLUMN agos_business_quotes.converted_invoice_id IS
  'The invoice created from this quote. Set when a quote transitions to converted. No FK — invoices are in the same phase.';

COMMENT ON COLUMN agos_business_quotes.archived_at IS
  'Soft-delete timestamp. When set, the quote is hidden from default feeds.';

-- Indexes

-- Main list feed: user's quotes sorted by quote date descending
CREATE INDEX IF NOT EXISTS agos_business_quotes_user_quote_date_idx
    ON agos_business_quotes (user_id, quote_date DESC);

-- Non-archived feed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_quotes_user_active_partial_idx'
    ) THEN
        CREATE INDEX agos_business_quotes_user_active_partial_idx
            ON agos_business_quotes (user_id)
            WHERE archived_at IS NULL;
    END IF;
END$$;

-- Lookup by deal (only for quotes linked to a deal)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_quotes_deal_partial_idx'
    ) THEN
        CREATE INDEX agos_business_quotes_deal_partial_idx
            ON agos_business_quotes (deal_id)
            WHERE deal_id IS NOT NULL;
    END IF;
END$$;

-- Lookup by contact (only for quotes linked to a contact)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_quotes_contact_partial_idx'
    ) THEN
        CREATE INDEX agos_business_quotes_contact_partial_idx
            ON agos_business_quotes (contact_id)
            WHERE contact_id IS NOT NULL;
    END IF;
END$$;

-- ═══ 2. agos_business_invoices (NEW) ═════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agos_business_invoices (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID         NOT NULL,
    deal_id          UUID         NULL,
    contact_id       UUID         NULL
                                  REFERENCES agos_business_people(id)
                                  ON DELETE SET NULL,
    project_id       UUID         NULL,
    quote_id         UUID         NULL,
    invoice_number   TEXT         NOT NULL,
    title            TEXT         NOT NULL,
    description_md   TEXT         NOT NULL DEFAULT '',
    status           TEXT         NOT NULL DEFAULT 'draft',
    invoice_date     DATE         NOT NULL DEFAULT CURRENT_DATE,
    due_on           DATE         NOT NULL,
    terms            TEXT         NOT NULL DEFAULT '',
    subtotal_cents   BIGINT       NOT NULL DEFAULT 0,
    tax_cents        BIGINT       NOT NULL DEFAULT 0,
    total_cents      BIGINT       NOT NULL DEFAULT 0,
    paid_cents       BIGINT       NOT NULL DEFAULT 0,
    currency         TEXT         NOT NULL DEFAULT 'USD',
    pdf_url          TEXT         NULL,
    metadata         JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT agos_business_invoices_user_number_unique
        UNIQUE (user_id, invoice_number),

    CONSTRAINT agos_business_invoices_status_check
        CHECK (status IN ('draft','sent','partial','paid','overdue','voided'))
);

COMMENT ON TABLE agos_business_invoices IS
  'Billing documents. Invoices track amounts owed by a client — optionally linked to a contact (FK), deal (free-form UUID), project (free-form UUID), or source quote (free-form UUID). Six-lifecycle status with derived subtotal/tax/total from line items and paid_cents reconciled from payments.';

COMMENT ON COLUMN agos_business_invoices.user_id IS
  'Owning user. No FK per cross-OS contract. Ownership enforced at the BFF route layer.';

COMMENT ON COLUMN agos_business_invoices.deal_id IS
  'Optional link to a deal. No FK — deals are per-OS UUID references.';

COMMENT ON COLUMN agos_business_invoices.contact_id IS
  'Primary client contact. FK SET NULL on contact delete so the invoice record survives.';

COMMENT ON COLUMN agos_business_invoices.project_id IS
  'Optional link to a project. No FK — projects are per-OS UUID references.';

COMMENT ON COLUMN agos_business_invoices.quote_id IS
  'Source quote, if this invoice was created from a quote conversion. No FK — cross-table UUID reference.';

COMMENT ON COLUMN agos_business_invoices.invoice_number IS
  'User-facing invoice number (e.g. "INV-2026-001"). Unique per user.';

COMMENT ON COLUMN agos_business_invoices.status IS
  'Invoice lifecycle state. CHECK-constrained: draft → sent → partial (some payment received) / paid (fully paid) / overdue (past due_on) / voided (cancelled after sending).';

COMMENT ON COLUMN agos_business_invoices.due_on IS
  'Payment due date. Defaults to invoice_date + 30 days on creation.';

COMMENT ON COLUMN agos_business_invoices.terms IS
  'Payment terms (free-form text or preset key from business settings, e.g. "net_30").';

COMMENT ON COLUMN agos_business_invoices.subtotal_cents IS
  'Sum of line_total_cents from line items. Derived — updated by updateInvoiceTotals().';

COMMENT ON COLUMN agos_business_invoices.tax_cents IS
  'Sum of line_tax_cents from line items. Derived.';

COMMENT ON COLUMN agos_business_invoices.total_cents IS
  'subtotal_cents + tax_cents. Derived.';

COMMENT ON COLUMN agos_business_invoices.paid_cents IS
  'Sum of amount_cents from payments. Derived — updated by reconcilePaidCents() after every payment mutation. Status auto-transitions to paid when paid_cents >= total_cents.';

COMMENT ON COLUMN agos_business_invoices.pdf_url IS
  'URL to the generated PDF. Populated by the PDF generation service (future integration). Nullable until generated.';

-- Indexes

-- Main list feed: user's invoices sorted by invoice date descending
CREATE INDEX IF NOT EXISTS agos_business_invoices_user_invoice_date_idx
    ON agos_business_invoices (user_id, invoice_date DESC);

-- Lookup by deal (only for invoices linked to a deal)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_invoices_deal_partial_idx'
    ) THEN
        CREATE INDEX agos_business_invoices_deal_partial_idx
            ON agos_business_invoices (deal_id)
            WHERE deal_id IS NOT NULL;
    END IF;
END$$;

-- Lookup by contact (only for invoices linked to a contact)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_invoices_contact_partial_idx'
    ) THEN
        CREATE INDEX agos_business_invoices_contact_partial_idx
            ON agos_business_invoices (contact_id)
            WHERE contact_id IS NOT NULL;
    END IF;
END$$;

-- Outstanding feed: sent/partial/overdue invoices sorted by due date
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_invoices_outstanding_partial_idx'
    ) THEN
        CREATE INDEX agos_business_invoices_outstanding_partial_idx
            ON agos_business_invoices (user_id, due_on)
            WHERE status IN ('sent', 'partial', 'overdue');
    END IF;
END$$;

-- ═══ 3. agos_business_line_items (NEW) ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agos_business_line_items (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id         UUID         NULL
                                  REFERENCES agos_business_quotes(id)
                                  ON DELETE CASCADE,
    invoice_id       UUID         NULL
                                  REFERENCES agos_business_invoices(id)
                                  ON DELETE CASCADE,
    user_id          UUID         NOT NULL,
    position         INT          NOT NULL DEFAULT 0,
    description      TEXT         NOT NULL DEFAULT '',
    quantity         NUMERIC(12,3) NOT NULL DEFAULT 1,
    unit_label       TEXT         NOT NULL DEFAULT '',
    unit_price_cents BIGINT       NOT NULL DEFAULT 0,
    line_total_cents BIGINT       NOT NULL DEFAULT 0,
    tax_rate_bp      INT          NOT NULL DEFAULT 0,
    line_tax_cents   BIGINT       NOT NULL DEFAULT 0,
    time_entry_ids   UUID[]       NOT NULL DEFAULT '{}',
    metadata         JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT agos_business_line_items_xor_check
        CHECK ((quote_id IS NULL) <> (invoice_id IS NULL))
);

COMMENT ON TABLE agos_business_line_items IS
  'Charge rows shared by quotes and invoices via an XOR parent pattern. Exactly one of quote_id or invoice_id must be non-null (enforced by CHECK constraint). Line totals are precomputed at insert/update to avoid runtime arithmetic in queries. FK CASCADE on both parents — deleting a quote or invoice removes its line items.';

COMMENT ON COLUMN agos_business_line_items.quote_id IS
  'Parent quote. FK CASCADE. Mutually exclusive with invoice_id per XOR CHECK.';

COMMENT ON COLUMN agos_business_line_items.invoice_id IS
  'Parent invoice. FK CASCADE. Mutually exclusive with quote_id per XOR CHECK.';

COMMENT ON COLUMN agos_business_line_items.user_id IS
  'Denormalized from parent document for ownership-filtered queries without a JOIN. Must match the parent quote/invoice user_id (enforced at the repo layer at insert time).';

COMMENT ON COLUMN agos_business_line_items.position IS
  'Integer slot for manual ordering within the parent document. Lower = earlier. Auto-positioned as MAX(position)+1 when not specified.';

COMMENT ON COLUMN agos_business_line_items.quantity IS
  'Line quantity. NUMERIC(12,3) supports fractional quantities (e.g. 2.5 hours) while capping precision at millis.';

COMMENT ON COLUMN agos_business_line_items.unit_price_cents IS
  'Price per unit in minor currency units (cents).';

COMMENT ON COLUMN agos_business_line_items.line_total_cents IS
  'Precomputed line total: ROUND(quantity * unit_price_cents). Recalculated on every update.';

COMMENT ON COLUMN agos_business_line_items.tax_rate_bp IS
  'Tax rate in basis points. 1 bp = 0.01%, so 10000 bp = 100%. Default 0.';

COMMENT ON COLUMN agos_business_line_items.line_tax_cents IS
  'Tax amount: ROUND(line_total_cents * tax_rate_bp / 10000). Recalculated on every update.';

COMMENT ON COLUMN agos_business_line_items.time_entry_ids IS
  'Array of time-entry UUIDs linked to this line item. Enables "bill from time log" workflows where line items are generated from unbilled time entries. GIN-indexed for reverse lookups.';

-- Indexes

-- Ordered by position within a quote
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_line_items_quote_position_partial_idx'
    ) THEN
        CREATE INDEX agos_business_line_items_quote_position_partial_idx
            ON agos_business_line_items (quote_id, position)
            WHERE quote_id IS NOT NULL;
    END IF;
END$$;

-- Ordered by position within an invoice
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_line_items_invoice_position_partial_idx'
    ) THEN
        CREATE INDEX agos_business_line_items_invoice_position_partial_idx
            ON agos_business_line_items (invoice_id, position)
            WHERE invoice_id IS NOT NULL;
    END IF;
END$$;

-- Reverse lookup by time entry (find which line items reference a time entry)
CREATE INDEX IF NOT EXISTS agos_business_line_items_time_entry_ids_gin_idx
    ON agos_business_line_items USING gin (time_entry_ids);

-- ═══ 4. agos_business_payments (NEW) ═════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agos_business_payments (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id   UUID         NOT NULL
                              REFERENCES agos_business_invoices(id)
                              ON DELETE CASCADE,
    user_id      UUID         NOT NULL,
    amount_cents BIGINT       NOT NULL,
    currency     TEXT         NOT NULL DEFAULT 'USD',
    method       TEXT         NOT NULL DEFAULT 'bank_transfer',
    received_on  DATE         NOT NULL DEFAULT CURRENT_DATE,
    reference    TEXT         NULL,
    notes        TEXT         NULL,
    metadata     JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT agos_business_payments_method_check
        CHECK (method IN ('bank_transfer','check','cash','card','stripe','paypal','wire','other'))
);

COMMENT ON TABLE agos_business_payments IS
  'Received-fund records. Each payment is recorded against an invoice. FK CASCADE on invoice_id — deleting an invoice removes its payment history. The repo layer calls reconcilePaidCents() on the parent invoice after every payment mutation to keep paid_cents and status in sync.';

COMMENT ON COLUMN agos_business_payments.invoice_id IS
  'Parent invoice. FK CASCADE — deleting an invoice deletes all its payments. Only draft invoices can be deleted (guarded by the delete function), so cascade-delete only applies to draft-invoice test data.';

COMMENT ON COLUMN agos_business_payments.user_id IS
  'Denormalized from the parent invoice for ownership-filtered queries. Must match the invoice user_id (enforced at the repo layer).';

COMMENT ON COLUMN agos_business_payments.amount_cents IS
  'Payment amount in minor currency units (cents). Always positive — refunds should be recorded as separate negative-amount payments or handled via a Credit Note (future feature).';

COMMENT ON COLUMN agos_business_payments.method IS
  'Payment method. CHECK-constrained to 8 canonical methods: bank_transfer, check, cash, card, stripe, paypal, wire, other.';

COMMENT ON COLUMN agos_business_payments.received_on IS
  'Date the funds were received. Defaults to today on creation.';

COMMENT ON COLUMN agos_business_payments.reference IS
  'External reference number (check number, transaction ID, etc.). Free-form, nullable.';

-- Indexes

-- Per-invoice payment history (detail view)
CREATE INDEX IF NOT EXISTS agos_business_payments_invoice_received_idx
    ON agos_business_payments (invoice_id, received_on DESC);

-- Per-user payment feed (global payments view)
CREATE INDEX IF NOT EXISTS agos_business_payments_user_received_idx
    ON agos_business_payments (user_id, received_on DESC);
"""


_DOWNGRADE_SQL = r"""
-- Reverse dependency order: payments depends on invoices.

DROP TABLE IF EXISTS agos_business_payments;
DROP TABLE IF EXISTS agos_business_line_items;
DROP TABLE IF EXISTS agos_business_invoices;
DROP TABLE IF EXISTS agos_business_quotes;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)

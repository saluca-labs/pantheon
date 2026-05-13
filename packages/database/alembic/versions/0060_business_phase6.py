"""Business OS Phase 6 — Documents and E-Signature.

Revision ID: 0060_business_phase6
Revises: 0059_business_phase5
Create Date: 2026-05-12

Phase 6 introduces document templates, per-engagement documents with lifecycle
tracking, and in-app canvas-based e-signatures.

Schema delta
------------

1. ``agos_business_doc_templates`` (NEW — reusable document templates)
     - ``id UUID PK DEFAULT gen_random_uuid()``
     - ``user_id UUID NOT NULL`` (no FK — cross-OS contract)
     - ``title TEXT NOT NULL``
     - ``kind TEXT NOT NULL DEFAULT 'sow'`` CHECK 7 kinds
     - ``body_md TEXT NOT NULL DEFAULT ''``
     - ``version TEXT NOT NULL DEFAULT '1.0'``
     - ``parent_template_id UUID NULL`` (self-referential version chain)
     - ``tags TEXT[] NOT NULL DEFAULT '{}'``
     - ``metadata JSONB NOT NULL DEFAULT '{}'``
     - ``created_at``, ``updated_at``
     - 3 indexes: (user_id, kind), partial parent_template_id, GIN tags

2. ``agos_business_documents`` (NEW — per-engagement documents)
     - ``id UUID PK DEFAULT gen_random_uuid()``
     - ``user_id UUID NOT NULL`` (no FK)
     - ``template_id UUID NULL REFERENCES doc_templates ON DELETE CASCADE``
     - ``project_id UUID NULL`` (per-OS UUID, no FK)
     - ``deal_id UUID NULL`` (per-OS UUID, no FK)
     - ``contact_id UUID NULL REFERENCES people ON DELETE SET NULL``
     - ``title TEXT NOT NULL``
     - ``body_md TEXT NOT NULL DEFAULT ''``
     - ``status TEXT NOT NULL DEFAULT 'draft'`` CHECK 5 statuses
     - ``sent_at TIMESTAMPTZ NULL``
     - ``signed_at TIMESTAMPTZ NULL``
     - ``pdf_url TEXT NULL``
     - ``metadata JSONB NOT NULL DEFAULT '{}'``
     - ``created_at``, ``updated_at``
     - 3 indexes: (user_id, status, updated_at DESC), partial project_id, partial deal_id

3. ``agos_business_signatures`` (NEW — in-app e-signatures)
     - ``id UUID PK DEFAULT gen_random_uuid()``
     - ``document_id UUID NOT NULL REFERENCES documents ON DELETE CASCADE``
     - ``user_id UUID NOT NULL`` (no FK)
     - ``signer_role TEXT NOT NULL DEFAULT 'counterparty'`` CHECK 3 roles
     - ``signer_name TEXT NOT NULL``
     - ``signer_email TEXT NULL``
     - ``signature_image_url TEXT NOT NULL``
     - ``signed_at TIMESTAMPTZ NOT NULL DEFAULT now()``
     - ``ip_address TEXT NULL``
     - ``user_agent TEXT NULL``
     - ``metadata JSONB NOT NULL DEFAULT '{}'``
     - ``created_at TIMESTAMPTZ NOT NULL DEFAULT now()``
     - 2 indexes: (document_id, signed_at DESC), partial UNIQUE (document_id, signer_role) WHERE signer_role = 'self'

Locked design decisions
-----------------------
- **No FK on user_id anywhere.** Mirrors v0.1.30 cross-OS contract.
  Ownership enforced at the BFF route layer.
- **Template versioning** uses a linked-list via parent_template_id.
  `bumpVersion` creates a new row pointing to the original, with an
  incremented version string.
- **Document status lifecycle:** draft -> sent -> signed (or declined/expired).
  Only draft documents can be edited. Status transitions are enforced at the
  repo layer.
- **Signatures use canvas-based drawing** captured as data URLs stored in
  signature_image_url. No external e-signature provider dependency.
- **Counterparty signature auto-signs:** when a signature with role='counterparty'
  is captured, the document status transitions to 'signed'.
- **Partial unique index on (document_id, signer_role) WHERE signer_role = 'self'**
  ensures at most one self-signature per document.
- **GIN index on tags** supports @> containment queries via the repo's tag filter.

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


revision: str = "0060_business_phase6"
down_revision: Union[str, None] = "0059_business_phase5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- ═══ 1. agos_business_doc_templates (NEW) ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS agos_business_doc_templates (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID         NOT NULL,
    title             TEXT         NOT NULL,
    kind              TEXT         NOT NULL DEFAULT 'sow',
    body_md           TEXT         NOT NULL DEFAULT '',
    version           TEXT         NOT NULL DEFAULT '1.0',
    parent_template_id UUID        NULL,
    tags              TEXT[]       NOT NULL DEFAULT '{}',
    metadata          JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT agos_business_doc_templates_kind_check
        CHECK (kind IN ('nda','sow','msa','proposal','1099','invoice_terms','other'))
);

COMMENT ON TABLE agos_business_doc_templates IS
  'Reusable document templates for NDA, SOW, MSA, proposals, 1099s, invoice terms, and custom types. Supports versioning via parent_template_id linked list. Templates are cloned into per-engagement documents.';

COMMENT ON COLUMN agos_business_doc_templates.user_id IS
  'Owning user. No FK — ownership is enforced at the BFF route layer per the v0.1.30 cross-OS contract.';

COMMENT ON COLUMN agos_business_doc_templates.title IS
  'Human-readable template name (e.g. "Standard Mutual NDA", "Fixed-Price SOW").';

COMMENT ON COLUMN agos_business_doc_templates.kind IS
  'Document kind. CHECK-constrained to 7 values: nda, sow, msa, proposal, 1099, invoice_terms, other.';

COMMENT ON COLUMN agos_business_doc_templates.body_md IS
  'Template body in Markdown. Supports {{var}} substitution patterns (e.g. {{client_name}}, {{project_title}}, {{rate}}, {{total}}).';

COMMENT ON COLUMN agos_business_doc_templates.version IS
  'Semantic version string (e.g. "1.0", "2.1"). Bumped via the bumpVersion repo method which creates a new row.';

COMMENT ON COLUMN agos_business_doc_templates.parent_template_id IS
  'Points to the previous version of this template. Forms a linked list for version history. NULL for original / root versions.';

COMMENT ON COLUMN agos_business_doc_templates.tags IS
  'Free-form tag array for filtering and grouping. GIN-indexed for efficient containment queries.';

-- Indexes

-- Lookup by kind for a user
CREATE INDEX IF NOT EXISTS agos_business_doc_templates_user_kind_idx
    ON agos_business_doc_templates (user_id, kind);

-- Version chain: find children of a template
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_doc_templates_parent_partial_idx'
    ) THEN
        CREATE INDEX agos_business_doc_templates_parent_partial_idx
            ON agos_business_doc_templates (parent_template_id)
            WHERE parent_template_id IS NOT NULL;
    END IF;
END$$;

-- GIN on tags for containment queries
CREATE INDEX IF NOT EXISTS agos_business_doc_templates_tags_gin_idx
    ON agos_business_doc_templates USING gin (tags);


-- ═══ 2. agos_business_documents (NEW) ════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agos_business_documents (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID         NOT NULL,
    template_id  UUID         NULL REFERENCES agos_business_doc_templates(id) ON DELETE CASCADE,
    project_id   UUID         NULL,
    deal_id      UUID         NULL,
    contact_id   UUID         NULL REFERENCES agos_business_people(id) ON DELETE SET NULL,
    title        TEXT         NOT NULL,
    body_md      TEXT         NOT NULL DEFAULT '',
    status       TEXT         NOT NULL DEFAULT 'draft',
    sent_at      TIMESTAMPTZ  NULL,
    signed_at    TIMESTAMPTZ  NULL,
    pdf_url      TEXT         NULL,
    metadata     JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT agos_business_documents_status_check
        CHECK (status IN ('draft','sent','signed','declined','expired'))
);

COMMENT ON TABLE agos_business_documents IS
  'Per-engagement documents with lifecycle tracking (draft -> sent -> signed/declined/expired). Created from templates with variable substitution. Linked to projects, deals, and contacts for contextual tracking.';

COMMENT ON COLUMN agos_business_documents.user_id IS
  'Owning user. No FK — ownership is enforced at the BFF route layer.';

COMMENT ON COLUMN agos_business_documents.template_id IS
  'Source template. FK to agos_business_doc_templates with ON DELETE CASCADE — deleting a template does not delete documents already created from it (the column is set to NULL).';

COMMENT ON COLUMN agos_business_documents.project_id IS
  'Optional link to a project. No FK — projects are per-OS UUID references resolved at the BFF layer.';

COMMENT ON COLUMN agos_business_documents.deal_id IS
  'Optional link to a deal. No FK — deals are per-OS UUID references resolved at the BFF layer.';

COMMENT ON COLUMN agos_business_documents.contact_id IS
  'Linked contact (counterparty). FK to agos_business_people with ON DELETE SET NULL — deleting a person unlinks but preserves the document.';

COMMENT ON COLUMN agos_business_documents.title IS
  'Document title (e.g. "SOW — Q2 Security Assessment").';

COMMENT ON COLUMN agos_business_documents.body_md IS
  'Document body in Markdown. Populated from template body_md with variable substitution at creation time.';

COMMENT ON COLUMN agos_business_documents.status IS
  'Document lifecycle status. CHECK-constrained: draft (editable), sent (awaiting signature), signed (executed), declined, expired.';

COMMENT ON COLUMN agos_business_documents.sent_at IS
  'Timestamp when the document was sent to the counterparty. Set by the sendDocument repo method.';

COMMENT ON COLUMN agos_business_documents.signed_at IS
  'Timestamp when the document was fully signed. Set by the signDocument repo method (triggered automatically on counterparty signature capture).';

COMMENT ON COLUMN agos_business_documents.pdf_url IS
  'URL to the rendered PDF export. Set via setDocumentPdfUrl after PDF rendering. Nullable until first export.';

-- Indexes

-- Main list feed: user's documents sorted by status and updated time
CREATE INDEX IF NOT EXISTS agos_business_documents_user_status_updated_idx
    ON agos_business_documents (user_id, status, updated_at DESC);

-- Lookup by project (only for documents linked to a project)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_documents_project_partial_idx'
    ) THEN
        CREATE INDEX agos_business_documents_project_partial_idx
            ON agos_business_documents (project_id, updated_at DESC)
            WHERE project_id IS NOT NULL;
    END IF;
END$$;

-- Lookup by deal (only for documents linked to a deal)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_documents_deal_partial_idx'
    ) THEN
        CREATE INDEX agos_business_documents_deal_partial_idx
            ON agos_business_documents (deal_id, updated_at DESC)
            WHERE deal_id IS NOT NULL;
    END IF;
END$$;


-- ═══ 3. agos_business_signatures (NEW) ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agos_business_signatures (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         UUID         NOT NULL REFERENCES agos_business_documents(id) ON DELETE CASCADE,
    user_id             UUID         NOT NULL,
    signer_role         TEXT         NOT NULL DEFAULT 'counterparty',
    signer_name         TEXT         NOT NULL,
    signer_email        TEXT         NULL,
    signature_image_url TEXT         NOT NULL,
    signed_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    ip_address          TEXT         NULL,
    user_agent          TEXT         NULL,
    metadata            JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT agos_business_signatures_signer_role_check
        CHECK (signer_role IN ('self','counterparty','witness'))
);

COMMENT ON TABLE agos_business_signatures IS
  'In-app canvas-based e-signatures. Captured via HTML canvas drawing widget and stored as data URLs. Counterparty signatures auto-transition the parent document to signed status.';

COMMENT ON COLUMN agos_business_signatures.document_id IS
  'Parent document. FK to agos_business_documents with ON DELETE CASCADE — deleting a document removes all associated signatures.';

COMMENT ON COLUMN agos_business_signatures.user_id IS
  'Owning user. No FK — ownership is enforced at the BFF route layer.';

COMMENT ON COLUMN agos_business_signatures.signer_role IS
  'Role of the signer. CHECK-constrained: self (document owner), counterparty (client/vendor), witness. A partial unique index ensures at most one self-signature per document.';

COMMENT ON COLUMN agos_business_signatures.signer_name IS
  'Full name of the signer as entered at signature time.';

COMMENT ON COLUMN agos_business_signatures.signer_email IS
  'Email of the signer. Nullable — optional for in-person / local signatures.';

COMMENT ON COLUMN agos_business_signatures.signature_image_url IS
  'Canvas-rendered signature as a PNG data URL (data:image/png;base64,...). Captured client-side and posted to the API.';

COMMENT ON COLUMN agos_business_signatures.signed_at IS
  'Timestamp when the signature was captured. Defaults to now().';

COMMENT ON COLUMN agos_business_signatures.ip_address IS
  'IP address of the signer at capture time. Nullable — captured from request headers when available.';

COMMENT ON COLUMN agos_business_signatures.user_agent IS
  'User-Agent string of the signer at capture time. Nullable.';

-- Indexes

-- Per-document signatures sorted by time
CREATE INDEX IF NOT EXISTS agos_business_signatures_doc_signed_idx
    ON agos_business_signatures (document_id, signed_at DESC);

-- Ensure at most one self-signature per document
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_signatures_doc_self_unique_idx'
    ) THEN
        CREATE UNIQUE INDEX agos_business_signatures_doc_self_unique_idx
            ON agos_business_signatures (document_id, signer_role)
            WHERE signer_role = 'self';
    END IF;
END$$;
"""


_DOWNGRADE_SQL = r"""
DROP TABLE IF EXISTS agos_business_signatures;
DROP TABLE IF EXISTS agos_business_documents;
DROP TABLE IF EXISTS agos_business_doc_templates;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
